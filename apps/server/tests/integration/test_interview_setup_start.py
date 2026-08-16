import asyncio
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.auth import require_current_user
from riva.core.app import create_app
from riva.core.config import Settings
from riva.db import migrations
from riva.db.database import Database
from riva.models import (
    AgentRun,
    CareerProfile,
    CareerProfileEducation,
    CareerProfileSkill,
    CurrentTargetRole,
    InterviewSession,
    JobDescriptionAnalysis,
    TargetRole,
    User,
)
from riva.prompts import JOB_DESCRIPTION_PARSING_PROMPT
from tests.helpers.integration_database import get_integration_database_url
from tests.integration.test_question_generation import seed_context, succeeded_run


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"
START = datetime(2026, 8, 16, 10, 0, tzinfo=UTC)


async def _clear_database(database_url: str) -> None:
    async with Database(database_url) as database:
        await database.drop_tables()
        async with database.engine.begin() as connection:
            await connection.execute(text("DROP TABLE IF EXISTS alembic_version"))


def _user(label: str) -> User:
    user_id = uuid4()
    return User(
        id=user_id,
        username=f"{label}-{user_id.hex}",
        normalized_username=f"{label}-{user_id.hex}",
        password_hash="hash",
        display_name=label,
    )


def _complete_profile(user_id: UUID) -> CareerProfile:
    profile_id = uuid4()
    profile = CareerProfile(
        profile_id=profile_id,
        user_id=user_id,
        summary=None,
        version=1,
    )
    skill = CareerProfileSkill(
        id=uuid4(),
        career_profile_id=profile_id,
        position=0,
        name="Python",
        normalized_name="python",
    )
    education = CareerProfileEducation(
        id=uuid4(),
        career_profile_id=profile_id,
        position=0,
        school="Tongji University",
        degree="Master",
        major="Computer Science",
        start_date="2018-09",
        end_date="2021-06",
        is_current=False,
    )
    profile.skills = [skill]
    profile.education = [education]
    return profile


def _ready_role(
    user_id: UUID,
    *,
    title: str,
    preparation_status: str = "preparing",
) -> tuple[TargetRole, AgentRun, JobDescriptionAnalysis]:
    role_id = uuid4()
    parsing_run = succeeded_run(
        user_id=user_id,
        agent_id=JOB_DESCRIPTION_PARSING_PROMPT.prompt_id,
        prompt_id=JOB_DESCRIPTION_PARSING_PROMPT.prompt_id,
        prompt_version=JOB_DESCRIPTION_PARSING_PROMPT.version,
        output_schema_id=JOB_DESCRIPTION_PARSING_PROMPT.output_schema_id,
        payload={
            "roleId": str(role_id),
            "jobDescriptionVersion": 1,
        },
        key=f"interview-jd-{role_id}",
    )
    role = TargetRole(
        id=role_id,
        user_id=user_id,
        title=title,
        company="Riva",
        recruitment_type="experienced",
        location="Shanghai",
        preparation_status=preparation_status,
        job_description_status="saved",
        raw_job_description="Build reliable APIs.",
        job_description_version=1,
        job_description_parsing_run_id=parsing_run.id,
        version=1,
    )
    analysis = JobDescriptionAnalysis(
        role_id=role_id,
        user_id=user_id,
        job_description_version=1,
        analysis_version=1,
        source_agent_run_id=parsing_run.id,
        parsed_at=START,
        riva_summary="Build reliable APIs.",
        responsibilities=["Design backend APIs"],
        qualification_requirements={
            "education": [],
            "graduation_cohorts": [],
            "majors": [],
            "experience": ["Backend experience"],
            "languages": [],
            "certifications": [],
            "other": [],
        },
        required_skills={
            "programming_languages": ["Python"],
            "frameworks_and_libraries": [],
            "platforms": [],
            "tools": [],
            "concepts_and_methods": [],
            "databases_and_middleware": [],
            "other": [],
        },
        preferred_qualifications=[],
        soft_skills=["Communication"],
        business_domains=["Payments"],
    )
    return role, parsing_run, analysis


async def _seed_auxiliary_users(
    session: AsyncSession,
) -> tuple[User, User, User, TargetRole]:
    incomplete_user = _user("incomplete")
    incomplete_profile = CareerProfile(
        profile_id=uuid4(),
        user_id=incomplete_user.id,
        summary=None,
        version=1,
    )
    incomplete_role, incomplete_run, incomplete_analysis = _ready_role(
        incomplete_user.id,
        title="Incomplete Profile Role",
    )

    missing_jd_user = _user("missing-jd")
    missing_jd_profile = _complete_profile(missing_jd_user.id)
    missing_jd_role = TargetRole(
        id=uuid4(),
        user_id=missing_jd_user.id,
        title="Missing JD Role",
        company="Riva",
        preparation_status="preparing",
        job_description_status="missing",
        raw_job_description=None,
        job_description_version=None,
        version=1,
    )
    other_user = _user("other")

    session.add_all(
        [
            incomplete_user,
            incomplete_profile,
            incomplete_role,
            incomplete_run,
            incomplete_analysis,
            missing_jd_user,
            missing_jd_profile,
            missing_jd_role,
            other_user,
        ]
    )
    await session.commit()
    return incomplete_user, missing_jd_user, other_user, incomplete_role


async def _run_workflow(url: str) -> None:
    async with Database(url) as database:
        owner, role, _profile, _project_id = await seed_context(database)
        archived_role, archived_run, archived_analysis = _ready_role(
            owner.id,
            title="Archived Role",
            preparation_status="archived",
        )
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
            (
                incomplete_user,
                missing_jd_user,
                other_user,
                incomplete_role,
            ) = await _seed_auxiliary_users(session)

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
            assert isolated.json()["setup"]["availability"] == {"status": "available"}
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
