import asyncio
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db import migrations
from riva.db.database import Database
from riva.models import CurrentTargetRole, InterviewSession, TargetRole
from tests.helpers.integration_database import get_integration_database_url
from tests.helpers.interview import (
    create_career_profile,
    create_jd_ready_role,
    create_user,
    seed_interview_prerequisites,
)

pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"


async def _clear_database(database_url: str) -> None:
    async with Database(database_url) as database:
        await database.drop_tables()
        async with database.engine.begin() as connection:
            await connection.execute(text("DROP TABLE IF EXISTS alembic_version"))


async def _seed_missing_jd_user(database: Database):
    user = create_user("missing-jd")
    profile = create_career_profile(user.id)
    role = TargetRole(
        id=uuid4(),
        user_id=user.id,
        title="Missing JD Role",
        company="Riva",
        recruitment_type="experienced",
        location="Shanghai",
        preparation_status="preparing",
        job_description_status="missing",
        raw_job_description=None,
        job_description_version=None,
        version=1,
    )
    async with database.sessionmaker() as session:
        session.add_all([user, profile, role])
        await session.commit()
    return user


async def _seed_other_user(database: Database):
    user = create_user("other")
    async with database.sessionmaker() as session:
        session.add(user)
        await session.commit()
    return user


async def _run_workflow(url: str) -> None:
    async with Database(url) as database:
        owner, role, _profile = await seed_interview_prerequisites(
            database,
            label="owner",
            summary=None,
        )
        archived_role, archived_run, archived_analysis = create_jd_ready_role(
            owner.id,
            title="Archived Role",
            preparation_status="archived",
        )
        (
            incomplete_user,
            incomplete_role,
            _incomplete_profile,
        ) = await seed_interview_prerequisites(
            database,
            label="incomplete",
            include_work_experience=False,
            include_project_experience=False,
            include_skill=False,
            role_title="Incomplete Profile Role",
        )
        missing_jd_user = await _seed_missing_jd_user(database)
        other_user = await _seed_other_user(database)

        async with database.sessionmaker() as session:
            session.add_all(
                [
                    archived_role,
                    archived_run,
                    archived_analysis,
                    CurrentTargetRole(
                        user_id=owner.id,
                        role_id=role.id,
                    ),
                ]
            )
            await session.commit()

        settings = Settings(
            database_url=url,
            cors_allowed_origins=[TRUSTED_ORIGIN],
            session_digest_key="interview-setup-start-test-key",
            session_cookie_secure=False,
        )
        app = create_app(settings)
        app.dependency_overrides[require_current_user] = lambda: owner

        with TestClient(app) as client:
            setup = client.get("/api/interview")
            assert setup.status_code == 200
            setup_body = setup.json()
            assert setup_body["setup"]["availability"] == {"status": "available"}
            assert [item["id"] for item in setup_body["setup"]["targetRoles"]] == [
                str(role.id)
            ]
            assert setup_body["setup"]["defaultConfiguration"]["targetRoleId"] == str(
                role.id
            )

            body = {
                "targetRoleId": str(role.id),
                "round": "technical",
                "difficulty": "pressure",
                "durationMinutes": 30,
            }
            started = client.post(
                "/api/interview/sessions",
                json=body,
                headers={
                    "Origin": TRUSTED_ORIGIN,
                    "Accept-Language": "en-US",
                },
            )
            assert started.status_code == 201
            started_body = started.json()
            assert started_body["session"]["status"] == "opening"
            assert started_body["session"]["version"] == 1
            assert started_body["session"]["language"] == "en"
            session_id = UUID(started_body["session"]["sessionId"])

            async with database.sessionmaker() as session:
                stored = await session.get(InterviewSession, session_id)
                assert stored is not None
                assert stored.user_id == owner.id
                assert stored.target_role_id == role.id
                assert stored.version == 1
                assert stored.status == "opening"

            recovered = client.get("/api/interview")
            assert recovered.status_code == 200
            assert recovered.json()["session"]["sessionId"] == str(session_id)
            assert recovered.json()["session"]["status"] == "opening"

            replay = client.post(
                "/api/interview/sessions",
                json=body,
                headers={
                    "Origin": TRUSTED_ORIGIN,
                    "Accept-Language": "en-US",
                },
            )
            assert replay.status_code == 201
            assert replay.json()["session"]["sessionId"] == str(session_id)

            async with database.sessionmaker() as session:
                assert len((await session.scalars(select(InterviewSession))).all()) == 1

            conflict = client.post(
                "/api/interview/sessions",
                json={**body, "round": "hr"},
                headers={"Origin": TRUSTED_ORIGIN},
            )
            assert conflict.status_code == 409
            assert conflict.json() == {"error": "interview_session_already_active"}

            app.dependency_overrides[require_current_user] = lambda: incomplete_user
            profile_blocked = client.get("/api/interview")
            assert profile_blocked.status_code == 200
            assert profile_blocked.json()["setup"]["availability"] == {
                "status": "blocked",
                "reason": "profileIncomplete",
            }
            assert profile_blocked.json()["setup"]["targetRoles"][0]["id"] == str(
                incomplete_role.id
            )

            app.dependency_overrides[require_current_user] = lambda: missing_jd_user
            jd_blocked = client.get("/api/interview")
            assert jd_blocked.status_code == 200
            assert jd_blocked.json()["setup"]["availability"] == {
                "status": "blocked",
                "reason": "jobDescriptionMissing",
            }
            assert jd_blocked.json()["setup"]["targetRoles"] == []

            app.dependency_overrides[require_current_user] = lambda: other_user
            isolated = client.get("/api/interview")
            assert isolated.status_code == 200
            assert isolated.json()["setup"]["availability"] == {
                "status": "blocked",
                "reason": "noTargetRoles",
            }
            assert isolated.json()["setup"]["targetRoles"] == []

            app.dependency_overrides[require_current_user] = lambda: owner
            owner_again = client.get("/api/interview")
            assert owner_again.status_code == 200
            assert str(archived_role.id) not in {
                item["id"] for item in owner_again.json()["setup"]["targetRoles"]
            }


def test_interview_setup_start_and_replay() -> None:
    url = get_integration_database_url()
    asyncio.run(_clear_database(url))
    migrations.upgrade(url)
    try:
        asyncio.run(_run_workflow(url))
        migrations.check(url)
    finally:
        migrations.downgrade(url, "base")
        asyncio.run(_clear_database(url))
