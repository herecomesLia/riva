from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from riva.agents import (
    FollowUpAgent,
    PracticeEvaluationAgent,
    PracticeRecommendationAgent,
    PracticeReviewAgent,
)
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    PracticeReferenceAnswerArtifact,
    QuestionCard,
    User,
)
from riva.services.practice_sessions import PracticeSessionService
from tests.helpers.integration_database import get_integration_database_url
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_practice_next_question_workflow import (
    produce_first_review,
)
from tests.integration.test_practice_reference_answer_workflow import (
    prepare_follow_up_question,
)
from tests.integration.test_practice_review_workflow import (
    build_worker,
    complete_required_reference_answers,
    evaluation_output,
    recommendation_output,
    review_output,
)

pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"
START = datetime(2026, 8, 16, 9, 30, tzinfo=UTC)


def settings(url: str) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen",
        llm_model="fake-training-record-reference-answer-model",
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="training-record-reference-answer-test-key",
        session_cookie_secure=False,
    )


async def clear_reference_answer_lineage(
    database: Database,
    *,
    user_id: UUID,
) -> None:
    """Model a legacy completed record whose reference answer was never requested."""

    async with database.sessionmaker() as session:
        run_ids = list(
            (
                await session.scalars(
                    select(AgentRun.id).where(
                        AgentRun.user_id == user_id,
                        AgentRun.agent_id == "practice-reference-answer-generator",
                    )
                )
            ).all()
        )
        if run_ids:
            await session.execute(
                delete(PracticeReferenceAnswerArtifact).where(
                    PracticeReferenceAnswerArtifact.source_agent_run_id.in_(run_ids)
                )
            )
            await session.execute(delete(AgentRun).where(AgentRun.id.in_(run_ids)))
        await session.commit()


async def reference_run_count(database: Database, *, user_id: UUID) -> int:
    async with database.sessionmaker() as session:
        return int(
            await session.scalar(
                select(func.count(AgentRun.id)).where(
                    AgentRun.user_id == user_id,
                    AgentRun.agent_id == "practice-reference-answer-generator",
                )
            )
            or 0
        )


async def complete_follow_up_record(
    database: Database,
) -> tuple[UUID, UUID, UUID, UUID]:
    (
        owner,
        session_id,
        attempt_id,
        question_id,
        first_follow_up_id,
    ) = await prepare_follow_up_question(database)

    async with database.sessionmaker() as session:
        submitted = await PracticeSessionService(
            session,
            llm_model="fake-follow-up-model",
            clock=lambda: START,
        ).submit_follow_up_answer(
            user_id=owner.id,
            session_id=session_id,
            expected_version=4,
            question_id=question_id,
            follow_up_question_id=first_follow_up_id,
            content="The result was measured against the previous baseline.",
        )
        assert submitted.session.version == 5

    assert await build_worker(
        database,
        FollowUpAgent(
            FakeLLMProvider(
                [{"action": "complete"}],
                provider="training-record-follow-up-provider",
                usage=LLMUsage(input_tokens=10, output_tokens=10),
            ),
            model="fake-follow-up-model",
        ),
    ).process_one()

    async with database.sessionmaker() as session:
        evaluating = await PracticeSessionService(
            session,
            llm_model="fake-evaluation-model",
            clock=lambda: START,
        ).refresh_follow_up_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=5,
        )
        assert evaluating.session.version == 6
        assert evaluating.attempt.status == "evaluating"

    assert await build_worker(
        database,
        PracticeEvaluationAgent(
            FakeLLMProvider(
                [evaluation_output()],
                provider="training-record-evaluation-provider",
                usage=LLMUsage(input_tokens=10, output_tokens=10),
            ),
            model="fake-evaluation-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        await PracticeSessionService(
            session,
            llm_model="fake-review-model",
            clock=lambda: START,
        ).refresh_evaluation_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=6,
        )

    assert await build_worker(
        database,
        PracticeReviewAgent(
            FakeLLMProvider(
                [review_output()],
                provider="training-record-review-provider",
                usage=LLMUsage(input_tokens=10, output_tokens=10),
            ),
            model="fake-review-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        await PracticeSessionService(
            session,
            llm_model="fake-recommendation-model",
            clock=lambda: START,
        ).refresh_evaluation_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=6,
        )

    assert await build_worker(
        database,
        PracticeRecommendationAgent(
            FakeLLMProvider(
                [recommendation_output("retryCurrent")],
                provider="training-record-recommendation-provider",
                usage=LLMUsage(input_tokens=10, output_tokens=10),
            ),
            model="fake-recommendation-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        queued = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
            clock=lambda: START,
        ).refresh_evaluation_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=6,
        )
        assert queued.session.version == 6
        assert queued.attempt.status == "evaluating"

    await complete_required_reference_answers(database)
    async with database.sessionmaker() as session:
        review = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
            clock=lambda: START,
        ).refresh_evaluation_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=6,
        )
        assert review.session.version == 7
        assert review.attempt.status == "review"

        completed = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
            clock=lambda: START,
        ).complete_session_after_review(
            user_id=owner.id,
            session_id=session_id,
            expected_version=7,
        )
        assert completed.session.status == "completed"

    await clear_reference_answer_lineage(database, user_id=owner.id)
    return owner.id, session_id, attempt_id, first_follow_up_id


