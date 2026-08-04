import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from riva.db.database import Database
from riva.models import (
    AgentRun,
    CareerProfile,
    CareerProfileEducation,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
    JobDescriptionAnalysis,
    MatchingAnalysis,
    TargetRole,
    User,
)
from riva.prompts import MATCHING_ANALYSIS_PROMPT_V1
from riva.schemas.matching_analysis import MatchingAnalysisOutput
from riva.services.matching_analyses import (
    MATCHING_ANALYSIS_SUPERSEDED,
    MATCHING_PROFILE_VERSION_STALE,
    MatchingAnalysisService,
    MatchingAnalysisStateError,
)


pytestmark = pytest.mark.integration
GENERATED_AT = datetime(2026, 8, 4, 9, 30, tzinfo=UTC)
REPLACED_AT = datetime(2026, 8, 4, 10, 30, tzinfo=UTC)


@dataclass(frozen=True)
class Graph:
    owner: User
    role: TargetRole
    profile: CareerProfile
    parsing_run: AgentRun
    matching_run: AgentRun


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def output(score: int = 87) -> MatchingAnalysisOutput:
    return MatchingAnalysisOutput(
        overall_match_score=score,
        core_requirements_summary="Build reliable payment APIs with Python.",
        matched_capabilities=["Python", "FastAPI"],
        missing_capabilities=["Kubernetes"],
        underrepresented_capabilities=["System design"],
        resume_highlights=["Improved API reliability"],
        resume_gaps=["Scale is not stated"],
        high_risk_questions=["How did you improve reliability?"],
        preparation_recommendations=["Prepare the reliability example."],
    )


def make_user(user_id: UUID, suffix: str) -> User:
    return User(
        id=user_id,
        username=f"matching-service-{suffix}-{user_id.hex[:8]}",
        normalized_username=f"matching-service-{suffix}-{user_id.hex[:8]}",
        password_hash="hash",
        display_name="Matching Service User",
    )


def make_run(
    owner_id: UUID,
    role_id: UUID,
    profile_id: UUID,
    *,
    suffix: str,
    run_id: UUID | None = None,
) -> AgentRun:
    prompt = MATCHING_ANALYSIS_PROMPT_V1
    identifier = run_id or uuid4()
    return AgentRun(
        id=identifier,
        user_id=owner_id,
        agent_id=prompt.prompt_id,
        prompt_id=prompt.prompt_id,
        prompt_version=prompt.version,
        output_schema_id=prompt.output_schema_id,
        payload={
            "roleId": str(role_id),
            "profileId": str(profile_id),
            "profileVersion": 3,
            "jobDescriptionVersion": 2,
            "jobDescriptionAnalysisVersion": 4,
        },
        idempotency_key=f"matching-service-{suffix}-{identifier}",
        max_attempts=3,
        model="test-model",
    )


