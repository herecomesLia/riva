import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

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
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.services.practice_sessions import PRACTICE_SESSION_SOURCE_UNAVAILABLE
from riva.services.question_generation import QuestionGenerationService
from tests.helpers.llm import FakeLLMProvider
from tests.helpers.practice_reference_answers import complete_queued_reference_answers
from tests.integration.test_practice_next_question_workflow import (
    build_worker,
    evaluation_output,
    recommendation_output,
    question_output,
    review_output,
)
from tests.integration.test_question_generation import database_url, seed_context


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"
START = datetime(2026, 8, 10, 9, 30, tzinfo=UTC)


def settings(url: str, *, llm_enabled: bool) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen" if llm_enabled else None,
        llm_model="fake-practice-model" if llm_enabled else None,
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="practice-history-workflow-test-key",
        session_cookie_secure=False,
    )


async def generate_history_card(
    database: Database,
    *,
    user_id: UUID,
    role_id: UUID,
    project_id: UUID,
    prompt: str,
    idempotency_key: str,
    question_type: QuestionCardQuestionType = QuestionCardQuestionType.PROJECT_DEEP_DIVE,
    difficulty: QuestionCardDifficulty = QuestionCardDifficulty.BASIC,
    language: str = "en",
    is_saved: bool = False,
) -> tuple[QuestionCard, AgentRun]:
    async with database.sessionmaker() as session:
        run = await QuestionGenerationService(
            session,
            llm_model="fake-practice-model",
        ).enqueue_generation(
            user_id=user_id,
            target_role_id=role_id,
            question_type=question_type,
            difficulty=difficulty,
            interaction_language=language,
            idempotency_key=idempotency_key,
        )

    output = question_output(project_id, prompt=prompt)
    output["question_type"] = question_type.value
    output["difficulty"] = difficulty.value
    assert await build_worker(
        database,
        QuestionGenerationAgent(
            FakeLLMProvider(
                [output],
                provider=f"history-question-{idempotency_key}",
            ),
            model="fake-practice-model",
        ),
    ).process_one()

    async with database.sessionmaker() as session:
        card = await session.scalar(
            select(QuestionCard).where(QuestionCard.source_agent_run_id == run.id)
        )
        assert card is not None
        assert card.language == language
        card.is_saved = is_saved
        await session.commit()
        return card, run


async def seed_completed_attempt(
    database: Database,
    *,
    user_id: UUID,
    role_id: UUID,
    card: QuestionCard,
    completed_at: datetime,
    status: str = "completed",
) -> tuple[UUID, UUID]:
    async with database.sessionmaker() as session:
        practice_session = PracticeSession(
            id=uuid4(),
            user_id=user_id,
            target_role_id=role_id,
            language=card.language,
            version=1,
            status="completed",
            initial_question_type=card.question_type,
            initial_difficulty=card.difficulty,
            source="personalized",
            prioritize_weaknesses=False,
            started_at=completed_at - timedelta(minutes=5),
            completed_at=completed_at,
            completion_reason=(
                "userEndedEarly" if status == "endedEarly" else "reviewCompleted"
            ),
            created_at=completed_at - timedelta(minutes=5),
            updated_at=completed_at,
        )
        attempt = PracticeAttempt(
            id=uuid4(),
            user_id=user_id,
            session_id=practice_session.id,
            attempt_number=1,
            question_type=card.question_type,
            difficulty=card.difficulty,
            status=status,
            question_generation_run_id=None,
            question_card_id=card.id,
            retry_of_attempt_id=None,
            created_at=completed_at - timedelta(minutes=5),
            updated_at=completed_at,
            completed_at=(
                completed_at
                if status in {"completed", "review", "endedEarly"}
                else None
            ),
        )
        session.add_all([practice_session, attempt])
        await session.commit()
        return practice_session.id, attempt.id