def test_training_record_reference_answer_main_lifecycle() -> None:
    async def run_test() -> None:
        url = get_integration_database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    user_id,
                    session_id,
                    attempt_id,
                    card_id,
                    first_run_id,
                    _project_id,
                ) = await produce_first_review(database)
                async with database.sessionmaker() as session:
                    completed = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).complete_session_after_review(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=5,
                    )
                    assert completed.session.status == "completed"
                    card = await session.get(
                        QuestionCard,
                        completed.final_attempt.question_card_id,
                    )
                    assert card is not None
                    original_source_run_id = card.source_agent_run_id
                    original_saved = card.is_saved
                await clear_reference_answer_lineage(database, user_id=user_id)
                assert await reference_run_count(database, user_id=user_id) == 0

                app = create_app(settings(url))
                async with database.sessionmaker() as session:
                    owner = await session.get(User, user_id)
                    assert owner is not None
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    initial_refresh = client.post(
                        f"/api/training-records/practice/{session_id}/reference-answer/refresh",
                        json={
                            "subject": "mainQuestion",
                            "questionId": str(attempt_id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                assert initial_refresh.status_code == 200
                assert initial_refresh.json()["referenceAnswer"]["status"] == (
                    "notRequested"
                )
                assert await reference_run_count(database, user_id=user_id) == 0

                with TestClient(app) as client:
                    requested = client.post(
                        f"/api/training-records/practice/{session_id}/reference-answer",
                        json={
                            "subject": "mainQuestion",
                            "questionId": str(attempt_id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    repeated = client.post(
                        f"/api/training-records/practice/{session_id}/reference-answer",
                        json={
                            "subject": "mainQuestion",
                            "questionId": str(attempt_id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                assert requested.status_code == 202
                assert requested.json()["target"]["questionId"] == str(attempt_id)
                assert requested.json()["referenceAnswer"]["status"] == "generating"
                assert repeated.status_code == 202
                assert repeated.json()["referenceAnswer"]["status"] == "generating"
                assert await reference_run_count(database, user_id=user_id) == 1

                assert await complete_required_reference_answers(database)
                with TestClient(app) as client:
                    refreshed = client.post(
                        f"/api/training-records/practice/{session_id}/reference-answer/refresh",
                        json={
                            "subject": "mainQuestion",
                            "questionId": str(attempt_id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    detail = client.get(f"/api/training-records/practice/{session_id}")
                assert refreshed.status_code == 200
                assert refreshed.json()["referenceAnswer"]["status"] == "revealed"
                assert await reference_run_count(database, user_id=user_id) == 1
                assert detail.status_code == 200
                body = detail.json()
                assert body["status"] == "completed"
                assert body["attempts"][0]["attemptId"] == str(attempt_id)
                assert (
                    body["attempts"][0]["question"]["referenceAnswer"]
                    == (refreshed.json()["referenceAnswer"])
                )

                async with database.sessionmaker() as session:
                    stored_card = await session.get(QuestionCard, card_id)
                    assert stored_card is not None
                    assert stored_card.source_agent_run_id == original_source_run_id
                    assert stored_card.is_saved == original_saved
                    question_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == user_id,
                                    AgentRun.agent_id == "question-generator",
                                )
                            )
                        ).all()
                    )
                    assert [run.id for run in question_runs] == [first_run_id]

                other_user = User(
                    id=uuid4(),
                    username="training-record-reference-other-user",
                    normalized_username="training-record-reference-other-user",
                    password_hash="hash",
                    display_name="Other User",
                )
                app.dependency_overrides[require_current_user] = lambda: other_user
                with TestClient(app) as client:
                    wrong_user = client.post(
                        f"/api/training-records/practice/{session_id}/reference-answer/refresh",
                        json={
                            "subject": "mainQuestion",
                            "questionId": str(attempt_id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                assert wrong_user.status_code == 404
                assert wrong_user.json() == {"error": "training_record_not_found"}
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_training_record_reference_answer_follow_up_lifecycle() -> None:
    async def run_test() -> None:
        url = get_integration_database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    user_id,
                    session_id,
                    attempt_id,
                    follow_up_id,
                ) = await complete_follow_up_record(database)
                assert await reference_run_count(database, user_id=user_id) == 0
                app = create_app(settings(url))
                async with database.sessionmaker() as session:
                    owner = await session.get(User, user_id)
                    assert owner is not None
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    wrong_attempt = client.post(
                        f"/api/training-records/practice/{session_id}/reference-answer",
                        json={
                            "subject": "followUp",
                            "questionId": str(uuid4()),
                            "followUpId": str(follow_up_id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    wrong_follow_up = client.post(
                        f"/api/training-records/practice/{session_id}/reference-answer",
                        json={
                            "subject": "followUp",
                            "questionId": str(attempt_id),
                            "followUpId": str(uuid4()),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                assert wrong_attempt.status_code == 404
                assert wrong_attempt.json() == {
                    "error": "training_record_question_not_found"
                }
                assert wrong_follow_up.status_code == 404
                assert wrong_follow_up.json() == {
                    "error": "training_record_follow_up_not_found"
                }
                assert await reference_run_count(database, user_id=user_id) == 0

                with TestClient(app) as client:
                    requested = client.post(
                        f"/api/training-records/practice/{session_id}/reference-answer",
                        json={
                            "subject": "followUp",
                            "questionId": str(attempt_id),
                            "followUpId": str(follow_up_id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                assert requested.status_code == 202
                assert requested.json()["target"]["followUpId"] == str(follow_up_id)
                assert requested.json()["referenceAnswer"]["status"] == "generating"
                assert await reference_run_count(database, user_id=user_id) == 1

                assert await complete_required_reference_answers(database)
                with TestClient(app) as client:
                    refreshed = client.post(
                        f"/api/training-records/practice/{session_id}/reference-answer/refresh",
                        json={
                            "subject": "followUp",
                            "questionId": str(attempt_id),
                            "followUpId": str(follow_up_id),
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                assert refreshed.status_code == 200
                assert refreshed.json()["referenceAnswer"]["status"] == "revealed"
                assert await reference_run_count(database, user_id=user_id) == 1
            finally:
                await database.reset()

    asyncio.run(run_test())
