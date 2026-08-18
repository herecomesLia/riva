import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db import migrations
from riva.db.database import Database
from riva.integrations import LLMUsage, MessageRole, StructuredGenerationRequest
from riva.models import (
    AgentRun,
    AgentRunStatus,
    InterviewReview,
    InterviewSession,
    MatchingAnalysis,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeSession,
    TargetRole,
    UserCompetency,
)
from riva.workers import build_agent_handler_registry, build_agent_worker
from tests.helpers.integration_database import get_integration_database_url
from tests.helpers.interview import (
    START,
    create_user,
    seed_interview_prerequisites,
)
from tests.helpers.llm import FakeLLMProvider


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"
MODEL = "fake-training-planner-model"
NOW = datetime(2026, 8, 18, 10, 0, tzinfo=UTC)


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


def database_url() -> str:
    return get_integration_database_url()


def settings(database_url: str, *, provider: str | None = "qwen") -> Settings:
    return Settings(
        database_url=database_url,
        llm_provider=provider,
        llm_model=MODEL,
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="training-planning-workflow-test-key",
        session_cookie_secure=False,
    )


def app_for(
    database_url: str,
    owner,
    *,
    provider: str | None = "qwen",
) -> FastAPI:
    app = create_app(settings(database_url, provider=provider))
    app.dependency_overrides[require_current_user] = lambda: owner
    return app


def headers() -> dict[str, str]:
    return {
        "Origin": TRUSTED_ORIGIN,
        "Accept-Language": "en-US",
    }


def planning_output() -> dict[str, object]:
    return {
        "action": "targetedPractice",
        "reason": "Practice the frozen results evidence gap.",
        "focusAreas": ["results and evidence"],
        "questionType": "projectDeepDive",
        "difficulty": "basic",
        "prioritizeWeaknesses": False,
    }


def succeeded_seed_run(
    *,
    user_id: UUID,
    agent_id: str,
    prompt_id: str,
    output_schema_id: str,
    key: str,
) -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id=agent_id,
        prompt_id=prompt_id,
        prompt_version="1",
        output_schema_id=output_schema_id,
        status=AgentRunStatus.SUCCEEDED,
        payload={"seed": key},
        idempotency_key=key,
        attempt_count=1,
        max_attempts=3,
        available_at=NOW,
        started_at=NOW,
        finished_at=NOW,
        provider="seed-provider",
        model="seed-model",
        input_tokens=1,
        output_tokens=1,
        result={"seed": True},
        created_at=NOW,
    )


