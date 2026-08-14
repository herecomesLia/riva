import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from riva.agents import PracticeReferenceAnswerAgent
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import PracticeReferenceAnswerArtifact
from riva.workers import (
    AgentHandlerRegistry,
    AgentWorker,
    PracticeReferenceAnswerHandler,
)
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_practice_answer_workflow import (
    build_follow_up_worker,
    build_question_worker,
    question_response,
)
from tests.integration.test_practice_reference_answer_workflow import (
    follow_up_question_response,
)
from tests.integration.test_question_generation import (
    SilentLogger,
    database_url,
    seed_context,
)


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"
START = datetime(2026, 8, 14, 9, 30, tzinfo=UTC)


def settings(url: str) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen",
        llm_model="fake-practice-model",
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="practice-reference-answer-api-test-key",
        session_cookie_secure=False,
    )


def build_reference_worker(
    database: Database,
    provider: FakeLLMProvider,
) -> AgentWorker:
    registry = AgentHandlerRegistry()
    registry.register(
        PracticeReferenceAnswerHandler(
            session_factory=database.sessionmaker,
            agent=PracticeReferenceAnswerAgent(
                provider,
                model="fake-reference-model",
            ),
        )
    )
    return AgentWorker(
        worker_id="practice-reference-answer-api-worker",
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


def main_reference_response() -> dict[str, object]:
    return {
        "targetType": "main",
        "kind": "personalizedExample",
        "answer": "A canonical HTTP reference answer.",
        "keyPoints": ["State the decision.", "Connect the evidence."],
        "commonMistakes": ["Inventing an unsupported metric."],
    }


def follow_up_reference_response() -> dict[str, object]:
    return {
        "targetType": "followUp",
        "kind": "personalizedSupplement",
        "addressedGap": "Connect the decision to measurable attribution.",
        "answer": "Tie the decision to the measurable result.",
        "keyPoints": ["Name the baseline.", "Connect the result."],
        "commonMistakes": ["Claiming team impact as personal impact."],
    }


async def start_http_answering(
    client: TestClient,
    database: Database,
    role_id: UUID,
    project_id: UUID,
) -> dict[str, object]:
    started = client.post(
        "/api/practice/sessions",
        json={
            "targetRoleId": str(role_id),
            "questionType": "projectDeepDive",
            "difficulty": "basic",
            "source": "personalized",
            "prioritizeWeaknesses": False,
        },
        headers={"Origin": TRUSTED_ORIGIN, "Accept-Language": "en-US"},
    )
    assert started.status_code == 202
    session_id = started.json()["sessionId"]

    assert await build_question_worker(
        database,
        FakeLLMProvider(
            [question_response(project_id)],
            provider="fake-question-provider",
            usage=LLMUsage(input_tokens=20, output_tokens=10),
        ),
    ).process_one()

    refreshed = client.post(
        f"/api/practice/sessions/{session_id}/question-generation/refresh",
        json={"version": 1},
        headers={"Origin": TRUSTED_ORIGIN},
    )
    assert refreshed.status_code == 200
    body = refreshed.json()
    assert body["status"] == "answering"
    assert body["version"] == 2
    return body


def test_practice_reference_answer_http_main_lifecycle_and_browser_recovery() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    answering = await start_http_answering(
                        client,
                        database,
                        role.id,
                        project_id,
                    )
                    session_id = answering["sessionId"]
                    question_id = answering["question"]["id"]

                    initial = client.get("/api/practice/sessions/current")
                    assert initial.status_code == 200
                    assert initial.json()["session"]["question"]["referenceAnswer"] == {
                        "status": "notRequested",
                        "content": None,
                        "viewedBeforeSubmission": False,
                    }

                    requested = client.post(
                        f"/api/practice/sessions/{session_id}/questions/reference-answer",
                        json={"version": 2, "questionId": question_id},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert requested.status_code == 202
                    requested_body = requested.json()
                    assert requested_body["status"] == "answering"
                    assert requested_body["version"] == 3
                    assert requested_body["question"]["referenceAnswer"] == {
                        "status": "generating",
                        "content": None,
                        "viewedBeforeSubmission": False,
                    }

                    generating = client.get("/api/practice/sessions/current")
                    assert generating.status_code == 200
                    assert generating.json()["session"]["question"][
                        "referenceAnswer"
                    ]["status"] == "generating"

                    provider = FakeLLMProvider(
                        [main_reference_response()],
                        provider="fake-reference-provider",
                        usage=LLMUsage(input_tokens=30, output_tokens=20),
                    )
                    assert await build_reference_worker(database, provider).process_one()

                    refreshed = client.post(
                        f"/api/practice/sessions/{session_id}/questions/reference-answer/refresh",
                        json={"version": 3, "questionId": question_id},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert refreshed.status_code == 200
                    body = refreshed.json()
                    assert body["version"] == 3
                    reference = body["question"]["referenceAnswer"]
                    assert reference["status"] == "revealed"
                    assert reference["viewedBeforeSubmission"] is True
                    assert reference["content"] == {
                        "kind": "personalizedExample",
                        "answer": "A canonical HTTP reference answer.",
                        "keyPoints": ["State the decision.", "Connect the evidence."],
                        "commonMistakes": ["Inventing an unsupported metric."],
                        "generatedAt": reference["content"]["generatedAt"],
                    }
                    assert reference["content"]["generatedAt"].endswith("+00:00") or reference[
                        "content"
                    ]["generatedAt"].endswith("Z")

                    recovered = client.get("/api/practice/sessions/current")
                    assert recovered.status_code == 200
                    assert recovered.json()["session"]["question"][
                        "referenceAnswer"
                    ] == reference

                    replay = client.post(
                        f"/api/practice/sessions/{session_id}/questions/reference-answer/refresh",
                        json={"version": 3, "questionId": question_id},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert replay.status_code == 200
                    assert replay.json() == body

                    async with database.sessionmaker() as session:
                        artifact_count = await session.scalar(
                            select(func.count()).select_from(
                                PracticeReferenceAnswerArtifact
                            ).where(
                                PracticeReferenceAnswerArtifact.question_card_id
                                == UUID(question_id),
                                PracticeReferenceAnswerArtifact.target_type == "main",
                            )
                        )
                    assert artifact_count == 1
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_reference_answer_http_recovers_after_main_submit_before_worker() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    answering = await start_http_answering(
                        client,
                        database,
                        role.id,
                        project_id,
                    )
                    session_id = answering["sessionId"]
                    question_id = answering["question"]["id"]
                    requested = client.post(
                        f"/api/practice/sessions/{session_id}/questions/reference-answer",
                        json={"version": 2, "questionId": question_id},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert requested.status_code == 202

                    submitted = client.post(
                        f"/api/practice/sessions/{session_id}/answers/main",
                        json={
                            "version": 3,
                            "questionId": question_id,
                            "content": "I owned the rollout and measured the result.",
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert submitted.status_code == 202
                    submitted_body = submitted.json()
                    assert submitted_body["status"] == "generatingFollowUp"
                    assert submitted_body["version"] == 4
                    assert submitted_body["question"]["referenceAnswer"]["status"] == (
                        "generating"
                    )

                    stale_refresh = client.post(
                        f"/api/practice/sessions/{session_id}/questions/reference-answer/refresh",
                        json={"version": 3, "questionId": question_id},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert stale_refresh.status_code == 409

                    provider = FakeLLMProvider(
                        [main_reference_response()],
                        provider="fake-reference-provider",
                    )
                    assert await build_reference_worker(database, provider).process_one()

                    recovered = client.get("/api/practice/sessions/current")
                    assert recovered.status_code == 200
                    recovered_body = recovered.json()["session"]
                    assert recovered_body["status"] == "generatingFollowUp"
                    assert recovered_body["version"] == 4
                    assert recovered_body["question"]["referenceAnswer"]["status"] == (
                        "revealed"
                    )
                    assert recovered_body["question"]["referenceAnswer"][
                        "viewedBeforeSubmission"
                    ] is False
                    assert "I owned the rollout" not in provider.calls[0].messages[-1].content
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_reference_answer_http_follow_up_q1_q2_lineage() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    answering = await start_http_answering(
                        client,
                        database,
                        role.id,
                        project_id,
                    )
                    session_id = answering["sessionId"]
                    question_id = answering["question"]["id"]
                    main_submitted = client.post(
                        f"/api/practice/sessions/{session_id}/answers/main",
                        json={
                            "version": 2,
                            "questionId": question_id,
                            "content": "I owned the rollout and measured the result.",
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert main_submitted.status_code == 202
                    assert main_submitted.json()["version"] == 3

                    assert await build_follow_up_worker(
                        database,
                        FakeLLMProvider(
                            [follow_up_question_response(1)],
                            provider="fake-follow-up-provider",
                        ),
                    ).process_one()
                    q1_ready = client.post(
                        f"/api/practice/sessions/{session_id}/follow-up-generation/refresh",
                        json={"version": 3},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert q1_ready.status_code == 200
                    q1_ready_body = q1_ready.json()
                    assert q1_ready_body["status"] == "answeringFollowUp"
                    assert q1_ready_body["version"] == 4
                    q1_id = q1_ready_body["currentFollowUp"]["question"]["id"]
                    assert q1_ready_body["currentFollowUp"]["question"][
                        "referenceAnswer"
                    ]["status"] == "notRequested"

                    q1_requested = client.post(
                        f"/api/practice/sessions/{session_id}/follow-ups/reference-answer",
                        json={
                            "version": 4,
                            "questionId": question_id,
                            "followUpQuestionId": q1_id,
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert q1_requested.status_code == 202
                    assert q1_requested.json()["version"] == 5
                    assert q1_requested.json()["currentFollowUp"]["question"][
                        "referenceAnswer"
                    ]["status"] == "generating"

                    assert await build_reference_worker(
                        database,
                        FakeLLMProvider(
                            [follow_up_reference_response()],
                            provider="fake-reference-provider",
                        ),
                    ).process_one()
                    q1_revealed = client.post(
                        f"/api/practice/sessions/{session_id}/follow-ups/reference-answer/refresh",
                        json={
                            "version": 5,
                            "questionId": question_id,
                            "followUpQuestionId": q1_id,
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert q1_revealed.status_code == 200
                    q1_reference = q1_revealed.json()["currentFollowUp"]["question"][
                        "referenceAnswer"
                    ]
                    assert q1_reference["status"] == "revealed"
                    assert q1_reference["content"]["addressedGap"] == (
                        "Connect the decision to measurable attribution."
                    )
                    assert q1_reference["viewedBeforeSubmission"] is True

                    q1_answered = client.post(
                        f"/api/practice/sessions/{session_id}/answers/follow-up",
                        json={
                            "version": 5,
                            "questionId": question_id,
                            "followUpQuestionId": q1_id,
                            "content": "I measured the result against the baseline.",
                        },
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert q1_answered.status_code == 202
                    assert q1_answered.json()["version"] == 6
                    assert q1_answered.json()["followUpExchanges"][0]["question"][
                        "referenceAnswer"
                    ]["status"] == "revealed"

                    assert await build_follow_up_worker(
                        database,
                        FakeLLMProvider(
                            [follow_up_question_response(2)],
                            provider="fake-follow-up-provider",
                        ),
                    ).process_one()
                    q2_ready = client.post(
                        f"/api/practice/sessions/{session_id}/follow-up-generation/refresh",
                        json={"version": 6},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert q2_ready.status_code == 200
                    q2_body = q2_ready.json()
                    assert q2_body["version"] == 7
                    q2_id = q2_body["currentFollowUp"]["question"]["id"]
                    assert q2_id != q1_id
                    assert q2_body["followUpExchanges"][0]["question"][
                        "referenceAnswer"
                    ]["status"] == "revealed"
                    assert q2_body["currentFollowUp"]["question"]["referenceAnswer"] == {
                        "status": "notRequested",
                        "content": None,
                        "viewedBeforeSubmission": False,
                    }

                    async with database.sessionmaker() as session:
                        q1_artifacts = await session.scalar(
                            select(func.count()).select_from(
                                PracticeReferenceAnswerArtifact
                            ).where(
                                PracticeReferenceAnswerArtifact.question_card_id
                                == UUID(question_id),
                                PracticeReferenceAnswerArtifact.follow_up_question_id
                                == UUID(q1_id),
                            )
                        )
                    assert q1_artifacts == 1
            finally:
                await database.reset()

    asyncio.run(run_test())
