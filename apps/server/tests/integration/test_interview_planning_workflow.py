import asyncio
from datetime import timedelta
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from riva.agents.runtime.runs import AgentRunService
from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db import migrations
from riva.db.database import Database
from riva.integrations import LLMProviderConfigurationError, LLMUsage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    InterviewPlan,
    InterviewQuestion,
    InterviewSession,
)
from riva.schemas.interview_planning import InterviewPlanningOutput
from riva.workers import build_agent_handler_registry, build_agent_worker
from tests.helpers.integration_database import get_integration_database_url
from tests.helpers.interview import seed_interview_prerequisites
from tests.helpers.llm import FakeLLMProvider

pytestmark = pytest.mark.integration

TRUSTED_ORIGIN = "http://localhost:5173"
MODEL = "fake-interview-planner-model"


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


def _settings(database_url: str) -> Settings:
    return Settings(
        database_url=database_url,
        llm_model=MODEL,
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="interview-planning-workflow-test-key",
        session_cookie_secure=False,
    )


def _app(database_url: str, user) -> FastAPI:
    app = create_app(_settings(database_url))
    app.dependency_overrides[require_current_user] = lambda: user
    return app


def _headers(*, language: str = "en-US") -> dict[str, str]:
    return {
        "Origin": TRUSTED_ORIGIN,
        "Accept-Language": language,
    }


def _start_and_begin(
    client: TestClient,
    role_id: UUID,
    *,
    duration_minutes: int = 30,
) -> tuple[UUID, dict[str, object], dict[str, object]]:
    configuration = {
        "targetRoleId": str(role_id),
        "round": "technical",
        "difficulty": "pressure",
        "durationMinutes": duration_minutes,
    }
    started = client.post(
        "/api/interview/sessions",
        json=configuration,
        headers=_headers(),
    )
    assert started.status_code == 201
    opening = started.json()["session"]
    assert opening["status"] == "opening"
    assert opening["version"] == 1

    session_id = UUID(opening["sessionId"])
    beginning = client.post(
        f"/api/interview/sessions/{session_id}/questions/begin",
        json={"version": opening["version"]},
        headers=_headers(),
    )
    assert beginning.status_code == 202
    generating = beginning.json()["session"]
    assert generating["status"] == "generatingQuestion"
    assert generating["generationStatus"] == "generating"
    assert generating["version"] == 2
    return session_id, opening, generating


def _planner_output(count: int = 3) -> dict[str, object]:
    question_types = [
        "selfIntroduction",
        "projectDeepDive",
        "roleCapability",
        "behavioral",
        "technicalOrBusiness",
        "resumeRisk",
        "motivation",
    ]
    return {
        "totalMainQuestions": count,
        "questions": [
            {
                "order": order,
                "questionType": question_types[order - 1],
                "prompt": f"Describe the evidence for interview capability {order}.",
                "assessedCapabilities": [f"Capability {order}"],
                "objective": f"Verify evidence for capability {order}.",
                "followUpDirections": [f"Probe evidence for capability {order}."],
                "scoringFocus": [f"Specific evidence for capability {order}."],
            }
            for order in range(1, count + 1)
        ],
    }


def _worker(
    database: Database,
    settings: Settings,
    provider: FakeLLMProvider,
):
    registry = build_agent_handler_registry(
        settings,
        database.sessionmaker,
        provider_factory=lambda _settings: provider,
    )
    assert registry.get("interview-planner").agent_id == "interview-planner"
    return build_agent_worker(
        settings,
        database,
        registry,
        "interview-planning-workflow-worker",
        logger=SilentLogger(),
    )


async def _clear_database(database_url: str) -> None:
    async with Database(database_url) as database:
        await database.drop_tables()
        async with database.engine.begin() as connection:
            await connection.execute(text("DROP TABLE IF EXISTS alembic_version"))


