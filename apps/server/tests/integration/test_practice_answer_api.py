import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.agents import (
    FollowUpAgent,
    PracticeEvaluationAgent,
    QuestionGenerationAgent,
)
from riva.agents.evaluation import practice_evaluation_idempotency_key
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeFollowUpDecision,
)
from riva.prompts import PRACTICE_EVALUATION_PROMPT
from riva.schemas.evaluation import EvaluationRunPayload
from riva.workers import (
    AgentHandlerRegistry,
    AgentWorker,
    FollowUpHandler,
    PracticeEvaluationHandler,
    QuestionGenerationHandler,
)
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_question_generation import (
    SilentLogger,
    database_url,
    seed_context,
)

pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


def settings(url: str) -> Settings:
    return Settings(
        database_url=url,
        llm_provider="qwen",
        llm_model="fake-practice-model",
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="practice-answer-api-test-key",
        session_cookie_secure=False,
    )


def build_worker(
    database: Database,
    *,
    agent: QuestionGenerationAgent | FollowUpAgent | PracticeEvaluationAgent,
) -> AgentWorker:
    if isinstance(agent, QuestionGenerationAgent):
        handler = QuestionGenerationHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        worker_id = "practice-answer-question-worker"
    elif isinstance(agent, FollowUpAgent):
        handler = FollowUpHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        worker_id = "practice-answer-follow-up-worker"
    else:
        handler = PracticeEvaluationHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        worker_id = "practice-answer-evaluation-worker"
    registry = AgentHandlerRegistry()
    registry.register(handler)
    return AgentWorker(
        worker_id=worker_id,
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


def question_output(project_id: UUID) -> dict[str, object]:
    return {
        "prompt": "Explain how you improved the payment workflow.",
        "question_type": "projectDeepDive",
        "difficulty": "basic",
        "assessed_capabilities": ["Technical decision-making"],
        "recommended_materials": [
            {
                "type": "projectExperience",
                "id": str(project_id),
                "label": "Payment Platform",
                "reason": "Relevant project evidence.",
            }
        ],
        "answer_hints": ["Explain your personal contribution."],
        "answer_framework": ["Context", "Decision", "Result"],
        "follow_up_directions": ["Probe the metric."],
        "scoring_focus": ["Evidence of personal contribution"],
    }


def ask_output() -> dict[str, object]:
    return {
        "action": "askFollowUp",
        "prompt": "What metric changed after the rollout?",
        "focus": "Attribution evidence",
        "answer_hints": ["Name the baseline and result."],
        "answer_framework": ["Baseline", "Result"],
    }


def evaluation_output() -> dict[str, object]:
    return {
        "overallScore": 82,
        "dimensionScores": [
            {
                "dimension": dimension,
                "score": 82,
                "explanation": f"Evidence supports {dimension}.",
            }
            for dimension in (
                "relevance",
                "structure",
                "specificity",
                "communication",
            )
        ],
        "focusAssessments": [
            {
                "focusIndex": 0,
                "status": "demonstrated",
                "explanation": "The answer provides evidence.",
            }
        ],
    }


async def start_answering(
    client: TestClient,
    database: Database,
    role_id: UUID,
    project_id: UUID,
) -> tuple[str, dict[str, object]]:
    started = client.post(
        "/api/practice/sessions",
        json={
            "targetRoleId": str(role_id),
            "questionType": "projectDeepDive",
            "difficulty": "basic",
            "source": "personalized",
            "prioritizeWeaknesses": False,
        },
        headers={
            "Origin": TRUSTED_ORIGIN,
            "Accept-Language": "en-US",
        },
    )
    assert started.status_code == 202
    started_body = started.json()
    session_id = started_body["sessionId"]

    question_provider = FakeLLMProvider(
        [question_output(project_id)],
        provider="fake-question-provider",
        usage=LLMUsage(input_tokens=20, output_tokens=10),
    )
    assert await build_worker(
        database,
        agent=QuestionGenerationAgent(
            question_provider,
            model="fake-practice-model",
        ),
    ).process_one()

    refreshed = client.post(
        f"/api/practice/sessions/{session_id}/question-generation/refresh",
        json={"version": 1},
        headers={"Origin": TRUSTED_ORIGIN},
    )
    assert refreshed.status_code == 200
    refreshed_body = refreshed.json()
    assert refreshed_body["status"] == "answering"
    assert refreshed_body["version"] == 2
    return session_id, refreshed_body


def test_practice_answer_api_recovers_and_replays_ask_flow() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    session_id, answering = await start_answering(
                        client,
                        database,
                        role.id,
                        project_id,
                    )
                    question_id = answering["question"]["id"]
                    main_payload = {
                        "version": 2,
                        "questionId": question_id,
                        "content": "I owned the rollout and reduced failures.",
                    }

                    submitted = client.post(
                        f"/api/practice/sessions/{session_id}/answers/main",
                        json=main_payload,
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert submitted.status_code == 202
                    submitted_body = submitted.json()
                    assert submitted_body["status"] == "generatingFollowUp"
                    assert submitted_body["version"] == 3
                    main_answer_id = submitted_body["mainAnswer"]["id"]
                    assert submitted_body["mainAnswer"]["order"] == 1
                    assert submitted_body["followUpExchanges"] == []

                    pending = client.get("/api/practice/sessions/current")
                    assert pending.status_code == 200
                    assert pending.json()["session"]["status"] == ("generatingFollowUp")
                    assert pending.json()["session"]["version"] == 3

                    follow_up_provider = FakeLLMProvider(
                        [ask_output()],
                        provider="fake-follow-up-provider",
                        usage=LLMUsage(input_tokens=20, output_tokens=10),
                    )
                    assert await build_worker(
                        database,
                        agent=FollowUpAgent(
                            follow_up_provider,
                            model="fake-practice-model",
                        ),
                    ).process_one()

                    before_refresh = client.get("/api/practice/sessions/current")
                    assert before_refresh.status_code == 200
                    assert before_refresh.json()["session"]["status"] == (
                        "generatingFollowUp"
                    )
                    assert before_refresh.json()["session"]["version"] == 3

                    follow_up = client.post(
                        f"/api/practice/sessions/{session_id}/"
                        "follow-up-generation/refresh",
                        json={"version": 3},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert follow_up.status_code == 200
                    follow_up_body = follow_up.json()
                    assert follow_up_body["status"] == "answeringFollowUp"
                    assert follow_up_body["version"] == 4
                    assert follow_up_body["mainAnswer"]["id"] == main_answer_id
                    assert follow_up_body["followUpExchanges"] == []
                    assert follow_up_body["currentFollowUp"]["status"] == (
                        "awaitingAnswer"
                    )
                    assert follow_up_body["currentFollowUp"]["answer"] is None
                    assert (
                        follow_up_body["currentFollowUp"]["question"]["answerHints"][
                            "content"
                        ]
                        is None
                    )
                    assert "focus" not in follow_up_body["currentFollowUp"]["question"]

                    replay = client.post(
                        f"/api/practice/sessions/{session_id}/"
                        "follow-up-generation/refresh",
                        json={"version": 3},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert replay.status_code == 200
                    assert replay.json() == follow_up_body

                    current = client.get("/api/practice/sessions/current")
                    assert current.status_code == 200
                    assert current.json()["session"] == follow_up_body

                    different_content = client.post(
                        f"/api/practice/sessions/{session_id}/answers/main",
                        json={**main_payload, "content": "Different answer"},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert different_content.status_code == 409
                    assert different_content.json() == {
                        "error": "practice_session_version_conflict"
                    }

                    other_user = type(owner)(
                        id=uuid4(),
                        username="practice-answer-other",
                        normalized_username="practice-answer-other",
                        password_hash="hash",
                        display_name="Other User",
                    )
                    app.dependency_overrides[require_current_user] = lambda: other_user
                    for method, path, body in (
                        (
                            "get",
                            f"/api/practice/sessions/{session_id}",
                            None,
                        ),
                        (
                            "post",
                            f"/api/practice/sessions/{session_id}/answers/main",
                            main_payload,
                        ),
                        (
                            "post",
                            f"/api/practice/sessions/{session_id}/"
                            "follow-up-generation/refresh",
                            {"version": 3},
                        ),
                    ):
                        response = getattr(client, method)(
                            path,
                            **(
                                {
                                    "json": body,
                                    "headers": {"Origin": TRUSTED_ORIGIN},
                                }
                                if body is not None
                                else {}
                            ),
                        )
                        assert response.status_code == 404
                        assert response.json() == {
                            "error": "practice_session_not_found"
                        }
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_answer_api_exposes_evaluating_completion_and_replay() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, project_id = await seed_context(database)
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner

                with TestClient(app) as client:
                    session_id, answering = await start_answering(
                        client,
                        database,
                        role.id,
                        project_id,
                    )
                    main_payload = {
                        "version": 2,
                        "questionId": answering["question"]["id"],
                        "content": "I owned the rollout and reduced failures.",
                    }
                    submitted = client.post(
                        f"/api/practice/sessions/{session_id}/answers/main",
                        json=main_payload,
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert submitted.status_code == 202

                    complete_provider = FakeLLMProvider(
                        [{"action": "complete"}],
                        provider="fake-follow-up-provider",
                        usage=LLMUsage(input_tokens=20, output_tokens=10),
                    )
                    assert await build_worker(
                        database,
                        agent=FollowUpAgent(
                            complete_provider,
                            model="fake-practice-model",
                        ),
                    ).process_one()

                    refreshed = client.post(
                        f"/api/practice/sessions/{session_id}/"
                        "follow-up-generation/refresh",
                        json={"version": 3},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert refreshed.status_code == 200
                    body = refreshed.json()
                    assert body["status"] == "evaluating"
                    assert body["version"] == 4
                    assert body["followUpExchanges"] == []
                    assert body["followUpCompletion"] == {
                        "status": "completed",
                        "reason": "noFollowUpRequired",
                    }
                    assert body["submittedAt"].endswith("Z")
                    async with database.sessionmaker() as session:
                        persisted_attempt = await session.scalar(
                            select(PracticeAttempt).where(
                                PracticeAttempt.session_id == UUID(session_id)
                            )
                        )
                        assert persisted_attempt is not None
                        decision = await session.scalar(
                            select(PracticeFollowUpDecision).where(
                                PracticeFollowUpDecision.attempt_id
                                == persisted_attempt.id
                            )
                        )
                        assert decision is not None
                        assert datetime.fromisoformat(body["submittedAt"]) == (
                            persisted_attempt.updated_at
                        )
                        evaluation_runs = list(
                            (
                                await session.scalars(
                                    select(AgentRun).where(
                                        AgentRun.user_id == owner.id,
                                        AgentRun.agent_id == "practice-evaluator",
                                        AgentRun.idempotency_key
                                        == practice_evaluation_idempotency_key(
                                            persisted_attempt.id
                                        ),
                                    )
                                )
                            ).all()
                        )
                        assert len(evaluation_runs) == 1
                        evaluation_run = evaluation_runs[0]
                        assert evaluation_run.status is AgentRunStatus.QUEUED
                        assert evaluation_run.prompt_id == (
                            PRACTICE_EVALUATION_PROMPT.prompt_id
                        )
                        evaluation_payload = EvaluationRunPayload.model_validate(
                            evaluation_run.payload
                        )
                        assert (
                            evaluation_payload.follow_up_completion_reason.value
                            == "noFollowUpRequired"
                        )
                        assert evaluation_payload.terminal_follow_up_decision_id == (
                            decision.id
                        )

                    replay = client.post(
                        f"/api/practice/sessions/{session_id}/"
                        "follow-up-generation/refresh",
                        json={"version": 3},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    assert replay.status_code == 200
                    assert replay.json() == body

                    current = client.get("/api/practice/sessions/current")
                    assert current.status_code == 200
                    assert current.json()["session"] == body

                    evaluation_provider = FakeLLMProvider(
                        [evaluation_output()],
                        provider="fake-evaluation-provider",
                        usage=LLMUsage(input_tokens=20, output_tokens=10),
                    )
                    assert await build_worker(
                        database,
                        agent=PracticeEvaluationAgent(
                            evaluation_provider,
                            model="fake-practice-model",
                        ),
                    ).process_one()

                    async with database.sessionmaker() as session:
                        stored_evaluation = await session.scalar(
                            select(PracticeEvaluation).where(
                                PracticeEvaluation.attempt_id == persisted_attempt.id
                            )
                        )
                        stored_run = await session.get(
                            AgentRun,
                            evaluation_run.id,
                        )
                        assert stored_evaluation is not None
                        assert stored_run is not None
                        assert stored_run.status is AgentRunStatus.SUCCEEDED

                    after_worker = client.get("/api/practice/sessions/current")
                    assert after_worker.status_code == 200
                    assert after_worker.json()["session"]["status"] == ("evaluating")
                    assert after_worker.json()["session"]["version"] == 4
            finally:
                await database.reset()

    asyncio.run(run_test())
