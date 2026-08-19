import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.core.auth import require_current_user
from riva.core.app import create_app
from riva.core.config import Settings
from riva.db import migrations
from riva.db.database import Database
from riva.models import AgentRun, AgentRunStatus, CareerProfile, TargetRole
from tests.helpers.integration_database import get_integration_database_url
from tests.helpers.interview import seed_interview_prerequisites
from tests.integration.test_training_planning_workflow import clear_database


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


def database_url() -> str:
    return get_integration_database_url()


def app_for(database_url: str, owner, *, provider: str | None = "qwen") -> FastAPI:
    app = create_app(
        Settings(
            database_url=database_url,
            llm_provider=provider,
            llm_model="training-planner-current-test-model",
            cors_allowed_origins=[TRUSTED_ORIGIN],
            session_digest_key="training-planner-current-workflow-test-key",
            session_cookie_secure=False,
        )
    )
    app.dependency_overrides[require_current_user] = lambda: owner
    return app


def headers(language: str = "en-US") -> dict[str, str]:
    return {"Origin": TRUSTED_ORIGIN, "Accept-Language": language}


def set_run_status(run: AgentRun, status: AgentRunStatus) -> None:
    now = run.created_at or datetime(2026, 8, 18, 10, 0, tzinfo=UTC)
    run.status = status
    run.attempt_count = 1
    run.started_at = now
    run.finished_at = now if status in {
        AgentRunStatus.SUCCEEDED,
        AgentRunStatus.FAILED,
    } else None
    run.lease_owner = None
    run.lease_token = None
    run.lease_expires_at = None
    run.provider = None
    run.input_tokens = None
    run.output_tokens = None
    run.error_code = None
    run.result = None
    if status is AgentRunStatus.RUNNING:
        run.lease_owner = "current-planning-test"
        run.lease_token = UUID("44444444-4444-4444-8444-444444444444")
        run.lease_expires_at = now + timedelta(minutes=5)
    elif status is AgentRunStatus.SUCCEEDED:
        run.provider = "seed-provider"
        run.input_tokens = 1
        run.output_tokens = 1
        run.result = {
            "action": "targetedPractice",
            "reason": "Practice the current evidence gap.",
            "focusAreas": ["results and evidence"],
            "questionType": "projectDeepDive",
            "difficulty": "basic",
            "prioritizeWeaknesses": False,
        }
    elif status is AgentRunStatus.FAILED:
        run.error_code = "provider_unavailable"


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


def test_current_planning_replays_and_refreshes_by_context(
    migrated_database_url: str,
) -> None:
    async def run_workflow() -> None:
        async with Database(migrated_database_url) as database:
            owner, role, profile = await seed_interview_prerequisites(
                database,
                label="training-planning-current-workflow",
            )
            from tests.integration.test_training_planning_workflow import (
                seed_current_context,
            )

            await seed_current_context(
                database,
                owner_id=owner.id,
                role_id=role.id,
                profile_id=profile.profile_id,
            )

        with TestClient(app_for(migrated_database_url, owner)) as client:
            first = client.post(
                "/api/training-plans/current",
                json={"targetRoleId": str(role.id)},
                headers=headers(),
            )
            assert first.status_code == 202
            first_run_id = first.json()["runId"]

            replay = client.post(
                "/api/training-plans/current",
                json={"targetRoleId": str(role.id)},
                headers=headers(),
            )
            assert replay.status_code == 202
            assert replay.json()["runId"] == first_run_id

        async with Database(migrated_database_url) as database:
            async with database.sessionmaker() as session:
                stored_run = await session.get(AgentRun, UUID(first_run_id))
                assert stored_run is not None
                assert stored_run.payload["trainingPlanningInput"][
                    "constraints"
                ]["targetedPractice"] is not None
                assert stored_run.payload["trainingPlanningInput"][
                    "constraints"
                ]["mockInterview"] is not None

                for status in (
                    AgentRunStatus.RUNNING,
                    AgentRunStatus.SUCCEEDED,
                    AgentRunStatus.FAILED,
                ):
                    set_run_status(stored_run, status)
                    await session.commit()
                    with TestClient(app_for(migrated_database_url, owner)) as client:
                        existing_status = client.post(
                            "/api/training-plans/current",
                            json={"targetRoleId": str(role.id)},
                            headers=headers(),
                        )
                    assert existing_status.status_code == 202
                    assert existing_status.json()["runId"] == first_run_id
                    assert existing_status.json()["status"] == status.value

                with TestClient(app_for(migrated_database_url, owner, provider=None)) as client:
                    unconfigured_replay = client.post(
                        "/api/training-plans/current",
                        json={"targetRoleId": str(role.id)},
                        headers=headers(),
                    )
                    assert unconfigured_replay.status_code == 202
                    assert unconfigured_replay.json()["runId"] == first_run_id

                stored_profile = await session.get(CareerProfile, profile.profile_id)
                assert stored_profile is not None
                stored_profile.version += 1
                await session.commit()

        with TestClient(app_for(migrated_database_url, owner)) as client:
            language_changed = client.post(
                "/api/training-plans/current",
                json={"targetRoleId": str(role.id)},
                headers=headers("zh-CN"),
            )
            assert language_changed.status_code == 202
            language_changed_run_id = language_changed.json()["runId"]
            assert language_changed_run_id != first_run_id

        with TestClient(app_for(migrated_database_url, owner)) as client:
            stale_context = client.post(
                "/api/training-plans/current",
                json={"targetRoleId": str(role.id)},
                headers=headers(),
            )
            assert stale_context.status_code == 202
            assert stale_context.json()["runId"] != first_run_id

        async with Database(migrated_database_url) as database:
            async with database.sessionmaker() as session:
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
                latest = max(runs, key=lambda run: run.created_at)
                latest_input = latest.payload["trainingPlanningInput"]
                assert latest_input["matchingAnalysis"] is None
                assert latest_input["constraints"]["targetedPractice"] is None
                assert latest_input["constraints"]["mockInterview"] is not None

        with TestClient(app_for(migrated_database_url, owner, provider=None)) as client:
            missing_model = client.post(
                "/api/training-plans/current",
                json={"targetRoleId": str(role.id)},
                headers=headers("zh-CN"),
            )
            assert missing_model.status_code == 202
            assert missing_model.json()["runId"] == language_changed_run_id

    asyncio.run(run_workflow())