async def seed_archived_role(database: Database, *, user_id: UUID) -> TargetRole:
    async with database.sessionmaker() as session:
        role = TargetRole(
            id=uuid4(),
            user_id=user_id,
            title="Archived Engineer",
            company="Riva",
            recruitment_type="experienced",
            location="Shanghai",
            preparation_status="archived",
            job_description_status="missing",
            raw_job_description=None,
            job_description_version=None,
            version=1,
            created_at=START,
            updated_at=START,
        )
        session.add(role)
        await session.commit()
        return role


async def question_generator_run_ids(database: Database, user_id: UUID) -> set[UUID]:
    async with database.sessionmaker() as session:
        return {
            run.id
            for run in (
                await session.scalars(
                    select(AgentRun).where(
                        AgentRun.user_id == user_id,
                        AgentRun.agent_id == "question-generator",
                    )
                )
            ).all()
            if run.id is not None
        }


async def session_count(database: Database, user_id: UUID) -> int:
    async with database.sessionmaker() as session:
        return int(
            await session.scalar(
                select(func.count(PracticeSession.id)).where(
                    PracticeSession.user_id == user_id
                )
            )
            or 0
        )


async def advance_history_to_review(
    database: Database,
    client: TestClient,
    *,
    headers: dict[str, str],
    session_id: UUID,
    version: int,
    question_id: UUID,
    suffix: str,
) -> dict[str, object]:
    answered = client.post(
        f"/api/practice/sessions/{session_id}/answers/main",
        json={
            "version": version,
            "questionId": str(question_id),
            "content": "I owned the rollout and reduced failures.",
        },
        headers=headers,
    )
    assert answered.status_code == 202
    assert answered.json()["status"] == "generatingFollowUp"
    assert answered.json()["version"] == version + 1

    assert await build_worker(
        database,
        FollowUpAgent(
            FakeLLMProvider(
                [{"action": "complete"}],
                provider=f"history-follow-up-{suffix}",
            ),
            model="fake-practice-model",
        ),
    ).process_one()
    follow_up = client.post(
        f"/api/practice/sessions/{session_id}/follow-up-generation/refresh",
        json={"version": version + 1},
        headers=headers,
    )
    assert follow_up.status_code == 200
    assert follow_up.json()["status"] == "evaluating"
    assert follow_up.json()["version"] == version + 2

    assert await build_worker(
        database,
        PracticeEvaluationAgent(
            FakeLLMProvider(
                [evaluation_output()],
                provider=f"history-evaluation-{suffix}",
            ),
            model="fake-practice-model",
        ),
    ).process_one()
    evaluation = client.post(
        f"/api/practice/sessions/{session_id}/evaluation/refresh",
        json={"version": version + 2},
        headers=headers,
    )
    assert evaluation.status_code == 200
    assert evaluation.json()["status"] == "evaluating"
    assert evaluation.json()["version"] == version + 2

    assert await build_worker(
        database,
        PracticeReviewAgent(
            FakeLLMProvider(
                [review_output()],
                provider=f"history-review-{suffix}",
            ),
            model="fake-practice-model",
        ),
    ).process_one()
    review = client.post(
        f"/api/practice/sessions/{session_id}/evaluation/refresh",
        json={"version": version + 2},
        headers=headers,
    )
    assert review.status_code == 200
    assert review.json()["status"] == "evaluating"
    assert review.json()["version"] == version + 2

    assert await build_worker(
        database,
        PracticeRecommendationAgent(
            FakeLLMProvider(
                [recommendation_output()],
                provider=f"history-recommendation-{suffix}",
            ),
            model="fake-practice-model",
        ),
    ).process_one()
    recommendation = client.post(
        f"/api/practice/sessions/{session_id}/evaluation/refresh",
        json={"version": version + 2},
        headers=headers,
    )
    assert recommendation.status_code == 200
    recommendation_body = recommendation.json()
    if recommendation_body["status"] == "review":
        assert recommendation_body["version"] == version + 3
        assert recommendation_body["question"]["id"] == str(question_id)
        return recommendation_body
    assert recommendation_body["status"] == "evaluating"
    assert recommendation_body["version"] == version + 2

    await complete_queued_reference_answers(database)
    finished = client.post(
        f"/api/practice/sessions/{session_id}/evaluation/refresh",
        json={"version": version + 2},
        headers=headers,
    )
    assert finished.status_code == 200
    body = finished.json()
    assert body["status"] == "review"
    assert body["version"] == version + 3
    assert body["question"]["id"] == str(question_id)
    return body