async def seed_current_context(
    database: Database,
    *,
    owner_id: UUID,
    role_id: UUID,
    profile_id: UUID,
) -> None:
    matching_run = succeeded_seed_run(
        user_id=owner_id,
        agent_id="matching-analyzer",
        prompt_id="matching-analyzer",
        output_schema_id="matching-analysis-v1",
        key=f"matching-seed-{role_id}",
    )
    evaluator_run = succeeded_seed_run(
        user_id=owner_id,
        agent_id="practice-evaluator",
        prompt_id="practice-evaluator",
        output_schema_id="practice-evaluation-v1",
        key=f"evaluation-seed-{role_id}",
    )
    matching = MatchingAnalysis(
        role_id=role_id,
        user_id=owner_id,
        profile_id=profile_id,
        profile_version=1,
        job_description_version=1,
        job_description_analysis_version=1,
        source_agent_run_id=matching_run.id,
        generated_at=NOW,
        overall_match_score=72,
        core_requirements_summary="Deliver reliable backend APIs.",
        matched_capabilities=["Python API delivery"],
        missing_capabilities=["Results and evidence"],
        underrepresented_capabilities=["Risk control"],
        resume_highlights=["Shipped backend changes"],
        resume_gaps=["Outcome detail is thin"],
        high_risk_questions=["What measurable result did you deliver?"],
        preparation_recommendations=["Explain result evidence from the project."],
    )
    competency = UserCompetency(
        id=uuid4(),
        user_id=owner_id,
        competency_key="results_and_evidence",
        display_name="Results and Evidence",
        level=42,
        confidence=80,
        evidence_count=2,
        trend="declining",
        last_evidence_at=NOW,
    )
    practice_session = PracticeSession(
        id=uuid4(),
        user_id=owner_id,
        target_role_id=role_id,
        language="en",
        version=1,
        status="completed",
        initial_question_type="projectDeepDive",
        initial_difficulty="basic",
        source="history",
        started_at=START,
        completed_at=START + timedelta(minutes=20),
        completion_reason="reviewCompleted",
        created_at=START,
    )
    practice_attempt = PracticeAttempt(
        id=uuid4(),
        user_id=owner_id,
        session_id=practice_session.id,
        attempt_number=1,
        question_type="projectDeepDive",
        difficulty="basic",
        status="completed",
        completed_at=START + timedelta(minutes=18),
        created_at=START,
    )
    practice_evaluation = PracticeEvaluation(
        id=uuid4(),
        attempt_id=practice_attempt.id,
        source_agent_run_id=evaluator_run.id,
        overall_score=61,
        dimension_scores=[],
        focus_assessments=[],
        evaluated_at=START + timedelta(minutes=19),
    )
    interview_session = InterviewSession(
        id=uuid4(),
        user_id=owner_id,
        target_role_id=role_id,
        language="en",
        version=1,
        status="completed",
        round="technical",
        difficulty="pressure",
        duration_minutes=30,
        started_at=START - timedelta(days=1),
        completed_at=START - timedelta(days=1) + timedelta(minutes=30),
        completion_reason="formalQuestionsCompleted",
        plan_revision=1,
        total_main_questions=1,
        created_at=START - timedelta(days=1),
    )
    interview_review = InterviewReview(
        id=uuid4(),
        session_id=interview_session.id,
        source_agent_run_id=None,
        status="complete",
        review={
            "overallPerformance": (
                "The response was useful but needed clearer evidence."
            ),
            "questionReviews": [],
            "mainStrengths": ["Clear technical direction"],
            "frequentIssues": ["Results were not specific"],
            "exposedWeaknesses": ["risk control"],
            "riskPoints": ["Pressure response"],
            "communicationSuggestions": ["State the decision and result."],
            "preparationSuggestions": ["Practice a concise project example."],
            "generatedAt": NOW.isoformat(),
            "overallScore": 64,
            "dimensionScores": [
                {
                    "dimension": "riskControl",
                    "score": 55,
                    "explanation": "The risk trade-off needed more evidence.",
                }
            ],
            "nextTraining": {
                "action": "mockInterview",
                "reason": "Combine evidence and risk control.",
                "focusAreas": ["risk control"],
                "round": "technical",
                "difficulty": "pressure",
            },
        },
        question_details=[],
        created_at=NOW,
    )

    async with database.sessionmaker() as session:
        role = await session.get(TargetRole, role_id)
        assert role is not None
        role.matching_analysis_run_id = matching_run.id
        session.add_all(
            [
                matching_run,
                evaluator_run,
                matching,
                competency,
                practice_session,
                practice_attempt,
                practice_evaluation,
                interview_session,
                interview_review,
            ]
        )
        await session.commit()


def build_worker(
    database: Database,
    current_settings: Settings,
    provider: FakeLLMProvider,
):
    registry = build_agent_handler_registry(
        current_settings,
        database.sessionmaker,
        provider_factory=lambda _settings: provider,
    )
    assert registry.get("training-planner").agent_id == "training-planner"
    return build_agent_worker(
        current_settings,
        database,
        registry,
        "training-planning-workflow-worker",
        logger=SilentLogger(),
    )


async def clear_database(database_url: str) -> None:
    async with Database(database_url) as database:
        await database.drop_tables()
        async with database.engine.begin() as connection:
            await connection.execute(text("DROP TABLE IF EXISTS alembic_version"))


@pytest.fixture
def migrated_database_url():
    current_database_url = database_url()
    asyncio.run(clear_database(current_database_url))
    migrations.upgrade(current_database_url)
    try:
        yield current_database_url
    finally:
        migrations.downgrade(current_database_url, "base")
        asyncio.run(clear_database(current_database_url))


