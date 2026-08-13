import asyncio
from uuid import UUID

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import QuestionGenerationAgent
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.core.practice import get_practice_api_service
from riva.db.database import Database
from riva.db.session import get_db_session
from riva.integrations import LLMUsage
from riva.models import AgentRun, PracticeAttempt, PracticeSession, QuestionCard, User
from riva.services.practice_api import PracticeAPIService
from riva.services.practice_sessions import PracticeSessionService
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_practice_next_question_workflow import (
    build_worker,
    database_url,
    produce_first_review,
    question_output,
)


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


class FailingQuestionGenerationService:
    async def enqueue_generation_in_transaction(
        self,
        **kwargs: object,
    ) -> AgentRun:
        raise ValueError("missing downstream model")


def settings(url: str) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen",
        llm_model="fake-practice-model",
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="practice-next-question-api-test-key",
        session_cookie_secure=False,
    )


def test_practice_next_question_http_workflow_replay_poll_and_rollback() -> None:
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
                    project_id,
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

                async def get_failing_service(
                    session: AsyncSession = Depends(get_db_session),
                ) -> PracticeAPIService:
                    return PracticeAPIService(
                        session,
                        llm_provider="qwen",
                        llm_model="fake-practice-model",
                        practice_service_factory=(
                            lambda service_session, **service_kwargs: PracticeSessionService(
                                service_session,
                                question_generation_service_factory=(
                                    lambda _session, **_kwargs: FailingQuestionGenerationService()
                                ),
                                **service_kwargs,
                            )
                        ),
                    )

                path = f"/api/practice/sessions/{session_id}/questions/next"
                headers = {"Origin": TRUSTED_ORIGIN}
                request_body = {
                    "version": 5,
                    "questionId": str(first_card_id),
                }

                other_user = User(
                    id=UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
                    username="practice-next-question-other-user",
                    normalized_username="practice-next-question-other-user",
                    password_hash="hash",
                    display_name="Other User",
                )
                app.dependency_overrides[require_current_user] = lambda: other_user
                with TestClient(app) as client:
                    isolated = client.post(path, json=request_body, headers=headers)
                    assert isolated.status_code == 404
                    assert isolated.json() == {"error": "practice_session_not_found"}
                app.dependency_overrides[require_current_user] = lambda: owner

                app.dependency_overrides[get_practice_api_service] = get_failing_service
                with TestClient(app) as client:
                    failed = client.post(path, json=request_body, headers=headers)
                    assert failed.status_code == 503
                    assert failed.json() == {
                        "error": "practice_question_generation_unavailable"
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
                        failed_attempt = await session.get(PracticeAttempt, first_attempt_id)
                        failed_session = await session.get(PracticeSession, session_id)
                        assert len(attempts) == 1
                        assert len(question_runs) == 1
                        assert failed_attempt is not None
                        assert failed_session is not None
                        assert failed_attempt.status == "review"
                        assert failed_attempt.completed_at == completed_at
                        assert failed_session.version == 5

                    app.dependency_overrides.pop(get_practice_api_service)
                    continued = client.post(path, json=request_body, headers=headers)
                    assert continued.status_code == 202
                    continued_body = continued.json()
                    assert continued_body["sessionId"] == str(session_id)
                    assert continued_body["version"] == 6
                    assert continued_body["status"] == "generatingQuestion"
                    assert continued_body["attemptNumber"] == 2
                    second_attempt_id = UUID(continued_body["attemptId"])

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
                        first_attempt = await session.get(PracticeAttempt, first_attempt_id)
                        second_attempt = await session.get(PracticeAttempt, second_attempt_id)
                        practice_session = await session.get(PracticeSession, session_id)
                        assert len(attempts) == 2
                        assert len(question_runs) == 2
                        assert first_attempt is not None
                        assert second_attempt is not None
                        assert practice_session is not None
                        assert first_attempt.status == "completed"
                        assert first_attempt.completed_at == completed_at
                        assert second_attempt.attempt_number == 2
                        assert second_attempt.status == "generatingQuestion"
                        assert second_attempt.retry_of_attempt_id is None
                        assert second_attempt.question_generation_run_id is not None
                        assert first_attempt.question_generation_run_id == first_run_id
                        assert second_attempt.question_generation_run_id != first_run_id
                        second_run_id = second_attempt.question_generation_run_id
                        assert practice_session.status == "active"
                        assert practice_session.version == 6

                    replay = client.post(path, json=request_body, headers=headers)
                    assert replay.status_code == 202
                    assert replay.json() == continued_body

                    current = client.get("/api/practice/sessions/current")
                    assert current.status_code == 200
                    assert current.json()["session"] == continued_body

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
                        second_attempt = await session.get(PracticeAttempt, second_attempt_id)
                        replayed_session = await session.get(PracticeSession, session_id)
                        assert len(attempts) == 2
                        assert len(question_runs) == 2
                        assert second_attempt is not None
                        assert second_attempt.question_generation_run_id == second_run_id
                        assert replayed_session is not None
                        assert replayed_session.version == 6

                    assert await build_worker(
                        database,
                        QuestionGenerationAgent(
                            FakeLLMProvider(
                                [
                                    question_output(
                                        project_id,
                                        prompt="Explain a different payment decision.",
                                    )
                                ],
                                provider="practice-next-question-api-provider",
                                usage=LLMUsage(input_tokens=20, output_tokens=10),
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()

                    refreshed = client.post(
                        f"/api/practice/sessions/{session_id}/question-generation/refresh",
                        json={"version": 6},
                        headers=headers,
                    )
                    assert refreshed.status_code == 200
                    refreshed_body = refreshed.json()
                    assert refreshed_body["status"] == "answering"
                    assert refreshed_body["version"] == 7
                    assert refreshed_body["attemptId"] == str(second_attempt_id)
                    assert refreshed_body["attemptNumber"] == 2
                    second_card_id = UUID(refreshed_body["question"]["id"])
                    assert second_card_id != first_card_id

                    async with database.sessionmaker() as session:
                        first_attempt = await session.get(PracticeAttempt, first_attempt_id)
                        second_attempt = await session.get(PracticeAttempt, second_attempt_id)
                        first_card = await session.get(QuestionCard, first_card_id)
                        second_card = await session.get(QuestionCard, second_card_id)
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
                        practice_session = await session.get(PracticeSession, session_id)
                        assert first_attempt is not None
                        assert second_attempt is not None
                        assert first_card is not None
                        assert second_card is not None
                        assert first_attempt.status == "completed"
                        assert first_attempt.completed_at == completed_at
                        assert second_attempt.status == "answering"
                        assert first_card.id != second_card.id
                        assert first_attempt.question_generation_run_id != (
                            second_attempt.question_generation_run_id
                        )
                        assert len(question_runs) == 2
                        assert practice_session is not None
                        assert practice_session.status == "active"
                        assert practice_session.version == 7
            finally:
                await database.reset()

    asyncio.run(run_test())
