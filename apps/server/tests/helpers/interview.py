from datetime import UTC, datetime
from uuid import UUID, uuid4

from riva.agents.job_description_parsing import JobDescriptionParsingAgent
from riva.db.database import Database
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    CareerProfileEducation,
    CareerProfileProjectExperience,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    JobDescriptionAnalysis,
    TargetRole,
    User,
)

START = datetime(2026, 8, 16, 10, 0, tzinfo=UTC)


def create_user(label: str = "interview") -> User:
    user_id = uuid4()
    username = f"{label[:10]}-{user_id.hex[:20]}"
    return User(
        id=user_id,
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name=label,
    )


def create_career_profile(
    user_id: UUID,
    *,
    include_education: bool = True,
    include_work_experience: bool = True,
    include_project_experience: bool = True,
    include_skill: bool = True,
    summary: str | None = None,
) -> CareerProfile:
    profile = CareerProfile(
        profile_id=uuid4(),
        user_id=user_id,
        summary=summary,
        version=1,
    )

    if include_education:
        profile.education = [
            CareerProfileEducation(
                id=uuid4(),
                career_profile_id=profile.profile_id,
                position=0,
                school="Tongji University",
                degree="Master",
                major="Computer Science",
                start_date="2018-09",
                end_date="2021-06",
                is_current=False,
            )
        ]
    if include_work_experience:
        profile.work_experiences = [
            CareerProfileWorkExperience(
                id=uuid4(),
                career_profile_id=profile.profile_id,
                position=0,
                company="Riva",
                title="Backend Engineer",
                employment_type="fullTime",
                location="Shanghai",
                start_date="2021-07",
                end_date=None,
                is_current=True,
                responsibilities=["Build reliable APIs"],
                achievements=["Improved API reliability"],
            )
        ]
    if include_project_experience:
        profile.project_experiences = [
            CareerProfileProjectExperience(
                id=uuid4(),
                career_profile_id=profile.profile_id,
                position=0,
                name="Payment Platform",
                role="Developer",
                start_date="2023-01",
                end_date="2023-06",
                responsibilities=["Designed payment workflows"],
                achievements=["Shipped the first version"],
            )
        ]
    if include_skill:
        profile.skills = [
            CareerProfileSkill(
                id=uuid4(),
                career_profile_id=profile.profile_id,
                position=0,
                name="Python",
                normalized_name="python",
            )
        ]
    return profile


def create_jd_ready_role(
    user_id: UUID,
    *,
    title: str = "Backend Engineer",
    company: str = "Riva",
    preparation_status: str = "preparing",
) -> tuple[TargetRole, AgentRun, JobDescriptionAnalysis]:
    role_id = uuid4()
    parsing_run = AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id=JobDescriptionParsingAgent.agent_id,
        prompt_id=JobDescriptionParsingAgent.agent_id,
        prompt_version=JobDescriptionParsingAgent.agent_version,
        output_schema_id=JobDescriptionParsingAgent.output_schema_id,
        status=AgentRunStatus.SUCCEEDED,
        payload={
            "roleId": str(role_id),
            "jobDescriptionVersion": 1,
        },
        idempotency_key=f"interview-jd-{role_id}",
        attempt_count=1,
        max_attempts=1,
        started_at=START,
        finished_at=START,
        provider="seed-provider",
        model="seed-model",
        input_tokens=1,
        output_tokens=1,
        result={"seeded": True},
    )
    role = TargetRole(
        id=role_id,
        user_id=user_id,
        title=title,
        company=company,
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


async def seed_interview_prerequisites(
    database: Database,
    *,
    label: str = "interview",
    include_education: bool = True,
    include_work_experience: bool = True,
    include_project_experience: bool = True,
    include_skill: bool = True,
    summary: str | None = None,
    role_title: str = "Backend Engineer",
    role_company: str = "Riva",
    preparation_status: str = "preparing",
) -> tuple[User, TargetRole, CareerProfile]:
    user = create_user(label)
    profile = create_career_profile(
        user.id,
        include_education=include_education,
        include_work_experience=include_work_experience,
        include_project_experience=include_project_experience,
        include_skill=include_skill,
        summary=summary,
    )
    role, parsing_run, analysis = create_jd_ready_role(
        user.id,
        title=role_title,
        company=role_company,
        preparation_status=preparation_status,
    )

    async with database.sessionmaker() as session:
        session.add_all([user, profile, role, parsing_run, analysis])
        await session.commit()
    return user, role, profile


__all__ = [
    "START",
    "create_career_profile",
    "create_jd_ready_role",
    "create_user",
    "seed_interview_prerequisites",
]
