import asyncio
from copy import deepcopy
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.db import migrations
from riva.db.database import Database
from riva.models import (
    AgentRun,
    AgentRunStatus,
    InterviewPlan,
    InterviewSession,
    UserCompetency,
)
from riva.services.agent_runs import AgentRunService
from riva.services.interview_planning import InterviewPlanningService
from tests.helpers.integration_database import get_integration_database_url
from tests.helpers.interview import seed_interview_prerequisites
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_interview_planning_workflow import (
    _app,
    _clear_database,
    _headers,
    _planner_output,
    _settings,
    _start_and_begin,
    _worker,
)

pytestmark = pytest.mark.integration


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


async def _add_memory(database: Database, owner_id, *, level: int = 48) -> None:
    # The aggregate row is enough to prove that the planner snapshots the
    # existing TrainingMemoryContext; no evidence backfill belongs here.
    async with database.sessionmaker() as session:
        competency = await session.scalar(
            select(UserCompetency).where(
                UserCompetency.user_id == owner_id,
                UserCompetency.competency_key == "results_and_evidence",
            )
        )
        if competency is None:
            session.add(
                UserCompetency(
                    user_id=owner_id,
                    competency_key="results_and_evidence",
                    display_name="Results and Evidence",
                    level=level,
                    confidence=80,
                    evidence_count=5,
                    trend="stable",
                )
            )
        else:
            competency.level = level
        await session.commit()


def test_v2_planning_snapshots_memory_and_retries_without_requery(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await seed_interview_prerequisites(
                database,
                label="planning-memory-snapshot",
            )
            await _add_memory(database, owner.id, level=48)
            app = _app(migrated_database_url, owner)

            with TestClient(app) as client:
                session_id, _opening, generating = _start_and_begin(client, role.id)
                async with database.sessionmaker() as session:
                    run = await session.scalar(
                        select(AgentRun).where(
                            AgentRun.user_id == owner.id,
                            AgentRun.agent_id == "interview-planner",
                        )
                    )
                    assert run is not None
                    assert run.prompt_version == "2"
                    original_memory = deepcopy(
                        run.payload["interviewPlanningInput"]["trainingMemory"]
                    )

                    loaded = await InterviewPlanningService(
                        session
                    ).load_planning_input(run)
                    assert loaded.training_memory.focus_competencies[0].level == 48

                # A queued replay returns the original session/run. It must not
                # create a v2 run with a newly-read competency snapshot.
                await _add_memory(database, owner.id, level=92)
                replay = client.post(
                    f"/api/interview/sessions/{session_id}/questions/begin",
                    json={"version": generating["version"]},
                    headers=_headers(),
                )
                assert replay.status_code == 202
                assert replay.json()["session"]["version"] == generating["version"]

                async with database.sessionmaker() as session:
                    run = await session.get(AgentRun, run.id)
                    assert run is not None
                    assert (
                        run.payload["interviewPlanningInput"]["trainingMemory"]
                        == original_memory
                    )

                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="planning-memory-failure-worker",
                        lease_duration=timedelta(minutes=5),
                    )
                    assert claimed is not None
                    assert claimed.id == run.id
                    assert claimed.lease_token is not None
                    await AgentRunService(session).mark_failed(
                        run_id=claimed.id,
                        lease_token=claimed.lease_token,
                        error_code="provider_failed",
                        retryable=False,
                        retry_delay=timedelta(0),
                    )

                    interview_session = await session.get(InterviewSession, session_id)
                    assert interview_session is not None
                    assert interview_session.status == "generatingQuestion"

                retry = client.post(
                    f"/api/interview/sessions/{session_id}/questions/begin",
                    json={"version": generating["version"]},
                    headers=_headers(),
                )
                assert retry.status_code == 202

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
                    retried = next(item for item in runs if item.id != run.id)
                    retried_id = retried.id
                    assert (
                        retried.payload["interviewPlanningInput"]["trainingMemory"]
                        == original_memory
                    )

                provider = FakeLLMProvider(
                    [_planner_output()],
                    provider="fake-planning-memory-provider",
                )
                assert await _worker(
                    database,
                    _settings(migrated_database_url),
                    provider,
                ).process_one()
                request = provider.calls[0]
                assert "BEGIN_UNTRUSTED_TRAINING_MEMORY" in request.messages[1].content

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, retried_id)
                    plan = await session.scalar(
                        select(InterviewPlan).where(
                            InterviewPlan.session_id == session_id
                        )
                    )
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert plan is not None
                    assert plan.source_agent_run_id == stored_run.id

    asyncio.run(run_workflow())


def test_v1_snapshot_executes_and_persists_plan_lineage(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await seed_interview_prerequisites(
                database,
                label="planning-v1-compatibility",
            )
            app = _app(migrated_database_url, owner)

            with TestClient(app) as client:
                session_id, _opening, _generating = _start_and_begin(client, role.id)
                async with database.sessionmaker() as session:
                    run = await session.scalar(
                        select(AgentRun).where(
                            AgentRun.user_id == owner.id,
                            AgentRun.agent_id == "interview-planner",
                        )
                    )
                    assert run is not None
                    run.prompt_version = "1"
                    legacy_payload = deepcopy(run.payload)
                    legacy_payload["interviewPlanningInput"].pop("trainingMemory", None)
                    run.payload = legacy_payload
                    await session.commit()

                provider = FakeLLMProvider(
                    [_planner_output()],
                    provider="fake-v1-planning-provider",
                )
                assert await _worker(
                    database,
                    _settings(migrated_database_url),
                    provider,
                ).process_one()
                request = provider.calls[0]
                assert "TRAINING_MEMORY" not in request.messages[0].content
                assert "TRAINING_MEMORY" not in request.messages[1].content

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, run.id)
                    plan = await session.scalar(
                        select(InterviewPlan).where(
                            InterviewPlan.session_id == session_id
                        )
                    )
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert plan is not None
                    assert plan.source_agent_run_id == stored_run.id

    asyncio.run(run_workflow())
