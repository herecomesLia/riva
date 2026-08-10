import asyncio
from datetime import timedelta
import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from riva.agents import QuestionGenerationAgent
from riva.core.auth import require_current_user
from riva.core.app import create_app
from riva.core.config import Settings
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.workers import AgentHandlerRegistry, AgentWorker, QuestionGenerationHandler
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_question_generation import seed_context


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def test_question_card_http_flow_with_real_worker() -> None:
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
                    session_digest_key="question-card-http-test-key",
                    session_cookie_secure=False,
                )
                app = create_app(settings)
                app.dependency_overrides[require_current_user] = lambda: owner

                request_id = uuid4()
                body = {
                    "requestId": str(request_id),
                    "targetRoleId": str(role.id),
                    "questionType": "projectDeepDive",
                    "difficulty": "basic",
                }
                response_a = {
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
                    started = client.post(
                        "/api/question-cards/generations",
                        json=body,
                        headers={
                            "Origin": TRUSTED_ORIGIN,
                            "Accept-Language": "en-US",
                        },
                    )
                    assert started.status_code == 202
                    run_id = started.json()["runId"]
                    assert started.json()["status"] == "queued"
                    assert started.json()["language"] == "en"

                    provider = FakeLLMProvider(
                        [response_a],
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
                        worker_id="question-card-http-worker",
                        session_factory=database.sessionmaker,
                        registry=registry,
                        lease_duration=timedelta(minutes=10),
                        heartbeat_interval=timedelta(minutes=2),
                        poll_interval=timedelta(seconds=1),
                        requeue_interval=timedelta(minutes=1),
                        retry_base_delay=timedelta(seconds=1),
                        retry_max_delay=timedelta(minutes=2),
                    )
                    assert await worker.process_one() is True

                    succeeded = client.get(
                        f"/api/question-cards/generations/{run_id}"
                    )
                    assert succeeded.status_code == 200
                    succeeded_body = succeeded.json()
                    assert succeeded_body["status"] == "succeeded"
                    assert succeeded_body["questionCard"]["prompt"] == response_a[
                        "prompt"
                    ]
                    card_id = succeeded_body["questionCard"]["id"]
                    assert succeeded_body["questionCard"]["language"] == "en"
                    assert succeeded_body["questionCard"]["recommendedMaterials"][0][
                        "label"
                    ] == "Payment Platform"

                    card = client.get(f"/api/question-cards/{card_id}")
                    assert card.status_code == 200
                    assert card.json() == succeeded_body["questionCard"]

                    replay = client.post(
                        "/api/question-cards/generations",
                        json=body,
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert replay.status_code == 202
                    assert replay.json()["runId"] == run_id
                    assert replay.json()["status"] == "succeeded"

                    new_request = {**body, "requestId": str(uuid4())}
                    new_generation = client.post(
                        "/api/question-cards/generations",
                        json=new_request,
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert new_generation.status_code == 202
                    assert new_generation.json()["runId"] != run_id
            finally:
                await database.reset()

    asyncio.run(run_test())