def make_graph(suffix: str) -> tuple[Graph, JobDescriptionAnalysis]:
    owner = make_user(uuid4(), suffix)
    role = TargetRole(
        id=uuid4(),
        user_id=owner.id,
        title="Backend Engineer",
        company="Riva",
        preparation_status="preparing",
        job_description_status="saved",
        raw_job_description="Build reliable APIs.",
        job_description_version=2,
        version=10,
    )
    profile = CareerProfile(
        profile_id=uuid4(),
        user_id=owner.id,
        summary="Backend engineer focused on reliable APIs.",
        version=3,
    )
    skill = CareerProfileSkill(
        id=uuid4(),
        career_profile_id=profile.profile_id,
        position=0,
        name="Python",
        normalized_name="python",
        source="userAdded",
    )
    education = CareerProfileEducation(
        id=uuid4(),
        career_profile_id=profile.profile_id,
        position=0,
        school="Tongji University",
        degree="Master",
        major="Software Engineering",
        start_date="2018-09",
        end_date="2021-06",
        is_current=False,
        source="userAdded",
    )
    work = CareerProfileWorkExperience(
        id=uuid4(),
        career_profile_id=profile.profile_id,
        position=0,
        company="Riva",
        title="Backend Engineer",
        employment_type="fullTime",
        start_date="2021-07",
        end_date=None,
        is_current=True,
        responsibilities=["Build reliable APIs"],
        achievements=["Improved reliability"],
        source="userAdded",
    )
    work.skill_links = [
        CareerProfileWorkSkill(
            id=uuid4(),
            career_profile_id=profile.profile_id,
            work_experience_id=work.id,
            skill_id=skill.id,
            position=0,
            skill=skill,
        )
    ]
    profile.skills = [skill]
    profile.education = [education]
    profile.work_experiences = [work]

    parsing_run = AgentRun(
        id=uuid4(),
        user_id=owner.id,
        agent_id="job-description-parser",
        prompt_id="job-description-parser",
        prompt_version="1",
        output_schema_id="job-description-analysis-v1",
        payload={
            "roleId": str(role.id),
            "jobDescriptionVersion": 2,
        },
        idempotency_key=f"matching-service-parsing-{suffix}",
        max_attempts=3,
        model="test-model",
    )
    matching_run = make_run(
        owner.id,
        role.id,
        profile.profile_id,
        suffix=f"{suffix}-current",
    )
    role.matching_analysis_run_id = matching_run.id
    role.job_description_parsing_run_id = parsing_run.id
    analysis = JobDescriptionAnalysis(
        role_id=role.id,
        user_id=owner.id,
        job_description_version=2,
        analysis_version=4,
        source_agent_run_id=parsing_run.id,
        parsed_at=GENERATED_AT,
        riva_summary="Build reliable APIs with Python.",
        responsibilities=["Design APIs"],
        qualification_requirements={
            "education": [],
            "graduation_cohorts": [],
            "majors": [],
            "experience": ["Three years"],
            "languages": [],
            "certifications": [],
            "other": [],
        },
        required_skills={
            "programming_languages": ["Python"],
            "frameworks_and_libraries": ["FastAPI"],
            "platforms": [],
            "tools": [],
            "concepts_and_methods": [],
            "databases_and_middleware": [],
            "other": [],
        },
        preferred_qualifications=[],
        soft_skills=[],
        business_domains=["Payments"],
    )
    return Graph(owner, role, profile, parsing_run, matching_run), analysis


async def seed(database: Database, suffix: str) -> tuple[Graph, JobDescriptionAnalysis]:
    graph, analysis = make_graph(suffix)
    async with database.sessionmaker() as session:
        session.add_all(
            [
                graph.owner,
                graph.role,
                graph.profile,
                graph.parsing_run,
                graph.matching_run,
                analysis,
            ]
        )
        await session.commit()
    return graph, analysis


def test_matching_service_loads_detached_input_persists_overwrites_and_is_idempotent() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, "lifecycle")
            async with database.sessionmaker() as session:
                service = MatchingAnalysisService(
                    session,
                    clock=lambda: GENERATED_AT,
                )
                matching_input = await service.load_matching_input(
                    graph.matching_run
                )
                assert matching_input.career_profile.skills == ["Python"]
                assert matching_input.career_profile.work_experiences[0].skills == [
                    "Python"
                ]
                assert matching_input.job.role_title == "Backend Engineer"
                assert matching_input.job.job_description_analysis.required_skills.programming_languages == [
                    "Python"
                ]
                assert "raw_job_description" not in matching_input.model_dump()

                persisted = await service.persist_success(
                    graph.matching_run,
                    output(),
                )
                created_at = persisted.created_at
                assert persisted.generated_at == GENERATED_AT

                idempotent = await MatchingAnalysisService(
                    session,
                    clock=lambda: REPLACED_AT,
                ).persist_success(graph.matching_run, output(12))
                assert idempotent.role_id == persisted.role_id
                assert idempotent.generated_at == GENERATED_AT

            async with database.sessionmaker() as session:
                stored_role = await session.get(TargetRole, graph.role.id)
                stored = await session.get(MatchingAnalysis, graph.role.id)
                assert stored_role is not None
                assert stored is not None
                assert stored_role.version == 11
                assert stored.overall_match_score == 87
                assert stored.created_at == created_at

                replacement = make_run(
                    graph.owner.id,
                    graph.role.id,
                    graph.profile.profile_id,
                    suffix="lifecycle-replacement",
                )
                session.add(replacement)
                stored_role.matching_analysis_run_id = replacement.id
                await session.commit()

                replaced = await MatchingAnalysisService(
                    session,
                    clock=lambda: REPLACED_AT,
                ).persist_success(replacement, output(92))
                assert replaced.source_agent_run_id == replacement.id
                assert replaced.generated_at == REPLACED_AT
                assert replaced.created_at == created_at

                stored_role = await session.get(TargetRole, graph.role.id)
                stored = await session.get(MatchingAnalysis, graph.role.id)
                assert stored_role is not None
                assert stored is not None
                assert stored_role.version == 12
                assert stored.overall_match_score == 92

    asyncio.run(run())


