import asyncio
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.agents import (
    FollowUpAgent,
    PracticeEvaluationAgent,
    PracticeRecommendationAgent,
    PracticeReviewAgent,
    QuestionGenerationAgent,
)
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.models import (
    AgentRun,
    PracticeAttempt,
    PracticeSession,
    QuestionCard,
    TargetRole,
    User,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.services.practice_sessions import (
    PRACTICE_SESSION_SOURCE_UNAVAILABLE,
    PracticeSessionService,
)
from riva.services.question_generation import QuestionGenerationService
from tests.helpers.llm import FakeLLMProvider
from tests.helpers.practice_reference_answers import (
    complete_queued_reference_answers,
)
from tests.integration.test_practice_next_question_workflow import (
    build_worker,
    evaluation_output,
    recommendation_output,
    question_output,
    produce_first_review,
    review_output,
)
from tests.integration.test_question_generation import database_url, seed_context


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


class FailingQuestionGenerationService:
    async def enqueue_generation_in_transaction(self, **kwargs: object) -> AgentRun:
        raise AssertionError("saved workflow must not enqueue question generation")


def settings(url: str, *, llm_enabled: bool = False) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen" if llm_enabled else None,
        llm_model="fake-practice-model" if llm_enabled else None,
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="practice-saved-workflow-test-key",
        session_cookie_secure=False,
    )


async def seed_saved_cards(
    database: Database,
) -> tuple[User, TargetRole, list[QuestionCard]]:
    owner, role, _profile, project_id = await seed_context(database)
    async with database.sessionmaker() as session:
        for index in range(2):
            await QuestionGenerationService(
                session,
                llm_model="fake-practice-model",
            ).enqueue_generation(
                user_id=owner.id,
                target_role_id=role.id,
                question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                difficulty=QuestionCardDifficulty.BASIC,
                interaction_language="en",
                idempotency_key=f"saved-question-{index}",
            )

    worker = build_worker(
        database,
        QuestionGenerationAgent(
            FakeLLMProvider(
                [
                    question_output(
                        project_id,
                        prompt="Explain the first payment workflow decision.",
                    ),
                    question_output(
                        project_id,
                        prompt="Explain the second payment workflow decision.",
                    ),
                ],
                provider="saved-question-provider",
            ),
            model="fake-practice-model",
        ),
    )
    assert await worker.process_one() is True
    assert await worker.process_one() is True

    async with database.sessionmaker() as session:
        cards = list(
            (
                await session.scalars(
                    select(QuestionCard)
                    .where(
                        QuestionCard.user_id == owner.id,
                        QuestionCard.target_role_id == role.id,
                    )
                    .order_by(QuestionCard.created_at, QuestionCard.id)
                )
            ).all()
        )
        assert len(cards) == 2
        for card in cards:
            card.is_saved = True
        cards[0].is_marked_weak = True
        await session.commit()
        return owner, role, cards


async def generate_saved_card(
    database: Database,
    *,
    user_id: UUID,
    role_id: UUID,
    project_id: UUID,
    prompt: str,
    idempotency_key: str,
) -> QuestionCard:
    async with database.sessionmaker() as session:
        await QuestionGenerationService(
            session,
            llm_model="fake-practice-model",
        ).enqueue_generation(
            user_id=user_id,
            target_role_id=role_id,
            question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
            difficulty=QuestionCardDifficulty.BASIC,
            interaction_language="en",
            idempotency_key=idempotency_key,
        )

    worker = build_worker(
        database,
        QuestionGenerationAgent(
            FakeLLMProvider(
                [question_output(project_id, prompt=prompt)],
                provider="saved-question-follow-up-provider",
            ),
            model="fake-practice-model",
        ),
    )
    assert await worker.process_one() is True
    async with database.sessionmaker() as session:
        card = await session.scalar(
            select(QuestionCard).where(
                QuestionCard.user_id == user_id,
                QuestionCard.target_role_id == role_id,
                QuestionCard.prompt == prompt,
            )
        )
        assert card is not None
        card.is_saved = True
        await session.commit()
        return card