def test_history_setup_distinct_count_filters_and_starts_without_llm() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                valid_card, _valid_run = await generate_history_card(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    project_id=project_id,
                    prompt="History eligible project question.",
                    idempotency_key="history-eligible",
                )
                duplicate_time = START + timedelta(minutes=1)
                await seed_completed_attempt(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    card=valid_card,
                    completed_at=START,
                )
                await seed_completed_attempt(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    card=valid_card,
                    completed_at=duplicate_time,
                )

                unfinished_cards = [
                    (
                        "answering",
                        "History answering question.",
                        QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                        QuestionCardDifficulty.BASIC,
                    ),
                    (
                        "answeringFollowUp",
                        "History follow-up question.",
                        QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                        QuestionCardDifficulty.BASIC,
                    ),
                    (
                        "evaluating",
                        "History evaluating question.",
                        QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                        QuestionCardDifficulty.BASIC,
                    ),
                    (
                        "review",
                        "History review question.",
                        QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                        QuestionCardDifficulty.BASIC,
                    ),
                    (
                        "endedEarly",
                        "History ended early question.",
                        QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                        QuestionCardDifficulty.BASIC,
                    ),
                ]
                for index, (status, prompt, question_type, difficulty) in enumerate(
                    unfinished_cards
                ):
                    card, _run = await generate_history_card(
                        database,
                        user_id=owner.id,
                        role_id=role.id,
                        project_id=project_id,
                        prompt=prompt,
                        idempotency_key=f"history-unfinished-{index}",
                        question_type=question_type,
                        difficulty=difficulty,
                    )
                    await seed_completed_attempt(
                        database,
                        user_id=owner.id,
                        role_id=role.id,
                        card=card,
                        completed_at=START + timedelta(minutes=index + 2),
                        status=status,
                    )

                wrong_language, _ = await generate_history_card(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    project_id=project_id,
                    prompt="History wrong language question.",
                    idempotency_key="history-wrong-language",
                    language="zh-CN",
                )
                await seed_completed_attempt(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    card=wrong_language,
                    completed_at=START + timedelta(minutes=10),
                )

                wrong_type, _ = await generate_history_card(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    project_id=project_id,
                    prompt="History wrong type question.",
                    idempotency_key="history-wrong-type",
                    question_type=QuestionCardQuestionType.BEHAVIORAL,
                )
                await seed_completed_attempt(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    card=wrong_type,
                    completed_at=START + timedelta(minutes=11),
                )

                wrong_difficulty, _ = await generate_history_card(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    project_id=project_id,
                    prompt="History wrong difficulty question.",
                    idempotency_key="history-wrong-difficulty",
                    difficulty=QuestionCardDifficulty.PRESSURE,
                )
                await seed_completed_attempt(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    card=wrong_difficulty,
                    completed_at=START + timedelta(minutes=12),
                )

                archived_role = await seed_archived_role(database, user_id=owner.id)
                archived_card, _ = await generate_history_card(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    project_id=project_id,
                    prompt="History archived role question.",
                    idempotency_key="history-archived-role",
                )
                async with database.sessionmaker() as session:
                    persisted_archived_card = await session.get(
                        QuestionCard,
                        archived_card.id,
                    )
                    assert persisted_archived_card is not None
                    persisted_archived_card.target_role_id = archived_role.id
                    await session.commit()
                await seed_completed_attempt(
                    database,
                    user_id=owner.id,
                    role_id=archived_role.id,
                    card=archived_card,
                    completed_at=START + timedelta(minutes=13),
                )

                other_owner, other_role, _other_profile, other_project = await seed_context(
                    database
                )
                other_card, _ = await generate_history_card(
                    database,
                    user_id=other_owner.id,
                    role_id=other_role.id,
                    project_id=other_project,
                    prompt="Other user history question.",
                    idempotency_key="history-other-user",
                )
                await seed_completed_attempt(
                    database,
                    user_id=other_owner.id,
                    role_id=other_role.id,
                    card=other_card,
                    completed_at=START + timedelta(minutes=14),
                )

                app = create_app(settings(url, llm_enabled=False))
                app.dependency_overrides[require_current_user] = lambda: owner
                headers = {
                    "Origin": TRUSTED_ORIGIN,
                    "Accept-Language": "en-US",
                }
                with TestClient(app) as client:
                    setup = client.get("/api/practice/setup", headers=headers)
                    assert setup.status_code == 200
                    setup_body = setup.json()
                    assert setup_body["savedQuestionCount"] == 0
                    assert setup_body["historyQuestionCount"] == 3
                    assert setup_body["canPrioritizeWeaknesses"] is False
                    assert setup_body["questionSourceAvailability"]

                    before = await session_count(database, owner.id)
                    unavailable = client.post(
                        "/api/practice/sessions",
                        json={
                            "targetRoleId": str(role.id),
                            "questionType": "behavioral",
                            "difficulty": "pressure",
                            "source": "history",
                            "prioritizeWeaknesses": False,
                        },
                        headers=headers,
                    )
                    assert unavailable.status_code == 409
                    assert unavailable.json() == {
                        "error": PRACTICE_SESSION_SOURCE_UNAVAILABLE
                    }
                    assert await session_count(database, owner.id) == before

                    run_ids_before = await question_generator_run_ids(database, owner.id)
                    started = client.post(
                        "/api/practice/sessions",
                        json={
                            "targetRoleId": str(role.id),
                            "questionType": "projectDeepDive",
                            "difficulty": "basic",
                            "source": "history",
                            "prioritizeWeaknesses": False,
                        },
                        headers=headers,
                    )
                    assert started.status_code == 202
                    started_body = started.json()
                    assert started_body["status"] == "answering"
                    assert started_body["version"] == 1
                    assert started_body["question"]["id"] == str(valid_card.id)
                    session_id = UUID(started_body["sessionId"])
                    attempt_id = UUID(started_body["attemptId"])

                    async with database.sessionmaker() as session:
                        attempt = await session.get(PracticeAttempt, attempt_id)
                        assert attempt is not None
                        assert attempt.question_card_id == valid_card.id
                        assert attempt.question_generation_run_id is None
                    assert await question_generator_run_ids(database, owner.id) == run_ids_before

                    current = client.get("/api/practice/sessions/current", headers=headers)
                    assert current.status_code == 200
                    assert current.json()["session"]["status"] == "answering"
                    assert current.json()["session"]["question"]["id"] == str(valid_card.id)
                    assert session_id == UUID(current.json()["session"]["sessionId"])
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_history_source_full_lifecycle_reuses_card_provenance() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                history_card, original_question_run = await generate_history_card(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    project_id=project_id,
                    prompt="Explain the historical payment workflow decision.",
                    idempotency_key="history-lifecycle-card",
                )
                await seed_completed_attempt(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    card=history_card,
                    completed_at=START,
                )
                original_run_ids = await question_generator_run_ids(database, owner.id)
                original_source_run_id = history_card.source_agent_run_id

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
                            "source": "history",
                            "prioritizeWeaknesses": False,
                        },
                        headers=headers,
                    )
                    assert started.status_code == 202
                    started_body = started.json()
                    assert started_body["status"] == "answering"
                    assert started_body["question"]["id"] == str(history_card.id)
                    session_id = UUID(started_body["sessionId"])
                    attempt_id = UUID(started_body["attemptId"])

                    async with database.sessionmaker() as session:
                        attempt = await session.get(PracticeAttempt, attempt_id)
                        assert attempt is not None
                        assert attempt.question_generation_run_id is None
                        assert attempt.question_card_id == history_card.id

                    review_body = await advance_history_to_review(
                        database,
                        client,
                        headers=headers,
                        session_id=session_id,
                        version=1,
                        question_id=history_card.id,
                        suffix="lifecycle",
                    )
                    completed = client.post(
                        f"/api/practice/sessions/{session_id}/complete",
                        json={"version": review_body["version"]},
                        headers=headers,
                    )
                    assert completed.status_code == 200
                    assert completed.json()["status"] == "completed"

                    record = client.get(
                        f"/api/training-records/practice/{session_id}",
                        headers=headers,
                    )
                    assert record.status_code == 200
                    record_body = record.json()

                assert record_body["recordId"] == str(session_id)
                assert record_body["status"] == "completed"
                assert record_body["setup"] == {
                    "source": "history",
                    "prioritizeWeaknesses": False,
                }
                assert len(record_body["attempts"]) == 1
                record_attempt = record_body["attempts"][0]
                assert record_attempt["attemptId"] == str(attempt_id)
                assert record_attempt["question"]["questionCardId"] == str(history_card.id)
                assert record_attempt["question"]["prompt"] == history_card.prompt
                assert record_attempt["mainAnswer"]["content"] == (
                    "I owned the rollout and reduced failures."
                )
                assert record_attempt["evaluation"]["overallScore"] == 82
                assert record_attempt["review"]["overallPerformance"] == (
                    "Strong answer with a measurable result."
                )
                assert record_attempt["recommendation"]["action"] == "nextQuestion"

                assert await question_generator_run_ids(database, owner.id) == original_run_ids
                assert original_question_run.id in original_run_ids
                async with database.sessionmaker() as session:
                    persisted_card = await session.get(QuestionCard, history_card.id)
                    persisted_attempt = await session.get(PracticeAttempt, attempt_id)
                    assert persisted_card is not None
                    assert persisted_card.source_agent_run_id == original_source_run_id
                    assert persisted_card.is_saved is False
                    assert persisted_attempt is not None
                    assert persisted_attempt.question_generation_run_id is None
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
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_history_next_skip_retry_reuse_cards_and_skip_rolls_back_without_replacement() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                first_card, _ = await generate_history_card(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    project_id=project_id,
                    prompt="First historical workflow decision.",
                    idempotency_key="history-actions-first",
                )
                second_card, _ = await generate_history_card(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    project_id=project_id,
                    prompt="Second historical workflow decision.",
                    idempotency_key="history-actions-second",
                )
                await seed_completed_attempt(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    card=first_card,
                    completed_at=START,
                )
                await seed_completed_attempt(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    card=second_card,
                    completed_at=START + timedelta(minutes=1),
                )
                original_run_ids = await question_generator_run_ids(database, owner.id)

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
                            "source": "history",
                            "prioritizeWeaknesses": False,
                        },
                        headers=headers,
                    )
                    assert started.status_code == 202
                    started_body = started.json()
                    assert started_body["question"]["id"] == str(second_card.id)
                    session_id = UUID(started_body["sessionId"])
                    first_attempt_id = UUID(started_body["attemptId"])

                    stale = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={"version": 2, "questionId": str(second_card.id)},
                        headers=headers,
                    )
                    assert stale.status_code == 409
                    assert stale.json() == {"error": "practice_session_version_conflict"}
                    wrong_question = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={"version": 1, "questionId": str(uuid4())},
                        headers=headers,
                    )
                    assert wrong_question.status_code == 409
                    assert wrong_question.json() == {"error": "practice_session_state_conflict"}

                    first_review = await advance_history_to_review(
                        database,
                        client,
                        headers=headers,
                        session_id=session_id,
                        version=1,
                        question_id=second_card.id,
                        suffix="next",
                    )
                    continued = client.post(
                        f"/api/practice/sessions/{session_id}/questions/next",
                        json={
                            "version": first_review["version"],
                            "questionId": str(second_card.id),
                        },
                        headers=headers,
                    )
                    assert continued.status_code == 202
                    continued_body = continued.json()
                    assert continued_body["status"] == "answering"
                    assert continued_body["attemptNumber"] == 2
                    assert continued_body["question"]["id"] == str(first_card.id)
                    continued_attempt_id = UUID(continued_body["attemptId"])

                    skipped = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={
                            "version": continued_body["version"],
                            "questionId": str(first_card.id),
                        },
                        headers=headers,
                    )
                    assert skipped.status_code == 202
                    skipped_body = skipped.json()
                    assert skipped_body["status"] == "answering"
                    assert skipped_body["attemptNumber"] == 2
                    assert skipped_body["attemptId"] != str(continued_attempt_id)
                    assert skipped_body["question"]["id"] == str(second_card.id)
                    second_review = await advance_history_to_review(
                        database,
                        client,
                        headers=headers,
                        session_id=session_id,
                        version=skipped_body["version"],
                        question_id=second_card.id,
                        suffix="retry",
                    )
                    retried = client.post(
                        f"/api/practice/sessions/{session_id}/questions/retry",
                        json={
                            "version": second_review["version"],
                            "questionId": str(second_card.id),
                        },
                        headers=headers,
                    )
                    assert retried.status_code == 200
                    retried_body = retried.json()
                    assert retried_body["status"] == "answering"
                    assert retried_body["attemptNumber"] == 3
                    assert retried_body["question"]["id"] == str(second_card.id)

                    assert await question_generator_run_ids(database, owner.id) == original_run_ids
                    async with database.sessionmaker() as session:
                        original_attempt = await session.get(
                            PracticeAttempt,
                            first_attempt_id,
                        )
                        replaced_attempt = await session.get(
                            PracticeAttempt,
                            continued_attempt_id,
                        )
                        assert original_attempt is not None
                        assert replaced_attempt is None
                        assert original_attempt.status == "completed"

                await database.reset()
                owner, role, _profile, project_id = await seed_context(database)
                only_card, _ = await generate_history_card(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    project_id=project_id,
                    prompt="Only historical workflow decision.",
                    idempotency_key="history-actions-only",
                )
                await seed_completed_attempt(
                    database,
                    user_id=owner.id,
                    role_id=role.id,
                    card=only_card,
                    completed_at=START,
                )
                app = create_app(settings(url, llm_enabled=True))
                app.dependency_overrides[require_current_user] = lambda: owner
                with TestClient(app) as client:
                    started = client.post(
                        "/api/practice/sessions",
                        json={
                            "targetRoleId": str(role.id),
                            "questionType": "projectDeepDive",
                            "difficulty": "basic",
                            "source": "history",
                            "prioritizeWeaknesses": False,
                        },
                        headers=headers,
                    )
                    assert started.status_code == 202
                    started_body = started.json()
                    session_id = UUID(started_body["sessionId"])
                    attempt_id = UUID(started_body["attemptId"])
                    unavailable = client.post(
                        f"/api/practice/sessions/{session_id}/questions/skip",
                        json={"version": 1, "questionId": str(only_card.id)},
                        headers=headers,
                    )
                    assert unavailable.status_code == 409
                    assert unavailable.json() == {
                        "error": PRACTICE_SESSION_SOURCE_UNAVAILABLE
                    }
                async with database.sessionmaker() as session:
                    attempt = await session.get(PracticeAttempt, attempt_id)
                    practice_session = await session.get(PracticeSession, session_id)
                    assert attempt is not None
                    assert attempt.status == "answering"
                    assert attempt.attempt_number == 1
                    assert attempt.question_card_id == only_card.id
                    assert practice_session is not None
                    assert practice_session.version == 1
            finally:
                await database.reset()

    asyncio.run(run_test())
