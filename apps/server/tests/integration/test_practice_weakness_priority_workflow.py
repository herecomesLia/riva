import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from riva.agents import QuestionGenerationAgent
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.models import (
    AgentRun,
    PracticeAttempt,
    PracticeReview,
    PracticeSession,
    QuestionCard,
    User,
)
from riva.schemas.question_generation import QuestionGenerationWeaknessEvidence
from riva.schemas.question_cards import QuestionCardQuestionType
from riva.services.practice_sessions import (
    PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
    PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE,
    PracticeSessionService,
    PracticeSessionStateError,
)
from riva.services.practice_weaknesses import PracticeWeaknessService
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_practice_history_workflow import (
    advance_history_to_review,
    generate_history_card,
    seed_completed_attempt,
)
from tests.integration.test_practice_next_question_workflow import (
    FailingQuestionGenerationService,
    build_worker,
    produce_first_review,
    question_output,
)
from tests.integration.test_practice_saved_workflow import generate_saved_card
from tests.integration.test_question_generation import database_url, seed_context


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


def settings(url: str, *, llm_enabled: bool) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen" if llm_enabled else None,
        llm_model="fake-practice-model" if llm_enabled else None,
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="practice-weakness-priority-test-key",
        session_cookie_secure=False,
    )


async def count_sessions(database: Database, user_id: UUID) -> int:
    async with database.sessionmaker() as session:
        return int(
            await session.scalar(
                select(func.count(PracticeSession.id)).where(
                    PracticeSession.user_id == user_id
                )
            )
            or 0
        )


def test_personalized_priority_snapshots_focus_and_runs_v2_worker() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    owner_id,
                    reviewed_session_id,
                    reviewed_attempt_id,
                    _reviewed_card_id,
                    _reviewed_question_run_id,
                    project_id,
                ) = await produce_first_review(database)

                async with database.sessionmaker() as session:
                    completed = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).complete_session_after_review(
                        user_id=owner_id,
                        session_id=reviewed_session_id,
                        expected_version=5,
                    )
                    assert completed.session.status == "completed"
                    role_id = completed.session.target_role_id
                    owner = await session.get(User, owner_id)
                    assert owner is not None

                async with database.sessionmaker() as session:
                    question_runs_before = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner_id,
                                    AgentRun.agent_id == "question-generator",
                                )
                            )
                        ).all()
                    )

                app = create_app(settings(url, llm_enabled=True))
                app.dependency_overrides[require_current_user] = lambda: owner
                with TestClient(app) as client:
                    headers = {
                        "Origin": TRUSTED_ORIGIN,
                        "Accept-Language": "en-US",
                    }
                    setup = client.get("/api/practice/setup", headers=headers)
                    assert setup.status_code == 200
                    assert setup.json()["canPrioritizeWeaknesses"] is True

                    started = client.post(
                        "/api/practice/sessions",
                        json={
                            "targetRoleId": str(role_id),
                            "questionType": "projectDeepDive",
                            "difficulty": "basic",
                            "source": "personalized",
                            "prioritizeWeaknesses": True,
                        },
                        headers=headers,
                    )
                    assert started.status_code == 202
                    started_body = started.json()
                    assert started_body["status"] == "generatingQuestion"
                    assert started_body["selection"]["prioritizeWeaknesses"] is True
                    session_id = UUID(started_body["sessionId"])

                async with database.sessionmaker() as session:
                    attempt = await session.scalar(
                        select(PracticeAttempt).where(
                            PracticeAttempt.session_id == session_id
                        )
                    )
                    assert attempt is not None
                    assert attempt.question_generation_run_id is not None
                    run = await session.get(
                        AgentRun,
                        attempt.question_generation_run_id,
                    )
                    assert run is not None
                    assert run.prompt_version == "3"
                    assert run.payload["weaknessFocus"][0]["sourceAttemptId"] == str(
                        reviewed_attempt_id
                    )

                assert len(
                    question_runs_before
                ) + 1 == len(
                    (
                        await session_count_question_runs(
                            database,
                            owner_id,
                        )
                    )
                )

                assert await build_worker(
                    database,
                    QuestionGenerationAgent(
                        FakeLLMProvider(
                            [
                                question_output(
                                    project_id,
                                    prompt="Explain a decision where you showed ownership.",
                                )
                            ],
                            provider="weakness-priority-question-provider",
                        ),
                        model="fake-practice-model",
                    ),
                ).process_one()

                with TestClient(app) as client:
                    refreshed = client.post(
                        f"/api/practice/sessions/{session_id}/question-generation/refresh",
                        json={"version": 1},
                        headers={
                            "Origin": TRUSTED_ORIGIN,
                            "Accept-Language": "en-US",
                        },
                    )
                    assert refreshed.status_code == 200
                    assert refreshed.json()["status"] == "answering"
            finally:
                await database.reset()

    asyncio.run(run_test())