def test_training_planning_snapshots_replays_and_enforces_state_conflicts(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, profile = await seed_interview_prerequisites(
                database,
                label="training-planning-workflow",
            )
            await seed_current_context(
                database,
                owner_id=owner.id,
                role_id=role.id,
                profile_id=profile.profile_id,
            )
            current_settings = settings(migrated_database_url)
            app = app_for(migrated_database_url, owner)
            request_id = uuid4()
            payload = {
                "requestId": str(request_id),
                "targetRoleId": str(role.id),
            }
            initial_fingerprint: str | None = None
            new_record_id = uuid4()

            with TestClient(app) as client:
                started = client.post(
                    "/api/training-plans",
                    json=payload,
                    headers=headers(),
                )
                assert started.status_code == 202
                run_id = UUID(started.json()["runId"])
                assert started.json()["status"] == "queued"

                async with database.sessionmaker() as session:
                    queued_run = await session.get(AgentRun, run_id)
                    assert queued_run is not None
                    assert queued_run.prompt_id == "training-planner"
                    assert queued_run.prompt_version == "1"
                    assert queued_run.max_attempts == 3
                    frozen_input = queued_run.payload["trainingPlanningInput"]
                    assert frozen_input["matchingAnalysis"]["missingCapabilities"] == [
                        "Results and evidence"
                    ]
                    assert frozen_input["trainingMemory"]["focusCompetencies"][0][
                        "level"
                    ] == 42
                    assert len(frozen_input["recentTraining"]) == 2
                    assert [
                        item["kind"] for item in frozen_input["recentTraining"]
                    ] == ["targetedPractice", "mockInterview"]
                    initial_fingerprint = queued_run.payload[
                        "contextFingerprint"
                    ]

                    matching = await session.get(MatchingAnalysis, role.id)
                    competency = await session.scalar(
                        select(UserCompetency).where(
                            UserCompetency.user_id == owner.id,
                            UserCompetency.competency_key
                            == "results_and_evidence",
                        )
                    )
                    assert matching is not None
                    assert competency is not None
                    matching.missing_capabilities = ["MUTATED_MATCHING_CONTEXT"]
                    competency.level = 91
                    new_training_session = PracticeSession(
                        id=new_record_id,
                        user_id=owner.id,
                        target_role_id=role.id,
                        language="en",
                        version=1,
                        status="completed",
                        initial_question_type="behavioral",
                        initial_difficulty="pressure",
                        source="history",
                        started_at=NOW - timedelta(minutes=25),
                        completed_at=NOW - timedelta(minutes=5),
                        completion_reason="reviewCompleted",
                        created_at=NOW - timedelta(minutes=25),
                    )
                    new_training_attempt = PracticeAttempt(
                        id=uuid4(),
                        user_id=owner.id,
                        session_id=new_record_id,
                        attempt_number=1,
                        question_type="behavioral",
                        difficulty="pressure",
                        status="completed",
                        completed_at=NOW - timedelta(minutes=6),
                        created_at=NOW - timedelta(minutes=25),
                    )
                    session.add_all(
                        [new_training_session, new_training_attempt]
                    )
                    await session.commit()

                provider = FakeLLMProvider(
                    [planning_output()],
                    provider="fake-training-planner-provider",
                    usage=LLMUsage(input_tokens=31, output_tokens=17),
                )
                assert await build_worker(
                    database,
                    current_settings,
                    provider,
                ).process_one()
                assert isinstance(provider.calls[0], StructuredGenerationRequest)
                user_message = next(
                    message.content
                    for message in provider.calls[0].messages
                    if message.role is MessageRole.USER
                )
                assert "Results and evidence" in user_message
                assert "MUTATED_MATCHING_CONTEXT" not in user_message
                assert '"level":42' in user_message
                assert '"level":91' not in user_message

                succeeded = client.get(f"/api/training-plans/{run_id}")
                assert succeeded.status_code == 200
                assert succeeded.json()["status"] == "succeeded"
                assert succeeded.json()["plan"]["action"] == "targetedPractice"

                replay = client.post(
                    "/api/training-plans",
                    json=payload,
                    headers=headers(),
                )
                assert replay.status_code == 202
                assert replay.json()["runId"] == str(run_id)

                second_request = {
                    "requestId": str(uuid4()),
                    "targetRoleId": str(role.id),
                }
                second = client.post(
                    "/api/training-plans",
                    json=second_request,
                    headers=headers(),
                )
                assert second.status_code == 202
                second_run_id = UUID(second.json()["runId"])

                async with database.sessionmaker() as session:
                    second_run = await session.get(AgentRun, second_run_id)
                    assert second_run is not None
                    assert second_run.payload["trainingPlanningInput"][
                        "matchingAnalysis"
                    ]["missingCapabilities"] == ["MUTATED_MATCHING_CONTEXT"]
                    assert second_run.payload["trainingPlanningInput"][
                        "trainingMemory"
                    ]["focusCompetencies"][0]["level"] == 91
                    assert (
                        second_run.payload["contextFingerprint"]
                        != initial_fingerprint
                    )
                    recent = second_run.payload["trainingPlanningInput"][
                        "recentTraining"
                    ]
                    assert len(recent) == 3
                    assert recent[0]["recordId"] == str(new_record_id)
                    runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "training-planner",
                                )
                            )
                        ).all()
                    )
                    assert len(runs) == 2

                    stored_first = await session.get(AgentRun, run_id)
                    assert stored_first is not None
                    stored_first.result = {"action": "mockInterview"}
                    await session.commit()

                corrupt = client.get(f"/api/training-plans/{run_id}")
                assert corrupt.status_code == 409
                assert corrupt.json() == {"error": "training_planning_state_conflict"}

                missing_run = client.get(f"/api/training-plans/{uuid4()}")
                assert missing_run.status_code == 404
                assert missing_run.json() == {
                    "error": "training_planning_not_found"
                }

                other_owner = create_user("training-planning-other")
                other_run = AgentRun(
                    id=uuid4(),
                    user_id=other_owner.id,
                    agent_id="training-planner",
                    prompt_id="training-planner",
                    prompt_version="1",
                    output_schema_id="training-planning-v1",
                    status=AgentRunStatus.QUEUED,
                    payload={"seed": "other-user"},
                    idempotency_key=f"training-planning-other-{uuid4()}",
                    attempt_count=0,
                    max_attempts=3,
                    available_at=NOW,
                    model=MODEL,
                    created_at=NOW,
                )
                async with database.sessionmaker() as session:
                    session.add_all([other_owner, other_run])
                    await session.commit()

                not_owner = client.get(
                    f"/api/training-plans/{other_run.id}"
                )
                assert not_owner.status_code == 404
                assert not_owner.json() == {
                    "error": "training_planning_not_found"
                }

                unconfigured_app = app_for(
                    migrated_database_url,
                    owner,
                    provider=None,
                )
                with TestClient(unconfigured_app) as unconfigured_client:
                    unavailable_provider = unconfigured_client.post(
                        "/api/training-plans",
                        json={
                            "requestId": str(uuid4()),
                            "targetRoleId": str(role.id),
                        },
                        headers=headers(),
                    )
                assert unavailable_provider.status_code == 503
                assert unavailable_provider.json() == {
                    "error": "training_planning_unavailable"
                }

                target_missing = client.post(
                    "/api/training-plans",
                    json={
                        "requestId": str(uuid4()),
                        "targetRoleId": str(uuid4()),
                    },
                    headers=headers(),
                )
                assert target_missing.status_code == 404
                assert target_missing.json() == {
                    "error": "training_planning_target_not_found"
                }

                async with database.sessionmaker() as session:
                    stored_role = await session.get(TargetRole, role.id)
                    assert stored_role is not None
                    stored_role.preparation_status = "archived"
                    await session.commit()

                unavailable = client.post(
                    "/api/training-plans",
                    json={
                        "requestId": str(uuid4()),
                        "targetRoleId": str(role.id),
                    },
                    headers=headers(),
                )
                assert unavailable.status_code == 409
                assert unavailable.json() == {
                    "error": "training_planning_target_unavailable"
                }

                replay_conflict = client.post(
                    "/api/training-plans",
                    json={
                        "requestId": str(request_id),
                        "targetRoleId": str(uuid4()),
                    },
                    headers=headers(),
                )
                assert replay_conflict.status_code == 409
                assert replay_conflict.json() == {
                    "error": "training_planning_request_conflict"
                }

    asyncio.run(run_workflow())