@pytest.fixture
def migrated_database_url():
    database_url = get_integration_database_url()
    asyncio.run(_clear_database(database_url))
    migrations.upgrade(database_url)
    try:
        yield database_url
    finally:
        migrations.downgrade(database_url, "base")
        asyncio.run(_clear_database(database_url))


def test_interview_planning_success_workflow(migrated_database_url: str) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, profile = await seed_interview_prerequisites(
                database,
                label="planning-success",
                summary="ORIGINAL_PROFILE_SNAPSHOT",
            )
            settings = _settings(migrated_database_url)
            app = _app(migrated_database_url, owner)

            with TestClient(app) as client:
                session_id, _opening, generating = _start_and_begin(
                    client,
                    role.id,
                )

                async with database.sessionmaker() as session:
                    planner_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "interview-planner",
                                )
                            )
                        ).all()
                    )
                    assert len(planner_runs) == 1
                    queued_run = planner_runs[0]
                    assert queued_run.status is AgentRunStatus.QUEUED
                    payload = queued_run.payload
                    planning_input = payload["interviewPlanningInput"]
                    assert payload["sessionId"] == str(session_id)
                    assert payload["sessionVersion"] == 1
                    assert payload["profileId"] == str(profile.profile_id)
                    assert payload["profileVersion"] == profile.version
                    assert payload["targetRoleId"] == str(role.id)
                    assert payload["targetRoleVersion"] == role.version
                    assert payload["jobDescriptionVersion"] == 1
                    assert payload["jobDescriptionAnalysisVersion"] == 1
                    assert payload["interactionLanguage"] == "en"
                    assert planning_input["session"]["id"] == str(session_id)
                    assert planning_input["session"]["version"] == 1
                    assert planning_input["session"]["status"] == "opening"
                    assert planning_input["careerProfile"]["profileId"] == str(
                        profile.profile_id
                    )
                    assert planning_input["careerProfile"]["version"] == profile.version
                    assert planning_input["careerProfile"]["summary"] == (
                        "ORIGINAL_PROFILE_SNAPSHOT"
                    )
                    assert planning_input["targetRole"]["id"] == str(role.id)
                    assert planning_input["targetRole"]["version"] == role.version
                    assert planning_input["targetRole"]["jobDescriptionVersion"] == 1
                    assert (
                        planning_input["jobDescriptionAnalysis"][
                            "jobDescriptionVersion"
                        ]
                        == 1
                    )
                    assert (
                        planning_input["jobDescriptionAnalysis"]["analysisVersion"] == 1
                    )

                provider = FakeLLMProvider(
                    [_planner_output()],
                    provider="fake-interview-planner-provider",
                    usage=LLMUsage(input_tokens=30, output_tokens=24),
                )
                worker = _worker(database, settings, provider)
                assert await worker.process_one() is True
                assert len(provider.calls) == 1

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, queued_run.id)
                    plans = list(
                        (
                            await session.scalars(
                                select(InterviewPlan).where(
                                    InterviewPlan.session_id == session_id
                                )
                            )
                        ).all()
                    )
                    questions = list(
                        (
                            await session.scalars(
                                select(InterviewQuestion)
                                .where(InterviewQuestion.session_id == session_id)
                                .order_by(InterviewQuestion.order)
                            )
                        ).all()
                    )
                    stored_session = await session.get(InterviewSession, session_id)

                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert stored_run.input_tokens == 30
                    assert stored_run.output_tokens == 24
                    assert len(plans) == 1
                    plan = plans[0]
                    assert plan.revision == 1
                    assert plan.source_agent_run_id == stored_run.id
                    assert plan.total_main_questions == 3
                    expected_plan = InterviewPlanningOutput.model_validate(
                        _planner_output()
                    )
                    assert (
                        plan.questions
                        == expected_plan.model_dump(
                            mode="json",
                            by_alias=True,
                        )["questions"]
                    )
                    assert len(questions) == 1
                    first_question = questions[0]
                    assert first_question.source_plan_id == plan.id
                    assert first_question.plan_revision == 1
                    assert first_question.order == 1
                    assert first_question.prompt == expected_plan.questions[0].prompt
                    assert first_question.question_type == "selfIntroduction"
                    assert first_question.assessed_capabilities == ["Capability 1"]
                    assert stored_session is not None
                    assert stored_session.status == "question"
                    assert stored_session.version == 3
                    assert stored_session.plan_revision == 1
                    assert stored_session.total_main_questions == 3

                page = client.get("/api/interview")
                assert page.status_code == 200
                question_session = page.json()["session"]
                assert question_session["status"] == "question"
                assert question_session["version"] == 3
                assert question_session["progress"] == {
                    "completedMainQuestions": 0,
                    "totalMainQuestions": 3,
                    "planRevision": 1,
                }
                assert question_session["currentQuestion"] == {
                    "status": "awaitingAnswer",
                    "question": {
                        "id": str(first_question.id),
                        "prompt": first_question.prompt,
                        "type": first_question.question_type,
                        "assessedCapabilities": first_question.assessed_capabilities,
                        "order": 1,
                    },
                    "answer": None,
                }
                assert question_session["completedQuestions"] == []

    asyncio.run(run_workflow())


