import asyncio
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select

from riva.agents import QuestionGenerationAgent
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    PracticeAnswer,
    PracticeAttempt,
    PracticeSession,
    User,
)
from riva.services.practice_sessions import PracticeSessionService
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_practice_early_completion_workflow import (
    _produce_answering_session,
)
from tests.integration.test_practice_next_question_workflow import (
    build_worker,
    produce_first_review,
    question_output,
)
from tests.integration.test_question_generation import database_url, seed_context


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


def settings(url: str) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen",
        llm_model="fake-practice-model",
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="practice-early-completion-api-test-key",
        session_cookie_secure=False,
    )


def test_practice_early_completion_public_api_rejects_generating_follow_up() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
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
                            "source": "personalized",
                            "prioritizeWeaknesses": False,
                        },
                        headers=headers,
                    )
                    assert started.status_code == 202
                    started_body = started.json()
                    session_id = UUID(started_body["sessionId"])
                    attempt_id = UUID(started_body["attemptId"])
                    assert started_body["status"] == "generatingQuestion"
                    assert started_body["version"] == 1

                    assert await build_worker(
                        database,
                        QuestionGenerationAgent(
                            FakeLLMProvider(
                                [
                                    question_output(
                                        project_id,
                                        prompt=(
                                            "Explain how you improved the payment "
                                            "workflow."
                                        ),
                                    )
                                ],
                                provider=(
                                    "practice-early-completion-generating-follow-up-"
                                    "provider"
                                ),
                                usage=LLMUsage(input_tokens=20, output_tokens=10),
                            ),
                            model="fake-practice-model",
                        ),
                    ).process_one()

                    refreshed = client.post(
                        f"/api/practice/sessions/{session_id}/"
                        "question-generation/refresh",
                        json={"version": started_body["version"]},
                        headers=headers,
                    )
                    assert refreshed.status_code == 200
                    answering = refreshed.json()
                    assert answering["status"] == "answering"
                    assert answering["version"] == 2
                    question_id = answering["question"]["id"]

                    submitted = client.post(
                        f"/api/practice/sessions/{session_id}/answers/main",
                        json={
                            "version": answering["version"],
                            "questionId": question_id,
                            "content": "A valid submitted answer.",
                        },
                        headers=headers,
                    )
                    assert submitted.status_code == 202
                    generating_follow_up = submitted.json()
                    assert generating_follow_up["status"] == "generatingFollowUp"
                    generating_follow_up_version = generating_follow_up["version"]

                    ended = client.post(
                        f"/api/practice/sessions/{session_id}/end",
                        json={
                            "version": generating_follow_up_version,
                            "questionId": question_id,
                        },
                        headers=headers,
                    )
                    assert ended.status_code == 409
                    assert ended.json() == {
                        "error": "practice_session_state_conflict"
                    }

                    async with database.sessionmaker() as session:
                        persisted_session = await session.get(
                            PracticeSession,
                            session_id,
                        )
                        persisted_attempt = await session.get(
                            PracticeAttempt,
                            attempt_id,
                        )
                        main_answers = list(
                            (
                                await session.scalars(
                                    select(PracticeAnswer).where(
                                        PracticeAnswer.attempt_id == attempt_id,
                                        PracticeAnswer.kind == "main",
                                    )
                                )
                            ).all()
                        )
                        follow_up_runs = list(
                            (
                                await session.scalars(
                                    select(AgentRun).where(
                                        AgentRun.user_id == owner.id,
                                        AgentRun.agent_id == "follow-up-generator",
                                        AgentRun.payload["attemptId"].as_string()
                                        == str(attempt_id),
                                    )
                                )
                            ).all()
                        )

                        assert persisted_session is not None
                        assert persisted_session.status == "active"
                        assert persisted_session.completion_reason is None
                        assert persisted_session.completed_at is None
                        assert persisted_session.version == generating_follow_up_version
                        assert persisted_attempt is not None
                        assert persisted_attempt.status == "answering"
                        assert persisted_attempt.completed_at is None
                        assert len(main_answers) == 1
                        assert main_answers[0].content == (
                            "A valid submitted answer."
                        )
                        assert len(follow_up_runs) == 1
                        assert follow_up_runs[0].agent_id == "follow-up-generator"

                    current = client.get("/api/practice/sessions/current")
                    assert current.status_code == 200
                    current_body = current.json()["session"]
                    assert current_body["status"] == "generatingFollowUp"
                    assert current_body["version"] == generating_follow_up_version
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_early_completion_public_api_replay_get_and_current_release() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    user_id,
                    _role_id,
                    session_id,
                    attempt_id,
                    question_id,
                    question_run_id,
                ) = await _produce_answering_session(database)
                async with database.sessionmaker() as session:
                    owner = await session.get(User, user_id)
                    assert owner is not None

                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner
                path = f"/api/practice/sessions/{session_id}/end"
                request_body = {"version": 2, "questionId": str(question_id)}
                headers = {"Origin": TRUSTED_ORIGIN}

                with TestClient(app) as client:
                    other_user = User(
                        id=uuid4(),
                        username="practice-early-completion-other-user",
                        normalized_username="practice-early-completion-other-user",
                        password_hash="hash",
                        display_name="Other User",
                    )
                    app.dependency_overrides[require_current_user] = (
                        lambda: other_user
                    )
                    isolated = client.post(
                        path,
                        json=request_body,
                        headers=headers,
                    )
                    assert isolated.status_code == 404
                    assert isolated.json() == {"error": "practice_session_not_found"}
                    app.dependency_overrides[require_current_user] = lambda: owner

                    ended = client.post(path, json=request_body, headers=headers)
                    assert ended.status_code == 200
                    body = ended.json()
                    assert body["status"] == "completed"
                    assert body["sessionId"] == str(session_id)
                    assert body["version"] == 3
                    assert body["completionReason"] == "userEndedEarly"
                    assert body["attemptId"] == str(attempt_id)
                    assert body["attemptNumber"] == 1
                    assert body["questionsCompleted"] == 0
                    assert body["retryCount"] == 0
                    assert body["savedQuestionCount"] == 0
                    assert body["markedWeakQuestionCount"] == 0
                    assert body["finalAttemptAverageScore"] == 0
                    assert body["nextStepSuggestion"] is None
                    assert body["unfinishedAttempt"]["attemptId"] == str(attempt_id)
                    assert body["unfinishedAttempt"]["attemptNumber"] == 1
                    assert body["unfinishedAttempt"]["question"]["id"] == str(
                        question_id
                    )
                    assert "mainAnswer" not in body
                    assert "evaluation" not in body
                    assert "review" not in body
                    assert "recommendation" not in body
                    assert "attemptRecords" not in body

                    replay = client.post(path, json=request_body, headers=headers)
                    assert replay.status_code == 200
                    assert replay.json() == body

                    wrong_question = client.post(
                        path,
                        json={"version": 2, "questionId": str(question_run_id)},
                        headers=headers,
                    )
                    assert wrong_question.status_code == 409
                    assert wrong_question.json() == {
                        "error": "practice_session_version_conflict"
                    }

                    current = client.get("/api/practice/sessions/current")
                    assert current.status_code == 200
                    assert current.json() == {"session": None}

                    fetched = client.get(f"/api/practice/sessions/{session_id}")
                    assert fetched.status_code == 200
                    assert fetched.json() == body

                    follow_up_refresh = client.post(
                        f"/api/practice/sessions/{session_id}/follow-up-generation/refresh",
                        json={"version": 3},
                        headers=headers,
                    )
                    assert follow_up_refresh.status_code == 409
                    assert follow_up_refresh.json() == {
                        "error": "practice_session_state_conflict"
                    }

                async with database.sessionmaker() as session:
                    persisted_session = await session.get(PracticeSession, session_id)
                    persisted_attempt = await session.get(PracticeAttempt, attempt_id)
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
                    assert persisted_session is not None
                    assert persisted_attempt is not None
                    assert persisted_session.status == "completed"
                    assert persisted_session.completion_reason == "userEndedEarly"
                    assert persisted_session.version == 3
                    assert persisted_attempt.status == "endedEarly"
                    assert persisted_attempt.completed_at is not None
                    assert len(question_runs) == 1
                    assert question_runs[0].id == question_run_id
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_early_completion_public_api_keeps_previous_question_summary() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    user_id,
                    session_id,
                    first_attempt_id,
                    first_question_id,
                    first_question_run_id,
                    project_id,
                ) = await produce_first_review(database)
                async with database.sessionmaker() as session:
                    continued = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).continue_to_next_question(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=5,
                        question_id=first_question_id,
                    )
                    second_attempt_id = continued.attempt.id

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
                            provider="practice-early-completion-api-second-provider",
                            usage=LLMUsage(input_tokens=20, output_tokens=10),
                        ),
                        model="fake-practice-model",
                    ),
                ).process_one()
                async with database.sessionmaker() as session:
                    answering = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).refresh_question_generation(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=6,
                    )
                    assert answering.question_card is not None
                    second_question_id = answering.question_card.id

                async with database.sessionmaker() as session:
                    owner = await session.get(User, user_id)
                    assert owner is not None
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    ended = client.post(
                        f"/api/practice/sessions/{session_id}/end",
                        json={"version": 7, "questionId": str(second_question_id)},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert ended.status_code == 200
                    body = ended.json()
                    assert body["version"] == 8
                    assert body["completionReason"] == "userEndedEarly"
                    assert body["attemptId"] == str(second_attempt_id)
                    assert body["attemptNumber"] == 2
                    assert body["questionsCompleted"] == 1
                    assert body["retryCount"] == 0
                    assert body["finalAttemptAverageScore"] == 82
                    assert body["nextStepSuggestion"] == (
                        "Move to the next focused question."
                    )
                    assert body["unfinishedAttempt"]["question"]["id"] == str(
                        second_question_id
                    )

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
                    persisted_session = await session.get(PracticeSession, session_id)
                    assert len(attempts) == 2
                    assert attempts[0].id == first_attempt_id
                    assert attempts[0].status == "completed"
                    assert attempts[1].id == second_attempt_id
                    assert attempts[1].status == "endedEarly"
                    assert len(question_runs) == 2
                    assert question_runs[0].id == first_question_run_id
                    assert attempts[0].question_generation_run_id != (
                        attempts[1].question_generation_run_id
                    )
                    assert persisted_session is not None
                    assert persisted_session.status == "completed"
                    assert persisted_session.version == 8
            finally:
                await database.reset()

    asyncio.run(run_test())
