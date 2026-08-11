import asyncio
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.agents import QuestionGenerationAgent
from riva.core.auth import require_current_user
from riva.core.app import create_app
from riva.core.config import Settings
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import AgentRun, PracticeAttempt, PracticeSession, User
from riva.workers import AgentHandlerRegistry, AgentWorker, QuestionGenerationHandler
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_question_generation import (
    SilentLogger,
    database_url,
    seed_context,
)


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


def test_practice_session_http_workflow_and_lost_response_replay() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                settings = Settings(
                    database_url=url,
                    llm_provider="qwen",
                    llm_model="fake-question-model",
                    cors_allowed_origins=[TRUSTED_ORIGIN],
                    session_digest_key="practice-session-http-test-key",
                    session_cookie_secure=False,
                )
                app = create_app(settings)
                app.dependency_overrides[require_current_user] = lambda: owner
                body = {
                    "targetRoleId": str(role.id),
                    "questionType": "projectDeepDive",
                    "difficulty": "basic",
                    "source": "personalized",
                    "prioritizeWeaknesses": False,
                }
                output = {
                    "prompt": "Explain how you designed the payment workflows.",
                    "question_type": "projectDeepDive",
                    "difficulty": "basic",
                    "assessed_capabilities": ["Technical decision-making"],
                    "recommended_materials": [
                        {
                            "type": "projectExperience",
                            "id": str(project_id),
                            "label": "Untrusted label",
                            "reason": "Relevant project evidence.",
                        }
                    ],
                    "answer_hints": ["Explain your personal contribution."],
                    "answer_framework": ["Context", "Decision", "Result"],
                    "follow_up_directions": ["Technical rationale"],
                    "scoring_focus": ["Evidence of personal contribution"],
                }

                with TestClient(app) as client:
                    initial_current = client.get(
                        "/api/practice/sessions/current"
                    )
                    assert initial_current.status_code == 200
                    assert initial_current.json() == {"session": None}

                    started = client.post(
                        "/api/practice/sessions",
                        json=body,
                        headers={
                            "Origin": TRUSTED_ORIGIN,
                            "Accept-Language": "en-US",
                        },
                    )
                    assert started.status_code == 202
                    started_body = started.json()
                    assert started_body["status"] == "generatingQuestion"
                    assert started_body["version"] == 1
                    assert started_body["language"] == "en"
                    session_id = started_body["sessionId"]
                    session_uuid = UUID(session_id)

                    current_generating = client.get(
                        "/api/practice/sessions/current"
                    )
                    assert current_generating.status_code == 200
                    assert current_generating.json()["session"]["sessionId"] == (
                        session_id
                    )
                    assert current_generating.json()["session"]["status"] == (
                        "generatingQuestion"
                    )
                    assert current_generating.json()["session"]["version"] == 1

                    async with database.sessionmaker() as session:
                        stored_session = await session.get(
                            PracticeSession,
                            session_uuid,
                        )
                        stored_attempt = await session.scalar(
                            select(PracticeAttempt).where(
                                PracticeAttempt.session_id == session_uuid
                            )
                        )
                        assert stored_session is not None
                        assert stored_attempt is not None
                        assert stored_attempt.question_generation_run_id is not None
                        run = await session.get(
                            AgentRun,
                            stored_attempt.question_generation_run_id,
                        )
                        assert run is not None

                    provider = FakeLLMProvider(
                        [output],
                        provider="fake-question-provider",
                        usage=LLMUsage(input_tokens=20, output_tokens=10),
                    )
                    handler = QuestionGenerationHandler(
                        session_factory=database.sessionmaker,
                        agent=QuestionGenerationAgent(
                            provider,
                            model="fake-question-model",
                        ),
                    )
                    registry = AgentHandlerRegistry()
                    registry.register(handler)
                    worker = AgentWorker(
                        worker_id="practice-session-http-worker",
                        session_factory=database.sessionmaker,
                        registry=registry,
                        lease_duration=timedelta(minutes=10),
                        heartbeat_interval=timedelta(minutes=2),
                        poll_interval=timedelta(seconds=1),
                        requeue_interval=timedelta(minutes=1),
                        retry_base_delay=timedelta(seconds=1),
                        retry_max_delay=timedelta(minutes=2),
                        logger=SilentLogger(),
                    )
                    assert await worker.process_one() is True

                    current_before_refresh = client.get(
                        "/api/practice/sessions/current"
                    )
                    assert current_before_refresh.status_code == 200
                    assert current_before_refresh.json()["session"]["status"] == (
                        "generatingQuestion"
                    )
                    assert current_before_refresh.json()["session"]["version"] == 1

                    refreshed = client.post(
                        "/api/practice/sessions/"
                        f"{session_id}/question-generation/refresh",
                        json={"version": 1},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert refreshed.status_code == 200
                    refreshed_body = refreshed.json()
                    assert refreshed_body["status"] == "answering"
                    assert refreshed_body["version"] == 2
                    question_id = refreshed_body["question"]["id"]
                    assert refreshed_body["question"]["answerHints"]["content"] is None
                    assert (
                        refreshed_body["question"]["answerFramework"]["content"]
                        is None
                    )
                    assert "sourceAgentRunId" not in refreshed_body["question"]
                    assert "templateId" not in refreshed_body["question"]

                    replay = client.post(
                        "/api/practice/sessions/"
                        f"{session_id}/question-generation/refresh",
                        json={"version": 1},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert replay.status_code == 200
                    assert replay.json()["status"] == "answering"
                    assert replay.json()["version"] == 2
                    assert replay.json()["question"]["id"] == question_id

                    current_answering = client.get(
                        "/api/practice/sessions/current"
                    )
                    assert current_answering.status_code == 200
                    assert current_answering.json()["session"]["status"] == (
                        "answering"
                    )
                    assert current_answering.json()["session"]["version"] == 2
                    assert current_answering.json()["session"]["question"]["id"] == (
                        question_id
                    )

                    fetched = client.get(f"/api/practice/sessions/{session_id}")
                    assert fetched.status_code == 200
                    assert fetched.json() == replay.json()

                    other_user = User(
                        id=uuid4(),
                        username="practice-other-user",
                        normalized_username="practice-other-user",
                        password_hash="hash",
                        display_name="Other User",
                    )
                    app.dependency_overrides[require_current_user] = (
                        lambda: other_user
                    )
                    isolated = client.get(f"/api/practice/sessions/{session_id}")
                    assert isolated.status_code == 404
                    assert isolated.json() == {"error": "practice_session_not_found"}
                    isolated_current = client.get(
                        "/api/practice/sessions/current"
                    )
                    assert isolated_current.status_code == 200
                    assert isolated_current.json() == {"session": None}
            finally:
                await database.reset()

    asyncio.run(run_test())