def test_saved_setup_count_filters_user_language_and_archived_roles() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, cards = await seed_saved_cards(database)
                await seed_saved_cards(database)
                async with database.sessionmaker() as session:
                    current_card = await session.get(QuestionCard, cards[1].id)
                    current_role = await session.get(TargetRole, role.id)
                    assert current_card is not None
                    assert current_role is not None
                    current_card.language = "zh-CN"
                    await session.commit()

                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner
                with TestClient(app) as client:
                    language_filtered = client.get(
                        "/api/practice/setup",
                        headers={"Accept-Language": "en-US"},
                    )
                    assert language_filtered.status_code == 200
                    assert language_filtered.json()["savedQuestionCount"] == 1

                    async with database.sessionmaker() as session:
                        current_role = await session.get(TargetRole, role.id)
                        assert current_role is not None
                        current_role.preparation_status = "archived"
                        await session.commit()

                    archived_filtered = client.get(
                        "/api/practice/setup",
                        headers={"Accept-Language": "en-US"},
                    )
                    assert archived_filtered.status_code == 200
                    assert archived_filtered.json()["savedQuestionCount"] == 0
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_saved_setup_start_skip_and_rollback_without_question_generation() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, cards = await seed_saved_cards(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    setup = client.get(
                        "/api/practice/setup",
                        headers={"Accept-Language": "en-US"},
                    )
                    assert setup.status_code == 200
                    assert setup.json() == {
                        "availability": {"status": "available"},
                        "trainingAvailableTargetRoleIds": [str(role.id)],
                        "savedQuestionCount": 2,
                        "historyQuestionCount": 0,
                        "questionSourceAvailability": [
                            {
                                "targetRoleId": str(role.id),
                                "questionType": "projectDeepDive",
                                "difficulty": "basic",
                                "savedQuestionCount": 2,
                                "historyQuestionCount": 0,
                            }
                        ],
                        "canPrioritizeWeaknesses": False,
                    }

                    started = client.post(
                        "/api/practice/sessions",
                        json={
                            "targetRoleId": str(role.id),
                            "questionType": "projectDeepDive",
                            "difficulty": "basic",
                            "source": "saved",
                            "prioritizeWeaknesses": False,
                        },
                        headers={
                            "Origin": TRUSTED_ORIGIN,
                            "Accept-Language": "en-US",
                        },
                    )
                    assert started.status_code == 202
                    started_body = started.json()
                    assert started_body["status"] == "answering"
                    assert started_body["version"] == 1
                    assert started_body["question"]["id"] == str(cards[0].id)
                    session_id = UUID(started_body["sessionId"])
                    attempt_id = UUID(started_body["attemptId"])

                    stale = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={
                            "version": 2,
                            "questionId": str(cards[0].id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert stale.status_code == 409
                    assert stale.json() == {
                        "error": "practice_session_version_conflict"
                    }

                    wrong_question = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={
                            "version": 1,
                            "questionId": str(uuid4()),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert wrong_question.status_code == 409
                    assert wrong_question.json() == {
                        "error": "practice_session_state_conflict"
                    }

                    async with database.sessionmaker() as session:
                        attempt = await session.get(PracticeAttempt, attempt_id)
                        question_runs = list(
                            (
                                await session.scalars(
                                    select(AgentRun).where(
                                        AgentRun.user_id == owner.id,
                                        AgentRun.agent_id == "question-generator",
                                    )
                                )
                            ).all()
                        )
                        assert attempt is not None
                        assert attempt.question_card_id == cards[0].id
                        assert attempt.question_generation_run_id is None
                        assert len(question_runs) == 2

                    skipped = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={
                            "version": 1,
                            "questionId": str(cards[0].id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert skipped.status_code == 202
                    skipped_body = skipped.json()
                    assert skipped_body["status"] == "answering"
                    assert skipped_body["version"] == 2
                    assert skipped_body["attemptNumber"] == 1
                    assert skipped_body["attemptId"] != str(attempt_id)
                    assert skipped_body["question"]["id"] == str(cards[1].id)

                    duplicate = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={
                            "version": 1,
                            "questionId": str(cards[0].id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert duplicate.status_code == 409
                    assert duplicate.json() == {
                        "error": "practice_session_version_conflict"
                    }

                async with database.sessionmaker() as session:
                    attempts = list(
                        (
                            await session.scalars(
                                select(PracticeAttempt).where(
                                    PracticeAttempt.session_id == session_id
                                )
                            )
                        ).all()
                    )
                    stored_session = await session.get(PracticeSession, session_id)
                    stored_cards = list(
                        (
                            await session.scalars(
                                select(QuestionCard)
                                .where(QuestionCard.user_id == owner.id)
                                .order_by(QuestionCard.created_at, QuestionCard.id)
                            )
                        ).all()
                    )
                    assert len(attempts) == 1
                    assert attempts[0].attempt_number == 1
                    assert attempts[0].question_card_id == cards[1].id
                    assert attempts[0].question_generation_run_id is None
                    assert stored_session is not None
                    assert stored_session.version == 2
                    assert stored_session.source == "saved"
                    assert [
                        (card.is_saved, card.is_marked_weak) for card in stored_cards
                    ] == [(True, True), (True, False)]

                    for card in stored_cards:
                        card.is_saved = False
                    await session.commit()

                with TestClient(app) as client:
                    no_replacement = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={
                            "version": 2,
                            "questionId": str(cards[1].id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert no_replacement.status_code == 409
                    assert no_replacement.json() == {
                        "error": PRACTICE_SESSION_SOURCE_UNAVAILABLE
                    }

                async with database.sessionmaker() as session:
                    unchanged_attempt = await session.scalar(
                        select(PracticeAttempt).where(
                            PracticeAttempt.session_id == session_id
                        )
                    )
                    unchanged_session = await session.get(
                        PracticeSession,
                        session_id,
                    )
                    assert unchanged_attempt is not None
                    assert unchanged_attempt.attempt_number == 1
                    assert unchanged_attempt.question_card_id == cards[1].id
                    assert unchanged_session is not None
                    assert unchanged_session.version == 2
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_saved_continue_reuses_another_card_without_question_generation() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                user_id, session_id, attempt_id, first_card_id, _run_id, project_id = (
                    await produce_first_review(database)
                )
                async with database.sessionmaker() as session:
                    attempt = await session.get(PracticeAttempt, attempt_id)
                    practice_session = await session.get(PracticeSession, session_id)
                    first_card = await session.get(QuestionCard, first_card_id)
                    assert attempt is not None
                    assert practice_session is not None
                    assert first_card is not None
                    attempt.question_generation_run_id = None
                    first_card.is_saved = True
                    practice_session.source = "saved"
                    await session.commit()

                second_card = await generate_saved_card(
                    database,
                    user_id=user_id,
                    role_id=practice_session.target_role_id,
                    project_id=project_id,
                    prompt="Explain the alternative payment workflow decision.",
                    idempotency_key="saved-continue-card",
                )

                async with database.sessionmaker() as session:
                    before_runs = len(
                        list(
                            (
                                await session.scalars(
                                    select(AgentRun).where(
                                        AgentRun.user_id == user_id,
                                        AgentRun.agent_id == "question-generator",
                                    )
                                )
                            ).all()
                        )
                    )
                    current = await session.get(PracticeSession, session_id)
                    assert current is not None
                    expected_version = current.version
                    continued = await PracticeSessionService(
                        session,
                        llm_model="",
                        question_generation_service_factory=(
                            lambda _session, **_kwargs: (
                                FailingQuestionGenerationService()
                            )  # type: ignore[return-value]
                        ),
                    ).continue_to_next_question(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=expected_version,
                        question_id=first_card_id,
                    )
                    after_runs = len(
                        list(
                            (
                                await session.scalars(
                                    select(AgentRun).where(
                                        AgentRun.user_id == user_id,
                                        AgentRun.agent_id == "question-generator",
                                    )
                                )
                            ).all()
                        )
                    )
                    assert continued.session.version == expected_version + 1
                    assert continued.attempt.attempt_number == 2
                    assert continued.attempt.status == "answering"
                    assert continued.attempt.question_card_id == second_card.id
                    assert continued.attempt.question_generation_run_id is None
                    assert continued.question_card is not None
                    assert continued.question_card.id == second_card.id
                    assert before_runs == after_runs
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_saved_continue_and_retry_reuse_card_provenance_without_generation() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                user_id, session_id, attempt_id, card_id, run_id, _project_id = (
                    await produce_first_review(database)
                )
                async with database.sessionmaker() as session:
                    attempt = await session.get(PracticeAttempt, attempt_id)
                    practice_session = await session.get(PracticeSession, session_id)
                    card = await session.get(QuestionCard, card_id)
                    assert attempt is not None
                    assert practice_session is not None
                    assert card is not None
                    attempt.question_generation_run_id = None
                    card.is_saved = True
                    practice_session.source = "saved"
                    await session.commit()

                async with database.sessionmaker() as session:
                    current = await session.get(PracticeSession, session_id)
                    assert current is not None
                    expected_version = current.version
                    retried = await PracticeSessionService(
                        session,
                        llm_model="",
                    ).retry_current_question(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=expected_version,
                        question_id=card_id,
                    )
                    assert retried.session.version == expected_version + 1
                    assert retried.attempt.status == "answering"
                    assert retried.attempt.question_card_id == card_id
                    assert retried.attempt.question_generation_run_id is None
                    assert retried.question_card is not None
                    assert retried.question_card.id == card_id
                    assert retried.question_generation_run is not None
                    assert retried.question_generation_run.id == run_id
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_saved_source_full_lifecycle_reuses_question_card_provenance() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                saved_card = await generate_saved_card(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    project_id=project_id,
                    prompt="Explain the saved payment workflow decision.",
                    idempotency_key="saved-lifecycle-card",
                )
                async with database.sessionmaker() as session:
                    persisted_card = await session.get(QuestionCard, saved_card.id)
                    original_question_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun)
                                .where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "question-generator",
                                )
                                .order_by(AgentRun.created_at, AgentRun.id)
                            )
                        ).all()
                    )
                    assert persisted_card is not None
                    assert persisted_card.source_agent_run_id is not None
                    assert persisted_card.is_saved is True
                    original_source_run_id = persisted_card.source_agent_run_id
                    original_question_run_ids = {
                        run.id for run in original_question_runs
                    }

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
                            "targetRoleId": str(role.id),
                            "questionType": "projectDeepDive",
                            "difficulty": "basic",
                            "source": "saved",
                            "prioritizeWeaknesses": False,
                        },
                        headers=headers,
                    )
                    assert started.status_code == 202
                    started_body = started.json()
                    assert started_body["status"] == "answering"
                    assert started_body["version"] == 1
                    assert started_body["question"]["id"] == str(saved_card.id)
                    session_id = UUID(started_body["sessionId"])
                    attempt_id = UUID(started_body["attemptId"])

                    async with database.sessionmaker() as session:
                        attempt = await session.get(PracticeAttempt, attempt_id)
                        assert attempt is not None
                        assert attempt.question_card_id == saved_card.id
                        assert attempt.question_generation_run_id is None

                    answered = client.post(
                        f"/api/practice/sessions/{session_id}/answers/main",
                        json={
                            "version": 1,
                            "questionId": str(saved_card.id),
                            "content": "I owned the rollout and reduced failures.",
                        },
                        headers=headers,
                    )
                    assert answered.status_code == 202
                    assert answered.json()["status"] == "generatingFollowUp"
                    assert answered.json()["version"] == 2

                assert await build_worker(
                    database,
                    FollowUpAgent(
                        FakeLLMProvider(
                            [{"action": "complete"}],
                            provider="saved-lifecycle-follow-up-provider",
                        ),
                        model="fake-practice-model",
                    ),
                ).process_one()

                with TestClient(app) as client:
                    follow_up_finished = client.post(
                        (
                            f"/api/practice/sessions/{session_id}/"
                            "follow-up-generation/refresh"
                        ),
                        json={"version": 2},
                        headers=headers,
                    )
                    assert follow_up_finished.status_code == 200
                    assert follow_up_finished.json()["status"] == "evaluating"
                    assert follow_up_finished.json()["version"] == 3

                assert await build_worker(
                    database,
                    PracticeEvaluationAgent(
                        FakeLLMProvider(
                            [evaluation_output()],
                            provider="saved-lifecycle-evaluation-provider",
                        ),
                        model="fake-practice-model",
                    ),
                ).process_one()

                with TestClient(app) as client:
                    evaluation_finished = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 3},
                        headers=headers,
                    )
                    assert evaluation_finished.status_code == 200
                    assert evaluation_finished.json()["status"] == "evaluating"
                    assert evaluation_finished.json()["version"] == 3

                assert await build_worker(
                    database,
                    PracticeReviewAgent(
                        FakeLLMProvider(
                            [review_output()],
                            provider="saved-lifecycle-review-provider",
                        ),
                        model="fake-practice-model",
                    ),
                ).process_one()

                with TestClient(app) as client:
                    review_finished = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 3},
                        headers=headers,
                    )
                    assert review_finished.status_code == 200
                    assert review_finished.json()["status"] == "evaluating"
                    assert review_finished.json()["version"] == 3

                assert await build_worker(
                    database,
                    PracticeRecommendationAgent(
                        FakeLLMProvider(
                            [recommendation_output()],
                            provider="saved-lifecycle-recommendation-provider",
                        ),
                        model="fake-practice-model",
                    ),
                ).process_one()

                with TestClient(app) as client:
                    references_queued = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 3},
                        headers=headers,
                    )
                    assert references_queued.status_code == 200
                    assert references_queued.json()["status"] == "evaluating"
                    assert references_queued.json()["version"] == 3
                await complete_queued_reference_answers(database)

                with TestClient(app) as client:
                    review = client.post(
                        f"/api/practice/sessions/{session_id}/evaluation/refresh",
                        json={"version": 3},
                        headers=headers,
                    )
                    assert review.status_code == 200
                    review_body = review.json()
                    assert review_body["status"] == "review"
                    assert review_body["version"] == 4
                    assert review_body["question"]["id"] == str(saved_card.id)

                    completed = client.post(
                        f"/api/practice/sessions/{session_id}/complete",
                        json={"version": 4},
                        headers=headers,
                    )
                    assert completed.status_code == 200
                    assert completed.json()["status"] == "completed"
                    assert completed.json()["version"] == 5

                    record = client.get(
                        f"/api/training-records/practice/{session_id}"
                    )
                    assert record.status_code == 200
                    record_body = record.json()

                assert record_body["recordId"] == str(session_id)
                assert record_body["status"] == "completed"
                assert record_body["setup"] == {
                    "source": "saved",
                    "prioritizeWeaknesses": False,
                }
                assert len(record_body["attempts"]) == 1
                record_attempt = record_body["attempts"][0]
                assert record_attempt["attemptId"] == str(attempt_id)
                assert record_attempt["attemptNumber"] == 1
                assert record_attempt["question"]["questionCardId"] == str(
                    saved_card.id
                )
                assert record_attempt["question"]["prompt"] == saved_card.prompt
                assert record_attempt["question"]["referenceAnswer"]["status"] == (
                    "revealed"
                )
                assert record_attempt["mainAnswer"]["content"] == (
                    "I owned the rollout and reduced failures."
                )
                assert record_attempt["evaluation"]["overallScore"] == 82
                assert record_attempt["review"]["overallPerformance"] == (
                    "Strong answer with a measurable result."
                )
                assert record_attempt["recommendation"]["action"] == "nextQuestion"

                async with database.sessionmaker() as session:
                    question_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "question-generator",
                                )
                            )
                        ).all()
                    )
                    assert {run.id for run in question_runs} == (
                        original_question_run_ids
                    )
                    assert len(question_runs) == len(original_question_runs)
                    for agent_id in (
                        "follow-up-generator",
                        "practice-evaluator",
                        "practice-reviewer",
                        "practice-recommender",
                    ):
                        runs = list(
                            (
                                await session.scalars(
                                    select(AgentRun).where(
                                        AgentRun.user_id == owner.id,
                                        AgentRun.agent_id == agent_id,
                                    )
                                )
                            ).all()
                        )
                        assert len(runs) == 1

                    persisted_card = await session.get(QuestionCard, saved_card.id)
                    persisted_session = await session.get(
                        PracticeSession, session_id
                    )
                    persisted_attempt = await session.get(
                        PracticeAttempt, attempt_id
                    )
                    assert persisted_card is not None
                    assert persisted_card.source_agent_run_id == original_source_run_id
                    assert persisted_card.is_saved is True
                    assert persisted_session is not None
                    assert persisted_session.source == "saved"
                    assert persisted_attempt is not None
                    assert persisted_attempt.question_generation_run_id is None
            finally:
                await database.reset()

    asyncio.run(run_test())