def test_interview_planning_begin_is_idempotent_for_queued_and_running(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await seed_interview_prerequisites(
                database,
                label="planning-idempotent",
            )
            app = _app(migrated_database_url, owner)
            with TestClient(app) as client:
                session_id, _opening, generating = _start_and_begin(client, role.id)
                current_version = generating["version"]

                queued_repeat = client.post(
                    f"/api/interview/sessions/{session_id}/questions/begin",
                    json={"version": current_version},
                    headers=_headers(),
                )
                assert queued_repeat.status_code == 202
                assert queued_repeat.json()["session"]["version"] == current_version

                async with database.sessionmaker() as session:
                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="interview-planning-idempotency-worker",
                        lease_duration=timedelta(minutes=10),
                    )
                    assert claimed is not None
                    assert claimed.status is AgentRunStatus.RUNNING

                running_repeat = client.post(
                    f"/api/interview/sessions/{session_id}/questions/begin",
                    json={"version": current_version},
                    headers=_headers(),
                )
                assert running_repeat.status_code == 202
                assert running_repeat.json()["session"]["version"] == current_version

                async with database.sessionmaker() as session:
                    runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "interview-planner",
                                )
                            )
                        ).all()
                    )
                    stored_session = await session.get(InterviewSession, session_id)
                    assert len(runs) == 1
                    assert runs[0].status is AgentRunStatus.RUNNING
                    assert stored_session is not None
                    assert stored_session.status == "generatingQuestion"
                    assert stored_session.version == current_version

    asyncio.run(run_workflow())


def test_interview_planning_begin_rejects_stale_version(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await seed_interview_prerequisites(
                database,
                label="planning-stale",
            )
            app = _app(migrated_database_url, owner)
            with TestClient(app) as client:
                session_id, _opening, generating = _start_and_begin(client, role.id)
                stale = client.post(
                    f"/api/interview/sessions/{session_id}/questions/begin",
                    json={"version": 1},
                    headers=_headers(),
                )
                assert stale.status_code == 409
                assert stale.json() == {"error": "interview_session_version_conflict"}

                async with database.sessionmaker() as session:
                    runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "interview-planner",
                                )
                            )
                        ).all()
                    )
                    stored_session = await session.get(InterviewSession, session_id)
                    assert len(runs) == 1
                    assert stored_session is not None
                    assert stored_session.status == "generatingQuestion"
                    assert stored_session.version == generating["version"]

    asyncio.run(run_workflow())