async def session_count_question_runs(database: Database, user_id: UUID) -> int:
    async with database.sessionmaker() as session:
        return int(
            await session.scalar(
                select(func.count(AgentRun.id)).where(
                    AgentRun.user_id == user_id,
                    AgentRun.agent_id == "question-generator",
                )
            )
            or 0
        )


async def prepare_completed_reviewed_card(
    database: Database,
) -> tuple[User, UUID, UUID, UUID, UUID]:
    (
        user_id,
        reviewed_session_id,
        reviewed_attempt_id,
        _reviewed_card_id,
        _reviewed_question_run_id,
        project_id,
    ) = await produce_first_review(database)

    async with database.sessionmaker() as session:
        previous_review = await session.scalar(
            select(PracticeReview).where(
                PracticeReview.attempt_id == reviewed_attempt_id
            )
        )
        assert previous_review is not None
        previous_review.exposed_weaknesses = ["Previous weakness"]
        completed = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).complete_session_after_review(
            user_id=user_id,
            session_id=reviewed_session_id,
            expected_version=5,
        )
        owner = await session.get(User, user_id)
        assert owner is not None
        role_id = completed.session.target_role_id

    return owner, role_id, project_id, reviewed_attempt_id, _reviewed_card_id


async def create_priority_answering_session(database: Database, url: str):
    (
        owner,
        role_id,
        project_id,
        reviewed_attempt_id,
        _reviewed_card_id,
    ) = await prepare_completed_reviewed_card(database)

    app = create_app(settings(url, llm_enabled=True))
    app.dependency_overrides[require_current_user] = lambda: owner
    headers = {
        "Origin": TRUSTED_ORIGIN,
        "Accept-Language": "en-US",
    }
    with TestClient(app) as client:
        started = client.post(
            "/api/practice/sessions",
            json={
                "targetRoleId": str(role_id),
                "questionType": "projectDeepDive",
                "difficulty": "basic",
                "source": "personalized",
                "prioritizeWeaknesses": True,
            },
            headers=headers,
        )
        assert started.status_code == 202
        started_body = started.json()
        assert started_body["status"] == "generatingQuestion"
        session_id = UUID(started_body["sessionId"])
        attempt_id = UUID(started_body["attemptId"])

    assert await build_worker(
        database,
        QuestionGenerationAgent(
            FakeLLMProvider(
                [
                    question_output(
                        project_id,
                        prompt="Explain a priority practice decision.",
                    )
                ],
                provider="weakness-priority-answering-question-provider",
            ),
            model="fake-practice-model",
        ),
    ).process_one()

    with TestClient(app) as client:
        refreshed = client.post(
            f"/api/practice/sessions/{session_id}/question-generation/refresh",
            json={"version": 1},
            headers=headers,
        )
        assert refreshed.status_code == 200
        refreshed_body = refreshed.json()
        assert refreshed_body["status"] == "answering"
        question_id = UUID(refreshed_body["question"]["id"])

    return (
        owner,
        role_id,
        project_id,
        session_id,
        attempt_id,
        question_id,
        app,
        headers,
        reviewed_attempt_id,
    )


async def weakness_focus_snapshot(
    database: Database,
    *,
    user_id: UUID,
    target_role_id: UUID,
    question_type: QuestionCardQuestionType,
    interaction_language: str = "en",
) -> list[dict[str, object]]:
    async with database.sessionmaker() as session:
        focus = await PracticeWeaknessService(session).get_focus(
            user_id=user_id,
            target_role_id=target_role_id,
            question_type=question_type,
            interaction_language=interaction_language,
        )
    return [
        QuestionGenerationWeaknessEvidence(
            weakness=evidence.weakness,
            sourceAttemptId=evidence.source_attempt_id,
            sourceTargetRoleId=evidence.source_target_role_id,
            sourceQuestionType=evidence.source_question_type,
            reviewedAt=evidence.reviewed_at,
        ).model_dump(mode="json", by_alias=True)
        for evidence in focus.evidence
    ]