def test_current_planning_without_existing_run_requires_provider(
    migrated_database_url: str,
) -> None:
    async def seed() -> tuple[object, object]:
        async with Database(migrated_database_url) as database:
            owner, role, profile = await seed_interview_prerequisites(
                database,
                label="training-planning-current-unconfigured",
            )
            from tests.integration.test_training_planning_workflow import (
                seed_current_context,
            )

            await seed_current_context(
                database,
                owner_id=owner.id,
                role_id=role.id,
                profile_id=profile.profile_id,
            )
            return owner, role

    owner, role = asyncio.run(seed())

    with TestClient(app_for(migrated_database_url, owner, provider=None)) as client:
        response = client.post(
            "/api/training-plans/current",
            json={"targetRoleId": str(role.id)},
            headers=headers(),
        )

    assert response.status_code == 503
    assert response.json() == {"error": "training_planning_unavailable"}

    async def count_runs() -> int:
        async with Database(migrated_database_url) as database:
            async with database.sessionmaker() as session:
                return len(
                    list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "training-planner",
                                )
                            )
                        ).all()
                    )
                )

    assert asyncio.run(count_runs()) == 0


def test_concurrent_current_planning_requests_share_one_run(
    migrated_database_url: str,
) -> None:
    async def seed() -> tuple[object, object, object]:
        async with Database(migrated_database_url) as database:
            owner, role, profile = await seed_interview_prerequisites(
                database,
                label="training-planning-concurrency",
            )
            from tests.integration.test_training_planning_workflow import (
                seed_current_context,
            )

            await seed_current_context(
                database,
                owner_id=owner.id,
                role_id=role.id,
                profile_id=profile.profile_id,
            )
            return owner, role, profile

    owner, role, _profile = asyncio.run(seed())

    def ensure_current(_index: int) -> tuple[int, dict[str, object]]:
        with TestClient(app_for(migrated_database_url, owner)) as client:
            response = client.post(
                "/api/training-plans/current",
                json={"targetRoleId": str(role.id)},
                headers=headers(),
            )
            return response.status_code, response.json()

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(ensure_current, (1, 2)))

    assert [status for status, _body in responses] == [202, 202]
    run_ids = {body["runId"] for _status, body in responses}
    assert len(run_ids) == 1

    async def count_runs() -> int:
        async with Database(migrated_database_url) as database:
            async with database.sessionmaker() as session:
                return len(
                    list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == owner.id,
                                    AgentRun.agent_id == "training-planner",
                                )
                            )
                        ).all()
                    )
                )

    assert asyncio.run(count_runs()) == 1


def test_current_planning_rejects_when_both_training_modes_are_unavailable(
    migrated_database_url: str,
) -> None:
    async def seed_unavailable_role():
        async with Database(migrated_database_url) as database:
            owner, role, _profile = await seed_interview_prerequisites(
                database,
                label="training-planning-unavailable",
            )
            async with database.sessionmaker() as session:
                stored_role = await session.get(TargetRole, role.id)
                assert stored_role is not None
                stored_role.job_description_status = "missing"
                stored_role.raw_job_description = None
                stored_role.job_description_version = None
                await session.commit()
            return owner, role

    owner, role = asyncio.run(seed_unavailable_role())

    with TestClient(app_for(migrated_database_url, owner)) as client:
        response = client.post(
            "/api/training-plans/current",
            json={"targetRoleId": str(role.id)},
            headers=headers(),
        )

    assert response.status_code == 409
    assert response.json() == {"error": "training_planning_target_unavailable"}