def test_interview_planning_failed_run_can_retry_without_overwriting_history(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await seed_interview_prerequisites(
                database,
                label="planning-retry",
            )
            settings = _settings(migrated_database_url)
            app = _app(migrated_database_url, owner)
            with TestClient(app) as client:
                session_id, _opening, generating = _start_and_begin(client, role.id)
                first_run_id: UUID
                async with database.sessionmaker() as session:
                    first_run = await session.scalar(
                        select(AgentRun).where(
                            AgentRun.user_id == owner.id,
                            AgentRun.agent_id == "interview-planner",
                        )
                    )
                    assert first_run is not None
                    first_run_id = first_run.id

                failure_provider = FakeLLMProvider(
                    [LLMProviderConfigurationError()],
                    provider="fake-interview-planner-failure-provider",
                )
                assert await _worker(database, settings, failure_provider).process_one()

                failed_page = client.get("/api/interview")
                assert failed_page.status_code == 200
                failed_session = failed_page.json()["session"]
                assert failed_session["status"] == "generatingQuestion"
                assert failed_session["generationStatus"] == "failed"
                assert failed_session["version"] == generating["version"]

                retry = client.post(
                    f"/api/interview/sessions/{session_id}/questions/begin",
                    json={"version": generating["version"]},
                    headers=_headers(),
                )
                assert retry.status_code == 202
                assert retry.json()["session"]["generationStatus"] == "generating"
                assert retry.json()["session"]["version"] == 3

                async with database.sessionmaker() as session:
                    runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "interview-planner",
                                )
                            )
                        ).all()
                    )
                    assert len(runs) == 2
                    old_run = next(run for run in runs if run.id == first_run_id)
                    new_run = next(run for run in runs if run.id != first_run_id)
                    assert old_run.status is AgentRunStatus.FAILED
                    assert new_run.id != old_run.id
                    assert new_run.status is AgentRunStatus.QUEUED
                    assert new_run.idempotency_key != old_run.idempotency_key
                    assert old_run.payload["sessionVersion"] == 1
                    assert new_run.payload["sessionVersion"] == 2
                    stored_session = await session.get(InterviewSession, session_id)
                    assert stored_session is not None
                    assert stored_session.planning_run_id == new_run.id
                    assert stored_session.status == "generatingQuestion"

    asyncio.run(run_workflow())


def test_interview_planning_persist_failure_is_atomic(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await seed_interview_prerequisites(
                database,
                label="planning-atomic",
            )
            settings = _settings(migrated_database_url)
            app = _app(migrated_database_url, owner)
            with TestClient(app) as client:
                session_id, _opening, generating = _start_and_begin(
                    client,
                    role.id,
                    duration_minutes=15,
                )
                invalid_for_duration = FakeLLMProvider(
                    [_planner_output(count=4)],
                    provider="fake-interview-planner-atomic-provider",
                )
                assert await _worker(
                    database,
                    settings,
                    invalid_for_duration,
                ).process_one()

                async with database.sessionmaker() as session:
                    plans = list(
                        (
                            await session.scalars(
                                select(InterviewPlan).where(
                                    InterviewPlan.session_id == session_id
                                )
                            )
                        ).all()
                    )
                    questions = list(
                        (
                            await session.scalars(
                                select(InterviewQuestion).where(
                                    InterviewQuestion.session_id == session_id
                                )
                            )
                        ).all()
                    )
                    stored_run = await session.scalar(
                        select(AgentRun).where(
                            AgentRun.user_id == owner.id,
                            AgentRun.agent_id == "interview-planner",
                        )
                    )
                    stored_session = await session.get(InterviewSession, session_id)
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.FAILED
                    assert not plans
                    assert not questions
                    assert stored_session is not None
                    assert stored_session.status == "generatingQuestion"
                    assert stored_session.version == generating["version"]
                    assert stored_session.plan_revision == 0
                    assert stored_session.total_main_questions is None

                failed_page = client.get("/api/interview")
                assert failed_page.status_code == 200
                failed_session = failed_page.json()["session"]
                assert failed_session["status"] == "generatingQuestion"
                assert failed_session["generationStatus"] == "failed"

    asyncio.run(run_workflow())
