import asyncio
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.models import (
    AgentRun,
    PracticeAnswer,
    PracticeAttempt,
    PracticeSession,
    QuestionCard,
    User,
)
from tests.integration.test_practice_next_question_workflow import (
    database_url,
    produce_first_review,
)

pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


def settings(url: str) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen",
        llm_model="fake-practice-model",
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="practice-retry-api-test-key",
        session_cookie_secure=False,
    )


async def retry_snapshot(
    database: Database,
    *,
    user_id: UUID,
    session_id: UUID,
) -> tuple[list[PracticeAttempt], list[AgentRun], list[QuestionCard]]:
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
        cards = list(
            (
                await session.scalars(
                    select(QuestionCard).where(QuestionCard.user_id == user_id)
                )
            ).all()
        )
        return attempts, question_runs, cards


def test_practice_retry_http_workflow_replay_get_and_submit() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    user_id,
                    session_id,
                    first_attempt_id,
                    first_card_id,
                    first_run_id,
                    _project_id,
                ) = await produce_first_review(database)

                async with database.sessionmaker() as session:
                    owner = await session.get(User, user_id)
                    first_attempt = await session.get(PracticeAttempt, first_attempt_id)
                    practice_session = await session.get(PracticeSession, session_id)
                    assert owner is not None
                    assert first_attempt is not None
                    assert practice_session is not None
                    assert first_attempt.status == "review"
                    assert practice_session.status == "active"
                    assert practice_session.version == 5
                    completed_at = first_attempt.completed_at
                    assert completed_at is not None

                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner
                path = f"/api/practice/sessions/{session_id}/questions/retry"
                headers = {"Origin": TRUSTED_ORIGIN}
                request_body = {
                    "version": 5,
                    "questionId": str(first_card_id),
                }

                with TestClient(app) as client:
                    retried = client.post(path, json=request_body, headers=headers)
                    assert retried.status_code == 200
                    retried_body = retried.json()
                    assert retried_body["status"] == "answering"
                    assert retried_body["sessionId"] == str(session_id)
                    assert retried_body["version"] == 6
                    assert retried_body["attemptNumber"] == 2
                    assert retried_body["question"]["id"] == str(first_card_id)
                    assert retried_body["attemptId"] != str(first_attempt_id)
                    for field in (
                        "retryOfAttemptId",
                        "questionGenerationRunId",
                        "originalAttemptId",
                    ):
                        assert field not in retried_body

                    attempts, question_runs, cards = await retry_snapshot(
                        database,
                        user_id=user_id,
                        session_id=session_id,
                    )
                    assert len(attempts) == 2
                    assert len(question_runs) == 1
                    assert question_runs[0].id == first_run_id
                    assert len(cards) == 1
                    second_attempt_id = UUID(retried_body["attemptId"])
                    async with database.sessionmaker() as session:
                        first_attempt = await session.get(
                            PracticeAttempt, first_attempt_id
                        )
                        second_attempt = await session.get(
                            PracticeAttempt, second_attempt_id
                        )
                        assert first_attempt is not None
                        assert second_attempt is not None
                        assert first_attempt.status == "completed"
                        assert first_attempt.completed_at == completed_at
                        assert second_attempt.status == "answering"
                        assert second_attempt.attempt_number == 2
                        assert second_attempt.retry_of_attempt_id == first_attempt_id
                        assert second_attempt.question_card_id == first_card_id
                        assert second_attempt.question_generation_run_id is None

                    replay = client.post(path, json=request_body, headers=headers)
                    assert replay.status_code == 200
                    assert replay.json() == retried_body

                    attempts, question_runs, cards = await retry_snapshot(
                        database,
                        user_id=user_id,
                        session_id=session_id,
                    )
                    assert len(attempts) == 2
                    assert len(question_runs) == 1
                    assert len(cards) == 1

                    current = client.get("/api/practice/sessions/current")
                    assert current.status_code == 200
                    assert current.json() == {"session": retried_body}

                    invalid_replay = client.post(
                        path,
                        json={"version": 5, "questionId": str(uuid4())},
                        headers=headers,
                    )
                    assert invalid_replay.status_code == 409
                    assert invalid_replay.json() == {
                        "error": "practice_session_version_conflict"
                    }

                    for invalid_body in (
                        {"questionId": str(first_card_id)},
                        {"version": 0, "questionId": str(first_card_id)},
                        {"version": 5, "questionId": "not-a-uuid"},
                        {
                            "version": 5,
                            "questionId": str(first_card_id),
                            "retryOfAttemptId": str(first_attempt_id),
                        },
                    ):
                        invalid = client.post(path, json=invalid_body, headers=headers)
                        assert invalid.status_code == 422

                    other_user = User(
                        id=uuid4(),
                        username="practice-retry-api-other-user",
                        normalized_username="practice-retry-api-other-user",
                        password_hash="hash",
                        display_name="Other User",
                    )
                    app.dependency_overrides[require_current_user] = lambda: other_user
                    isolated = client.post(path, json=request_body, headers=headers)
                    assert isolated.status_code == 404
                    assert isolated.json() == {"error": "practice_session_not_found"}
                    app.dependency_overrides[require_current_user] = lambda: owner

                    submitted = client.post(
                        f"/api/practice/sessions/{session_id}/answers/main",
                        json={
                            "version": 6,
                            "questionId": str(first_card_id),
                            "content": "The retry answer contains new evidence.",
                        },
                        headers=headers,
                    )
                    assert submitted.status_code == 202
                    submitted_body = submitted.json()
                    assert submitted_body["status"] == "generatingFollowUp"
                    assert submitted_body["version"] == 7
                    assert submitted_body["attemptId"] == str(second_attempt_id)

                    async with database.sessionmaker() as session:
                        retry_answer = await session.scalar(
                            select(PracticeAnswer).where(
                                PracticeAnswer.attempt_id == second_attempt_id,
                                PracticeAnswer.kind == "main",
                            )
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
                        practice_session = await session.get(
                            PracticeSession, session_id
                        )
                        assert retry_answer is not None
                        assert (
                            retry_answer.content
                            == "The retry answer contains new evidence."
                        )
                        assert retry_answer.attempt_id == second_attempt_id
                        assert len(attempts) == 2
                        assert practice_session is not None
                        assert practice_session.status == "active"
                        assert practice_session.version == 7

                    attempts, question_runs, cards = await retry_snapshot(
                        database,
                        user_id=user_id,
                        session_id=session_id,
                    )
                    assert len(attempts) == 2
                    assert len(question_runs) == 1
                    assert len(cards) == 1
            finally:
                await database.reset()

    asyncio.run(run_test())