def test_priority_without_eligible_weakness_does_not_create_session() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, _project_id = await seed_context(database)
                app = create_app(settings(url, llm_enabled=True))
                app.dependency_overrides[require_current_user] = lambda: owner
                before = await count_sessions(database, owner.id)
                with TestClient(app) as client:
                    response = client.post(
                        "/api/practice/sessions",
                        json={
                            "targetRoleId": str(role.id),
                            "questionType": "projectDeepDive",
                            "difficulty": "basic",
                            "source": "personalized",
                            "prioritizeWeaknesses": True,
                        },
                        headers={
                            "Origin": TRUSTED_ORIGIN,
                            "Accept-Language": "en-US",
                        },
                    )
                assert response.status_code == 409
                assert response.json() == {
                    "error": PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE
                }
                assert await count_sessions(database, owner.id) == before
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_saved_and_history_priority_reuse_cards_without_llm_or_new_question_run() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                for source in ("saved", "history"):
                    await database.reset()
                    (
                        owner_id,
                        reviewed_session_id,
                        _reviewed_attempt_id,
                        card_id,
                        _question_run_id,
                        _project_id,
                    ) = await produce_first_review(database)
                    async with database.sessionmaker() as session:
                        completed = await PracticeSessionService(
                            session,
                            llm_model="fake-practice-model",
                        ).complete_session_after_review(
                            user_id=owner_id,
                            session_id=reviewed_session_id,
                            expected_version=5,
                        )
                        card = await session.get(QuestionCard, card_id)
                        owner = await session.get(User, owner_id)
                        assert card is not None
                        assert owner is not None
                        if source == "saved":
                            card.is_saved = True
                            await session.commit()
                        role_id = completed.session.target_role_id

                    before = await session_count_question_runs(database, owner_id)
                    app = create_app(settings(url, llm_enabled=False))
                    app.dependency_overrides[require_current_user] = lambda: owner
                    with TestClient(app) as client:
                        started = client.post(
                            "/api/practice/sessions",
                            json={
                                "targetRoleId": str(role_id),
                                "questionType": "projectDeepDive",
                                "difficulty": "basic",
                                "source": source,
                                "prioritizeWeaknesses": True,
                            },
                            headers={
                                "Origin": TRUSTED_ORIGIN,
                                "Accept-Language": "en-US",
                            },
                        )
                    assert started.status_code == 202
                    body = started.json()
                    assert body["status"] == "answering"
                    assert body["question"]["id"] == str(card_id)
                    async with database.sessionmaker() as session:
                        attempt = await session.get(
                            PracticeAttempt,
                            UUID(body["attemptId"]),
                        )
                        assert attempt is not None
                        assert attempt.question_generation_run_id is None
                    assert await session_count_question_runs(database, owner_id) == before
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_personalized_priority_continue_completes_current_attempt_before_snapshot() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    owner,
                    role_id,
                    _project_id,
                    session_id,
                    current_attempt_id,
                    question_id,
                    app,
                    headers,
                    _reviewed_attempt_id,
                ) = await create_priority_answering_session(database, url)

                with TestClient(app) as client:
                    review = await advance_history_to_review(
                        database,
                        client,
                        headers=headers,
                        session_id=session_id,
                        version=2,
                        question_id=question_id,
                        suffix="priority-continue",
                    )
                    assert review["status"] == "review"
                    assert review["version"] == 5

                    next_question = client.post(
                        f"/api/practice/sessions/{session_id}/questions/next",
                        json={
                            "version": review["version"],
                            "questionId": str(question_id),
                        },
                        headers=headers,
                    )
                    assert next_question.status_code == 202
                    next_body = next_question.json()
                    assert next_body["status"] == "generatingQuestion"
                    assert next_body["version"] == 6

                next_attempt_id = UUID(next_body["attemptId"])
                async with database.sessionmaker() as session:
                    current_attempt = await session.get(
                        PracticeAttempt,
                        current_attempt_id,
                    )
                    next_attempt = await session.get(
                        PracticeAttempt,
                        next_attempt_id,
                    )
                    assert current_attempt is not None
                    assert next_attempt is not None
                    assert current_attempt.status == "completed"
                    assert current_attempt.completed_at is not None
                    assert next_attempt.attempt_number == 2
                    assert next_attempt.question_generation_run_id is not None
                    generation_run = await session.get(
                        AgentRun,
                        next_attempt.question_generation_run_id,
                    )
                    assert generation_run is not None
                    assert generation_run.prompt_version == "3"
                    focus = generation_run.payload["weaknessFocus"]
                    assert any(
                        item["sourceAttemptId"] == str(current_attempt_id)
                        for item in focus
                    )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_personalized_priority_skip_replaces_attempt_with_focus_snapshot() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    owner,
                    role_id,
                    _project_id,
                    session_id,
                    current_attempt_id,
                    question_id,
                    app,
                    headers,
                    _reviewed_attempt_id,
                ) = await create_priority_answering_session(database, url)
                expected_focus = await weakness_focus_snapshot(
                    database,
                    user_id=owner.id,
                    target_role_id=role_id,
                    question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                )
                question_runs_before = await session_count_question_runs(
                    database,
                    owner.id,
                )

                with TestClient(app) as client:
                    skipped = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={
                            "version": 2,
                            "questionId": str(question_id),
                        },
                        headers=headers,
                    )
                assert skipped.status_code == 202
                skipped_body = skipped.json()
                assert skipped_body["status"] == "generatingQuestion"
                assert skipped_body["version"] == 3
                replacement_attempt_id = UUID(skipped_body["attemptId"])
                assert replacement_attempt_id != current_attempt_id

                async with database.sessionmaker() as session:
                    original = await session.get(
                        PracticeAttempt,
                        current_attempt_id,
                    )
                    replacement = await session.get(
                        PracticeAttempt,
                        replacement_attempt_id,
                    )
                    assert original is None
                    assert replacement is not None
                    assert replacement.attempt_number == 1
                    assert replacement.question_generation_run_id is not None
                    generation_run = await session.get(
                        AgentRun,
                        replacement.question_generation_run_id,
                    )
                    assert generation_run is not None
                    assert generation_run.prompt_version == "3"
                    assert generation_run.payload["weaknessFocus"] == expected_focus

                assert await session_count_question_runs(database, owner.id) == (
                    question_runs_before + 1
                )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_personalized_priority_continue_rolls_back_on_enqueue_failure() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    owner,
                    _role_id,
                    _project_id,
                    session_id,
                    current_attempt_id,
                    question_id,
                    _app,
                    _headers,
                    _reviewed_attempt_id,
                ) = await create_priority_answering_session(database, url)
                app = create_app(settings(url, llm_enabled=True))
                app.dependency_overrides[require_current_user] = lambda: owner
                headers = {
                    "Origin": TRUSTED_ORIGIN,
                    "Accept-Language": "en-US",
                }
                with TestClient(app) as client:
                    review = await advance_history_to_review(
                        database,
                        client,
                        headers=headers,
                        session_id=session_id,
                        version=2,
                        question_id=question_id,
                        suffix="priority-rollback",
                    )
                question_runs_before = await session_count_question_runs(
                    database,
                    owner.id,
                )

                async with database.sessionmaker() as session:
                    with pytest.raises(PracticeSessionStateError) as error:
                        await PracticeSessionService(
                            session,
                            llm_model="fake-practice-model",
                            question_generation_service_factory=(
                                lambda *_args, **_kwargs: FailingQuestionGenerationService()
                            ),
                        ).continue_to_next_question(
                            user_id=owner.id,
                            session_id=session_id,
                            expected_version=review["version"],
                            question_id=question_id,
                        )
                    assert error.value.code == PRACTICE_QUESTION_GENERATION_UNAVAILABLE

                async with database.sessionmaker() as session:
                    practice_session = await session.get(
                        PracticeSession,
                        session_id,
                    )
                    attempts = list(
                        (
                            await session.scalars(
                                select(PracticeAttempt).where(
                                    PracticeAttempt.session_id == session_id
                                )
                            )
                        ).all()
                    )
                    assert practice_session is not None
                    assert practice_session.version == review["version"]
                    assert len(attempts) == 1
                    assert attempts[0].id == current_attempt_id
                    assert attempts[0].status == "review"
                assert await session_count_question_runs(database, owner.id) == (
                    question_runs_before
                )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_saved_priority_prefers_weakness_card_without_generation() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    owner,
                    role_id,
                    project_id,
                    reviewed_attempt_id,
                    weakness_card_id,
                ) = await prepare_completed_reviewed_card(database)
                focus = await weakness_focus_snapshot(
                    database,
                    user_id=owner.id,
                    target_role_id=role_id,
                    question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                )
                assert any(
                    item["sourceAttemptId"] == str(reviewed_attempt_id)
                    for item in focus
                )
                async with database.sessionmaker() as session:
                    weakness_card = await session.get(
                        QuestionCard,
                        weakness_card_id,
                    )
                    assert weakness_card is not None
                    weakness_card.is_saved = True
                    await session.commit()

                default_card = await generate_saved_card(
                    database,
                    user_id=owner.id,
                    role_id=role_id,
                    project_id=project_id,
                    prompt="The default saved question should be selected first.",
                    idempotency_key="priority-saved-default",
                )
                async with database.sessionmaker() as session:
                    persisted_default = await session.get(
                        QuestionCard,
                        default_card.id,
                    )
                    persisted_weakness = await session.get(
                        QuestionCard,
                        weakness_card_id,
                    )
                    assert persisted_default is not None
                    assert persisted_weakness is not None
                    persisted_default.created_at = (
                        persisted_weakness.created_at - timedelta(minutes=1)
                    )
                    await session.commit()

                question_runs_before = await session_count_question_runs(
                    database,
                    owner.id,
                )
                app = create_app(settings(url, llm_enabled=False))
                app.dependency_overrides[require_current_user] = lambda: owner
                headers = {
                    "Origin": TRUSTED_ORIGIN,
                    "Accept-Language": "en-US",
                }
                with TestClient(app) as client:
                    ordinary = client.post(
                        "/api/practice/sessions",
                        json={
                            "targetRoleId": str(role_id),
                            "questionType": "projectDeepDive",
                            "difficulty": "basic",
                            "source": "saved",
                            "prioritizeWeaknesses": False,
                        },
                        headers=headers,
                    )
                    assert ordinary.status_code == 202
                    assert ordinary.json()["question"]["id"] == str(default_card.id)
                    ended = client.post(
                        f"/api/practice/sessions/{ordinary.json()['sessionId']}/end",
                        json={
                            "version": 1,
                            "questionId": ordinary.json()["question"]["id"],
                        },
                        headers=headers,
                    )
                    assert ended.status_code == 200

                    prioritized = client.post(
                        "/api/practice/sessions",
                        json={
                            "targetRoleId": str(role_id),
                            "questionType": "projectDeepDive",
                            "difficulty": "basic",
                            "source": "saved",
                            "prioritizeWeaknesses": True,
                        },
                        headers=headers,
                    )
                assert prioritized.status_code == 202
                prioritized_body = prioritized.json()
                assert prioritized_body["status"] == "answering"
                assert prioritized_body["question"]["id"] == str(weakness_card_id)
                assert await session_count_question_runs(database, owner.id) == (
                    question_runs_before
                )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_history_priority_prefers_weakness_card_without_generation() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    owner,
                    role_id,
                    project_id,
                    reviewed_attempt_id,
                    weakness_card_id,
                ) = await prepare_completed_reviewed_card(database)
                focus = await weakness_focus_snapshot(
                    database,
                    user_id=owner.id,
                    target_role_id=role_id,
                    question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                )
                assert any(
                    item["sourceAttemptId"] == str(reviewed_attempt_id)
                    for item in focus
                )
                default_card, _default_run = await generate_history_card(
                    database,
                    user_id=owner.id,
                    role_id=role_id,
                    project_id=project_id,
                    prompt="The default history question should be selected first.",
                    idempotency_key="priority-history-default",
                )
                await seed_completed_attempt(
                    database,
                    user_id=owner.id,
                    role_id=role_id,
                    card=default_card,
                    completed_at=datetime.now(UTC) + timedelta(minutes=1),
                )

                question_runs_before = await session_count_question_runs(
                    database,
                    owner.id,
                )
                app = create_app(settings(url, llm_enabled=False))
                app.dependency_overrides[require_current_user] = lambda: owner
                headers = {
                    "Origin": TRUSTED_ORIGIN,
                    "Accept-Language": "en-US",
                }
                with TestClient(app) as client:
                    ordinary = client.post(
                        "/api/practice/sessions",
                        json={
                            "targetRoleId": str(role_id),
                            "questionType": "projectDeepDive",
                            "difficulty": "basic",
                            "source": "history",
                            "prioritizeWeaknesses": False,
                        },
                        headers=headers,
                    )
                    assert ordinary.status_code == 202
                    assert ordinary.json()["question"]["id"] == str(default_card.id)
                    ended = client.post(
                        f"/api/practice/sessions/{ordinary.json()['sessionId']}/end",
                        json={
                            "version": 1,
                            "questionId": ordinary.json()["question"]["id"],
                        },
                        headers=headers,
                    )
                    assert ended.status_code == 200

                    prioritized = client.post(
                        "/api/practice/sessions",
                        json={
                            "targetRoleId": str(role_id),
                            "questionType": "projectDeepDive",
                            "difficulty": "basic",
                            "source": "history",
                            "prioritizeWeaknesses": True,
                        },
                        headers=headers,
                    )
                assert prioritized.status_code == 202
                prioritized_body = prioritized.json()
                assert prioritized_body["status"] == "answering"
                assert prioritized_body["question"]["id"] == str(weakness_card_id)
                assert await session_count_question_runs(database, owner.id) == (
                    question_runs_before
                )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_reused_priority_falls_back_when_weakness_card_is_not_a_candidate() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                for source in ("saved", "history"):
                    await database.reset()
                    (
                        owner,
                        role_id,
                        project_id,
                        _reviewed_attempt_id,
                        weakness_card_id,
                    ) = await prepare_completed_reviewed_card(database)

                    if source == "saved":
                        candidate_card = await generate_saved_card(
                            database,
                            user_id=owner.id,
                            role_id=role_id,
                            project_id=project_id,
                            prompt="A saved fallback candidate.",
                            idempotency_key="priority-saved-fallback",
                        )
                    else:
                        candidate_card, _candidate_run = await generate_history_card(
                            database,
                            user_id=owner.id,
                            role_id=role_id,
                            project_id=project_id,
                            prompt="A history fallback candidate.",
                            idempotency_key="priority-history-fallback",
                            question_type=QuestionCardQuestionType.BEHAVIORAL,
                        )
                        await seed_completed_attempt(
                            database,
                            user_id=owner.id,
                            role_id=role_id,
                            card=candidate_card,
                            completed_at=datetime.now(UTC) + timedelta(minutes=1),
                        )

                    question_runs_before = await session_count_question_runs(
                        database,
                        owner.id,
                    )
                    app = create_app(settings(url, llm_enabled=False))
                    app.dependency_overrides[require_current_user] = lambda: owner
                    headers = {
                        "Origin": TRUSTED_ORIGIN,
                        "Accept-Language": "en-US",
                    }
                    question_type = (
                        "projectDeepDive"
                        if source == "saved"
                        else "behavioral"
                    )
                    with TestClient(app) as client:
                        started = client.post(
                            "/api/practice/sessions",
                            json={
                                "targetRoleId": str(role_id),
                                "questionType": question_type,
                                "difficulty": "basic",
                                "source": source,
                                "prioritizeWeaknesses": True,
                            },
                            headers=headers,
                        )
                    assert started.status_code == 202
                    body = started.json()
                    assert body["status"] == "answering"
                    assert body["question"]["id"] == str(candidate_card.id)
                    assert body["question"]["id"] != str(weakness_card_id)
                    assert await session_count_question_runs(database, owner.id) == (
                        question_runs_before
                    )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_priority_completed_session_training_record_preserves_setup_flag() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    _owner,
                    _role_id,
                    _project_id,
                    session_id,
                    _attempt_id,
                    question_id,
                    app,
                    headers,
                    _reviewed_attempt_id,
                ) = await create_priority_answering_session(database, url)

                with TestClient(app) as client:
                    review = await advance_history_to_review(
                        database,
                        client,
                        headers=headers,
                        session_id=session_id,
                        version=2,
                        question_id=question_id,
                        suffix="priority-record",
                    )
                    completed = client.post(
                        f"/api/practice/sessions/{session_id}/complete",
                        json={"version": review["version"]},
                        headers=headers,
                    )
                    assert completed.status_code == 200
                    assert completed.json()["status"] == "completed"

                    record = client.get(
                        f"/api/training-records/practice/{session_id}",
                        headers=headers,
                    )
                assert record.status_code == 200
                body = record.json()
                assert body["status"] == "completed"
                assert body["setup"] == {
                    "source": "personalized",
                    "prioritizeWeaknesses": True,
                }
            finally:
                await database.reset()

    asyncio.run(run_test())