def test_matching_service_rejects_stale_profile_without_writing() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, "stale-profile")
            async with database.sessionmaker() as session:
                profile = await session.get(CareerProfile, graph.profile.profile_id)
                assert profile is not None
                profile.version = 4
                await session.commit()

            async with database.sessionmaker() as session:
                with pytest.raises(MatchingAnalysisStateError) as exc_info:
                    await MatchingAnalysisService(session).persist_success(
                        graph.matching_run,
                        output(),
                    )
                assert exc_info.value.code == MATCHING_PROFILE_VERSION_STALE

                role = await session.get(TargetRole, graph.role.id)
                analysis = await session.get(MatchingAnalysis, graph.role.id)
                assert role is not None
                assert role.version == 10
                assert analysis is None

    asyncio.run(run())


def test_matching_service_rejects_superseded_run_without_writing() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, "superseded")
            async with database.sessionmaker() as session:
                replacement = make_run(
                    graph.owner.id,
                    graph.role.id,
                    graph.profile.profile_id,
                    suffix="superseded-replacement",
                )
                session.add(replacement)
                role = await session.get(TargetRole, graph.role.id)
                assert role is not None
                role.matching_analysis_run_id = replacement.id
                await session.commit()

                with pytest.raises(MatchingAnalysisStateError) as exc_info:
                    await MatchingAnalysisService(session).persist_success(
                        graph.matching_run,
                        output(),
                    )
                assert exc_info.value.code == MATCHING_ANALYSIS_SUPERSEDED
                analysis = await session.get(MatchingAnalysis, graph.role.id)
                assert analysis is None

    asyncio.run(run())


def test_matching_service_same_run_concurrency_increments_role_once() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, "concurrent")

            async def persist() -> MatchingAnalysis:
                async with database.sessionmaker() as session:
                    return await MatchingAnalysisService(
                        session,
                        clock=lambda: GENERATED_AT,
                    ).persist_success(graph.matching_run, output())

            results = await asyncio.gather(persist(), persist())

            async with database.sessionmaker() as session:
                role = await session.get(TargetRole, graph.role.id)
                analysis = await session.get(MatchingAnalysis, graph.role.id)
                assert role is not None
                assert analysis is not None
                assert role.version == 11
                assert analysis.source_agent_run_id == graph.matching_run.id
                assert [result.generated_at for result in results] == [
                    GENERATED_AT,
                    GENERATED_AT,
                ]

    asyncio.run(run())


def test_matching_service_locks_and_eager_loads_profile_graph() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, "eager")
            async with database.sessionmaker() as session:
                matching_input = await MatchingAnalysisService(
                    session
                ).load_matching_input(graph.matching_run)
                assert matching_input.career_profile.education[0].school == (
                    "Tongji University"
                )
                assert matching_input.career_profile.work_experiences[0].skills == [
                    "Python"
                ]

                state = await session.scalar(
                    select(TargetRole).where(TargetRole.id == graph.role.id)
                )
                assert state is not None

    asyncio.run(run())
