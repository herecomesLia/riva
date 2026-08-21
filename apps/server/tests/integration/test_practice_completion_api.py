import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.models import AgentRun, PracticeAttempt, PracticeEvaluation, User
from riva.services.practice_sessions import PracticeSessionService
from tests.integration.test_practice_next_question_workflow import (
    database_url,
    produce_first_review,
)
from tests.integration.test_practice_retry_workflow import _complete_retry_review

pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


def test_practice_completion_public_api_replay_and_current_release() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    user_id,
                    session_id,
                    _attempt_id,
                    _question_id,
                    _question_run_id,
                    _project_id,
                ) = await produce_first_review(database)
                async with database.sessionmaker() as session:
                    owner = await session.get(User, user_id)
                    assert owner is not None
                settings = Settings(
                    database_url=url,
                    llm_provider="qwen",
                    llm_model="fake-practice-model",
                    cors_allowed_origins=[TRUSTED_ORIGIN],
                    session_digest_key="practice-completion-api-test-key",
                    session_cookie_secure=False,
                )
                app = create_app(settings)
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    completed = client.post(
                        f"/api/practice/sessions/{session_id}/complete",
                        json={"version": 5},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert completed.status_code == 200
                    body = completed.json()
                    assert body["status"] == "completed"
                    assert body["sessionId"] == str(session_id)
                    assert body["version"] == 6
                    assert body["attemptNumber"] == 1
                    assert body["completionReason"] == "reviewCompleted"
                    assert body["questionsCompleted"] == 1
                    assert body["retryCount"] == 0
                    assert body["savedQuestionCount"] == 0
                    assert body["markedWeakQuestionCount"] == 0
                    assert body["finalAttemptAverageScore"] == 82
                    assert body["nextStepSuggestion"] == (
                        "Move to the next focused question."
                    )
                    assert "attemptRecords" not in body
                    assert "questionGenerationRunId" not in body

                    replay = client.post(
                        f"/api/practice/sessions/{session_id}/complete",
                        json={"version": 5},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert replay.status_code == 200
                    assert replay.json() == body

                    current = client.get("/api/practice/sessions/current")
                    assert current.status_code == 200
                    assert current.json() == {"session": None}

                    fetched = client.get(f"/api/practice/sessions/{session_id}")
                    assert fetched.status_code == 200
                    assert fetched.json() == body
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_completion_public_api_uses_final_retry_attempt_statistics() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    user_id,
                    session_id,
                    first_attempt_id,
                    question_id,
                    _question_run_id,
                    _project_id,
                ) = await produce_first_review(database)

                async with database.sessionmaker() as session:
                    retried = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).retry_current_question(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=5,
                        question_id=question_id,
                    )
                    assert retried.attempt.attempt_number == 2
                    second_attempt_id = retried.attempt.id

                version = await _complete_retry_review(
                    database,
                    user_id=user_id,
                    session_id=session_id,
                    question_id=question_id,
                    expected_version=6,
                    provider_prefix="practice-completion-retry",
                    evaluation_score=91,
                )
                assert version == 9

                async with database.sessionmaker() as session:
                    attempts = list(
                        (
                            await session.scalars(
                                select(PracticeAttempt)
                                .where(PracticeAttempt.session_id == session_id)
                                .order_by(PracticeAttempt.attempt_number)
                            )
                        ).all()
                    )
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
                    final_evaluation = await session.scalar(
                        select(PracticeEvaluation).where(
                            PracticeEvaluation.attempt_id == second_attempt_id
                        )
                    )
                    assert len(attempts) == 2
                    assert len(question_runs) == 1
                    assert attempts[0].id == first_attempt_id
                    assert attempts[0].status == "completed"
                    assert attempts[1].id == second_attempt_id
                    assert attempts[1].status == "review"
                    assert attempts[1].retry_of_attempt_id == first_attempt_id
                    assert final_evaluation is not None
                    assert final_evaluation.overall_score == 91
                    owner = await session.get(User, user_id)
                    assert owner is not None

                settings = Settings(
                    database_url=url,
                    llm_provider="qwen",
                    llm_model="fake-practice-model",
                    cors_allowed_origins=[TRUSTED_ORIGIN],
                    session_digest_key="practice-completion-retry-api-test-key",
                    session_cookie_secure=False,
                )
                app = create_app(settings)
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    completed = client.post(
                        f"/api/practice/sessions/{session_id}/complete",
                        json={"version": version},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert completed.status_code == 200
                    body = completed.json()
                    assert body["questionsCompleted"] == 1
                    assert body["retryCount"] == 1
                    assert body["finalAttemptAverageScore"] == 91
                    assert body["attemptId"] == str(second_attempt_id)
                    assert body["attemptNumber"] == 2
            finally:
                await database.reset()

    asyncio.run(run_test())
