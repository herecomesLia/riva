import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import delete, select

from riva.db.database import Database
from riva.models import (
    AgentRun,
    CareerProfile,
    CareerProfileEducation,
    CareerProfileProjectExperience,
    CareerProfileProjectSkill,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
    JobDescriptionAnalysis,
    MatchingAnalysis,
    TargetRole,
    User,
)
from riva.prompts import JOB_DESCRIPTION_PARSING_PROMPT, MATCHING_ANALYSIS_PROMPT
from riva.schemas.matching_analysis import (
    MatchingAnalysisOutput,
    MatchingAnalysisRunPayload,
)
from riva.services.matching_analyses import (
    INVALID_MATCHING_ANALYSIS_RUN,
    MATCHING_ANALYSIS_SUPERSEDED,
    MATCHING_JOB_DESCRIPTION_ANALYSIS_NOT_READY,
    MATCHING_JOB_DESCRIPTION_ANALYSIS_VERSION_STALE,
    MATCHING_JOB_DESCRIPTION_NOT_READY,
    MATCHING_JOB_DESCRIPTION_VERSION_STALE,
    MATCHING_PROFILE_INCOMPLETE,
    MATCHING_PROFILE_NOT_FOUND,
    MATCHING_PROFILE_VERSION_STALE,
    MATCHING_TARGET_NOT_FOUND,
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


def job_description_snapshot(analysis: JobDescriptionAnalysis) -> dict[str, object]:
    return {
        "job_description_version": analysis.job_description_version,
        "analysis_version": analysis.analysis_version,
        "source_agent_run_id": analysis.source_agent_run_id,
        "parsed_at": analysis.parsed_at,
        "riva_summary": analysis.riva_summary,
        "responsibilities": list(analysis.responsibilities),
        "qualification_requirements": dict(analysis.qualification_requirements),
        "required_skills": dict(analysis.required_skills),
        "preferred_qualifications": list(analysis.preferred_qualifications),
        "soft_skills": list(analysis.soft_skills),
        "business_domains": list(analysis.business_domains),
    }


def make_user(user_id: UUID, suffix: str) -> User:
    return User(
        id=user_id,
        username=user_id.hex,
        normalized_username=user_id.hex,
        password_hash="hash",
        display_name=f"Matching Service User {suffix}"[:64],
    )


def make_run(
    owner_id: UUID,
    role_id: UUID,
    profile_id: UUID,
    *,
    suffix: str,
    run_id: UUID | None = None,
    profile_version: int = 3,
    job_description_version: int = 2,
    analysis_version: int = 4,
) -> AgentRun:
    prompt = MATCHING_ANALYSIS_PROMPT
    identifier = run_id or uuid4()
    run_payload = MatchingAnalysisRunPayload(
        role_id=role_id,
        profile_id=profile_id,
        profile_version=profile_version,
        job_description_version=job_description_version,
        job_description_analysis_version=analysis_version,
        interaction_language="zh-CN",
    )
    return AgentRun(
        id=identifier,
        user_id=owner_id,
        agent_id=prompt.prompt_id,
        prompt_id=prompt.prompt_id,
        prompt_version=prompt.version,
        output_schema_id=prompt.output_schema_id,
        payload=run_payload.model_dump(mode="json", by_alias=True),
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
    second_skill = CareerProfileSkill(
        id=uuid4(),
        career_profile_id=profile.profile_id,
        position=1,
        name="FastAPI",
        normalized_name="fastapi",
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
            skill_id=second_skill.id,
            position=0,
            skill=second_skill,
        ),
        CareerProfileWorkSkill(
            id=uuid4(),
            career_profile_id=profile.profile_id,
            work_experience_id=work.id,
            skill_id=skill.id,
            position=1,
            skill=skill,
        )
    ]
    second_work = CareerProfileWorkExperience(
        id=uuid4(),
        career_profile_id=profile.profile_id,
        position=1,
        company="Riva Labs",
        title="Platform Engineer",
        employment_type="fullTime",
        start_date="2020-01",
        end_date="2021-06",
        is_current=False,
        responsibilities=["Owned platform services"],
        achievements=["Reduced deployment time"],
        source="userAdded",
    )
    second_work.skill_links = [
        CareerProfileWorkSkill(
            id=uuid4(),
            career_profile_id=profile.profile_id,
            work_experience_id=second_work.id,
            skill_id=skill.id,
            position=0,
            skill=skill,
        )
    ]
    first_project = CareerProfileProjectExperience(
        id=uuid4(),
        career_profile_id=profile.profile_id,
        position=0,
        name="Payment Platform",
        role="Developer",
        start_date="2023-01",
        end_date="2023-06",
        responsibilities=["Designed payment workflows"],
        achievements=["Shipped the first version"],
        project_url="https://example.com/payment",
        source="userAdded",
    )
    first_project.skill_links = [
        CareerProfileProjectSkill(
            id=uuid4(),
            career_profile_id=profile.profile_id,
            project_experience_id=first_project.id,
            skill_id=second_skill.id,
            position=0,
            skill=second_skill,
        ),
        CareerProfileProjectSkill(
            id=uuid4(),
            career_profile_id=profile.profile_id,
            project_experience_id=first_project.id,
            skill_id=skill.id,
            position=1,
            skill=skill,
        ),
    ]
    second_project = CareerProfileProjectExperience(
        id=uuid4(),
        career_profile_id=profile.profile_id,
        position=1,
        name="Profile Project",
        role="Owner",
        start_date="2022-01",
        end_date="2022-06",
        responsibilities=["Built a profile editor"],
        achievements=["Improved profile quality"],
        source="userAdded",
    )
    second_project.skill_links = [
        CareerProfileProjectSkill(
            id=uuid4(),
            career_profile_id=profile.profile_id,
            project_experience_id=second_project.id,
            skill_id=skill.id,
            position=0,
            skill=skill,
        )
    ]
    profile.skills = [skill, second_skill]
    profile.education = [education]
    profile.work_experiences = [work, second_work]
    profile.project_experiences = [second_project, first_project]

    parsing_run = AgentRun(
        id=uuid4(),
        user_id=owner.id,
        agent_id=JOB_DESCRIPTION_PARSING_PROMPT.prompt_id,
        prompt_id=JOB_DESCRIPTION_PARSING_PROMPT.prompt_id,
        prompt_version=JOB_DESCRIPTION_PARSING_PROMPT.version,
        output_schema_id=JOB_DESCRIPTION_PARSING_PROMPT.output_schema_id,
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


RESOURCE_ERROR_CASES = [
    pytest.param("run_user_mismatch", MATCHING_TARGET_NOT_FOUND, id="run-user"),
    pytest.param("role_missing", MATCHING_TARGET_NOT_FOUND, id="role-missing"),
    pytest.param(
        "superseded_run",
        MATCHING_ANALYSIS_SUPERSEDED,
        id="superseded-run",
    ),
    pytest.param(
        "profile_missing",
        MATCHING_PROFILE_NOT_FOUND,
        id="profile-missing",
    ),
    pytest.param(
        "profile_other_user",
        MATCHING_PROFILE_NOT_FOUND,
        id="profile-other-user",
    ),
    pytest.param(
        "profile_without_skills",
        MATCHING_PROFILE_INCOMPLETE,
        id="profile-without-skills",
    ),
    pytest.param(
        "profile_only_skills",
        MATCHING_PROFILE_INCOMPLETE,
        id="profile-only-skills",
    ),
    pytest.param(
        "profile_version_stale",
        MATCHING_PROFILE_VERSION_STALE,
        id="profile-version-stale",
    ),
    pytest.param(
        "jd_unavailable",
        MATCHING_JOB_DESCRIPTION_NOT_READY,
        id="jd-unavailable",
    ),
    pytest.param(
        "jd_version_stale",
        MATCHING_JOB_DESCRIPTION_VERSION_STALE,
        id="jd-version-stale",
    ),
    pytest.param(
        "analysis_missing",
        MATCHING_JOB_DESCRIPTION_ANALYSIS_NOT_READY,
        id="analysis-missing",
    ),
    pytest.param(
        "analysis_old_jd",
        MATCHING_JOB_DESCRIPTION_ANALYSIS_NOT_READY,
        id="analysis-old-jd",
    ),
    pytest.param(
        "analysis_version_stale",
        MATCHING_JOB_DESCRIPTION_ANALYSIS_VERSION_STALE,
        id="analysis-version-stale",
    ),
]


async def apply_resource_mutation(
    session: object,
    graph: Graph,
    case: str,
) -> None:
    # The integration fixture deliberately changes persisted rows only in ways
    # accepted by the database schema; malformed JSON cases are separate below.
    if case == "run_user_mismatch":
        other = make_user(uuid4(), "resource-other-user")
        session.add(other)  # type: ignore[attr-defined]
        stored_run = await session.get(AgentRun, graph.matching_run.id)  # type: ignore[attr-defined]
        assert stored_run is not None
        stored_run.user_id = other.id
        graph.matching_run.user_id = other.id
    elif case == "role_missing":
        await session.execute(  # type: ignore[attr-defined]
            delete(TargetRole).where(TargetRole.id == graph.role.id)
        )
    elif case == "superseded_run":
        replacement = make_run(
            graph.owner.id,
            graph.role.id,
            graph.profile.profile_id,
            suffix="resource-replacement",
        )
        session.add(replacement)  # type: ignore[attr-defined]
        stored_role = await session.get(TargetRole, graph.role.id)  # type: ignore[attr-defined]
        assert stored_role is not None
        stored_role.matching_analysis_run_id = replacement.id
    elif case == "profile_missing":
        await session.execute(  # type: ignore[attr-defined]
            delete(CareerProfile).where(
                CareerProfile.profile_id == graph.profile.profile_id
            )
        )
    elif case == "profile_other_user":
        other = make_user(uuid4(), "profile-other-user")
        other_profile = CareerProfile(
            profile_id=uuid4(),
            user_id=other.id,
            summary="Other profile",
            version=3,
        )
        session.add_all([other, other_profile])  # type: ignore[attr-defined]
        graph.matching_run.payload["profileId"] = str(other_profile.profile_id)
    elif case == "profile_without_skills":
        await session.execute(  # type: ignore[attr-defined]
            delete(CareerProfileSkill).where(
                CareerProfileSkill.career_profile_id == graph.profile.profile_id
            )
        )
    elif case == "profile_only_skills":
        await session.execute(  # type: ignore[attr-defined]
            delete(CareerProfileEducation).where(
                CareerProfileEducation.career_profile_id == graph.profile.profile_id
            )
        )
        await session.execute(  # type: ignore[attr-defined]
            delete(CareerProfileWorkExperience).where(
                CareerProfileWorkExperience.career_profile_id
                == graph.profile.profile_id
            )
        )
        await session.execute(  # type: ignore[attr-defined]
            delete(CareerProfileProjectExperience).where(
                CareerProfileProjectExperience.career_profile_id
                == graph.profile.profile_id
            )
        )
    elif case == "profile_version_stale":
        stored_profile = await session.get(  # type: ignore[attr-defined]
            CareerProfile,
            graph.profile.profile_id,
        )
        assert stored_profile is not None
        stored_profile.version = 4
    elif case == "jd_unavailable":
        stored_role = await session.get(TargetRole, graph.role.id)  # type: ignore[attr-defined]
        assert stored_role is not None
        stored_role.job_description_status = "missing"
        stored_role.raw_job_description = None
        stored_role.job_description_version = None
    elif case == "jd_version_stale":
        graph.matching_run.payload["jobDescriptionVersion"] = 1
    elif case == "analysis_missing":
        await session.execute(  # type: ignore[attr-defined]
            delete(JobDescriptionAnalysis).where(
                JobDescriptionAnalysis.role_id == graph.role.id
            )
        )
    elif case == "analysis_old_jd":
        stored_analysis = await session.get(  # type: ignore[attr-defined]
            JobDescriptionAnalysis,
            graph.role.id,
        )
        assert stored_analysis is not None
        stored_analysis.job_description_version = 1
    elif case == "analysis_version_stale":
        stored_analysis = await session.get(  # type: ignore[attr-defined]
            JobDescriptionAnalysis,
            graph.role.id,
        )
        assert stored_analysis is not None
        stored_analysis.analysis_version = 5
    else:
        raise AssertionError(f"unknown resource case: {case}")


@pytest.mark.parametrize("operation", ["load", "persist"])
@pytest.mark.parametrize("case,expected_code", RESOURCE_ERROR_CASES)
def test_matching_service_resource_error_matrix_is_safe_and_has_no_partial_write(
    operation: str,
    case: str,
    expected_code: str,
) -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, f"resource-{case}-{operation}")
            async with database.sessionmaker() as session:
                await apply_resource_mutation(session, graph, case)
                await session.commit()

            async with database.sessionmaker() as session:
                service = MatchingAnalysisService(session, clock=lambda: GENERATED_AT)
                with pytest.raises(MatchingAnalysisStateError) as exc_info:
                    if operation == "load":
                        await service.load_matching_input(graph.matching_run)
                    else:
                        await service.persist_success(graph.matching_run, output())
                assert exc_info.value.code == expected_code
                assert str(exc_info.value) == MatchingAnalysisStateError.safe_message

            async with database.sessionmaker() as session:
                stored_role = await session.get(TargetRole, graph.role.id)
                stored_analysis = await session.get(MatchingAnalysis, graph.role.id)
                if case != "role_missing":
                    assert stored_role is not None
                    assert stored_role.version == 10
                else:
                    assert stored_role is None
                assert stored_analysis is None

    asyncio.run(run())


INVALID_STRUCTURE_CASES = [
    pytest.param(
        "invalid_employment_type",
        MATCHING_PROFILE_INCOMPLETE,
        id="invalid-employment-type",
    ),
    pytest.param(
        "invalid_month",
        MATCHING_PROFILE_INCOMPLETE,
        id="invalid-month",
    ),
    pytest.param(
        "invalid_date_relation",
        MATCHING_PROFILE_INCOMPLETE,
        id="invalid-date-relation",
    ),
    pytest.param(
        "blank_skill_name",
        MATCHING_PROFILE_INCOMPLETE,
        id="blank-skill-name",
    ),
    pytest.param(
        "analysis_missing_category",
        MATCHING_JOB_DESCRIPTION_ANALYSIS_NOT_READY,
        id="analysis-missing-category",
    ),
    pytest.param(
        "analysis_invalid_list_item",
        MATCHING_JOB_DESCRIPTION_ANALYSIS_NOT_READY,
        id="analysis-invalid-list-item",
    ),
]


async def apply_invalid_structure_mutation(
    session: object,
    graph: Graph,
    case: str,
) -> None:
    if case in {
        "invalid_employment_type",
        "invalid_month",
        "invalid_date_relation",
    }:
        work = await session.scalar(  # type: ignore[attr-defined]
            select(CareerProfileWorkExperience)
            .where(
                CareerProfileWorkExperience.career_profile_id
                == graph.profile.profile_id
            )
            .order_by(CareerProfileWorkExperience.position.asc())
        )
        assert work is not None
        if case == "invalid_employment_type":
            work.employment_type = "not-an-employment-type"
        elif case == "invalid_month":
            work.start_date = "2024-13"
        else:
            work.start_date = "2024-12"
            work.end_date = "2024-01"
            work.is_current = False
    elif case == "blank_skill_name":
        skill = await session.scalar(  # type: ignore[attr-defined]
            select(CareerProfileSkill)
            .where(CareerProfileSkill.career_profile_id == graph.profile.profile_id)
            .order_by(CareerProfileSkill.position.asc())
        )
        assert skill is not None
        skill.name = "   "
    elif case == "analysis_missing_category":
        analysis = await session.get(  # type: ignore[attr-defined]
            JobDescriptionAnalysis,
            graph.role.id,
        )
        assert analysis is not None
        analysis.required_skills = {"programming_languages": ["Python"]}
    elif case == "analysis_invalid_list_item":
        analysis = await session.get(  # type: ignore[attr-defined]
            JobDescriptionAnalysis,
            graph.role.id,
        )
        assert analysis is not None
        analysis.responsibilities = [123]  # type: ignore[list-item]
    else:
        raise AssertionError(f"unknown invalid structure case: {case}")


@pytest.mark.parametrize("operation", ["load", "persist"])
@pytest.mark.parametrize("case,expected_code", INVALID_STRUCTURE_CASES)
def test_matching_service_invalid_database_structure_is_safe(
    operation: str,
    case: str,
    expected_code: str,
) -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, f"invalid-{case}-{operation}")
            async with database.sessionmaker() as session:
                await apply_invalid_structure_mutation(session, graph, case)
                await session.commit()

            async with database.sessionmaker() as session:
                with pytest.raises(MatchingAnalysisStateError) as exc_info:
                    if operation == "load":
                        await MatchingAnalysisService(
                            session,
                            clock=lambda: GENERATED_AT,
                        ).load_matching_input(graph.matching_run)
                    else:
                        await MatchingAnalysisService(
                            session,
                            clock=lambda: GENERATED_AT,
                        ).persist_success(graph.matching_run, output())
                assert exc_info.value.code == expected_code
                assert str(exc_info.value) == MatchingAnalysisStateError.safe_message

            async with database.sessionmaker() as session:
                assert await session.get(MatchingAnalysis, graph.role.id) is None
                role = await session.get(TargetRole, graph.role.id)
                assert role is not None
                assert role.version == 10

    asyncio.run(run())


def test_matching_service_loads_detached_input_persists_overwrites_and_is_idempotent() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, "lifecycle")
            async with database.sessionmaker() as session:
                initial_role = await session.get(TargetRole, graph.role.id)
                initial_profile = await session.get(
                    CareerProfile,
                    graph.profile.profile_id,
                )
                initial_jd_analysis = await session.get(
                    JobDescriptionAnalysis,
                    graph.role.id,
                )
                initial_run = await session.get(AgentRun, graph.matching_run.id)
                assert initial_role is not None
                assert initial_profile is not None
                assert initial_jd_analysis is not None
                assert initial_run is not None
                initial_role_version = initial_role.version
                initial_profile_version = initial_profile.version
                initial_jd_version = initial_role.job_description_version
                initial_analysis_version = initial_jd_analysis.analysis_version
                initial_jd_content = job_description_snapshot(initial_jd_analysis)
                initial_run_state = (
                    initial_run.status,
                    initial_run.result,
                    initial_run.provider,
                    initial_run.input_tokens,
                    initial_run.output_tokens,
                    initial_run.error_code,
                )
                service = MatchingAnalysisService(
                    session,
                    clock=lambda: GENERATED_AT,
                )
                matching_input = await service.load_matching_input(
                    graph.matching_run
                )
                assert matching_input.career_profile.skills == ["Python", "FastAPI"]
                assert [
                    item.company
                    for item in matching_input.career_profile.work_experiences
                ] == ["Riva", "Riva Labs"]
                assert matching_input.career_profile.work_experiences[0].skills == [
                    "FastAPI",
                    "Python",
                ]
                assert [
                    item.name
                    for item in matching_input.career_profile.project_experiences
                ] == ["Payment Platform", "Profile Project"]
                assert matching_input.career_profile.project_experiences[0].skills == [
                    "FastAPI",
                    "Python",
                ]
                assert matching_input.job.role_title == "Backend Engineer"
                assert matching_input.job.job_description_analysis.required_skills.programming_languages == [
                    "Python"
                ]
                input_dump = matching_input.model_dump()
                assert set(input_dump) == {
                    "career_profile",
                    "job",
                    "interaction_language",
                }
                assert (
                    input_dump["interaction_language"]
                    == graph.matching_run.payload["interactionLanguage"]
                )
                assert set(input_dump["job"]) == {
                    "role_title",
                    "company",
                    "job_description_analysis",
                }
                assert "raw_job_description" not in input_dump
                assert "project_url" not in input_dump

                persisted = await service.persist_success(
                    graph.matching_run,
                    output(),
                )
                created_at = persisted.created_at
                updated_at = persisted.updated_at
                assert persisted.generated_at == GENERATED_AT
                assert persisted.profile_id == graph.profile.profile_id
                assert persisted.profile_version == initial_profile_version
                assert persisted.job_description_version == initial_jd_version
                assert (
                    persisted.job_description_analysis_version
                    == initial_analysis_version
                )
                assert persisted.source_agent_run_id == graph.matching_run.id
                assert persisted.overall_match_score == 87
                assert persisted.core_requirements_summary == (
                    "Build reliable payment APIs with Python."
                )
                assert persisted.matched_capabilities == ["Python", "FastAPI"]
                assert persisted.missing_capabilities == ["Kubernetes"]
                assert persisted.underrepresented_capabilities == ["System design"]
                assert persisted.resume_highlights == ["Improved API reliability"]
                assert persisted.resume_gaps == ["Scale is not stated"]
                assert persisted.high_risk_questions == [
                    "How did you improve reliability?"
                ]
                assert persisted.preparation_recommendations == [
                    "Prepare the reliability example."
                ]

                idempotent = await MatchingAnalysisService(
                    session,
                    clock=lambda: REPLACED_AT,
                ).persist_success(graph.matching_run, output(12))
                assert idempotent.role_id == persisted.role_id
                assert idempotent.generated_at == GENERATED_AT
                assert idempotent.created_at == created_at
                assert idempotent.updated_at == updated_at

            async with database.sessionmaker() as session:
                stored_role = await session.get(TargetRole, graph.role.id)
                stored = await session.get(MatchingAnalysis, graph.role.id)
                assert stored_role is not None
                assert stored is not None
                assert stored_role.version == initial_role_version + 1
                assert stored_role.matching_analysis_run_id == graph.matching_run.id
                assert stored.overall_match_score == 87
                assert stored.created_at == created_at
                assert stored.updated_at == updated_at
                assert stored.generated_at == GENERATED_AT
                assert stored.profile_id == graph.profile.profile_id
                assert stored.profile_version == initial_profile_version
                assert stored.job_description_version == initial_jd_version
                assert stored.job_description_analysis_version == initial_analysis_version
                stored_jd_analysis = await session.get(
                    JobDescriptionAnalysis,
                    graph.role.id,
                )
                stored_profile = await session.get(
                    CareerProfile,
                    graph.profile.profile_id,
                )
                stored_run = await session.get(AgentRun, graph.matching_run.id)
                assert stored_jd_analysis is not None
                assert stored_profile is not None
                assert stored_run is not None
                assert job_description_snapshot(stored_jd_analysis) == (
                    initial_jd_content
                )
                assert stored_profile.version == initial_profile_version
                assert (
                    stored_run.status,
                    stored_run.result,
                    stored_run.provider,
                    stored_run.input_tokens,
                    stored_run.output_tokens,
                    stored_run.error_code,
                ) == initial_run_state

                stored_role.version = initial_role_version + 1
                stored_role.job_description_version = 3
                stored_role.raw_job_description = "Updated job description."
                stored_profile.version = 4
                stored_jd_analysis.job_description_version = 3
                stored_jd_analysis.analysis_version = 5
                stored_jd_analysis.riva_summary = "Updated structured analysis."
                updated_jd_content = job_description_snapshot(stored_jd_analysis)
                replacement = make_run(
                    graph.owner.id,
                    graph.role.id,
                    graph.profile.profile_id,
                    suffix="lifecycle-replacement",
                    profile_version=4,
                    job_description_version=3,
                    analysis_version=5,
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
                assert replaced.updated_at != updated_at
                assert replaced.profile_id == graph.profile.profile_id
                assert replaced.profile_version == 4
                assert replaced.job_description_version == 3
                assert replaced.job_description_analysis_version == 5
                assert replaced.overall_match_score == 92
                assert replaced.core_requirements_summary == (
                    "Build reliable payment APIs with Python."
                )
                assert replaced.matched_capabilities == ["Python", "FastAPI"]
                assert replaced.missing_capabilities == ["Kubernetes"]
                assert replaced.underrepresented_capabilities == ["System design"]
                assert replaced.resume_highlights == ["Improved API reliability"]
                assert replaced.resume_gaps == ["Scale is not stated"]
                assert replaced.high_risk_questions == [
                    "How did you improve reliability?"
                ]
                assert replaced.preparation_recommendations == [
                    "Prepare the reliability example."
                ]

                stored_role = await session.get(TargetRole, graph.role.id)
                stored = await session.get(MatchingAnalysis, graph.role.id)
                assert stored_role is not None
                assert stored is not None
                assert stored_role.version == initial_role_version + 2
                assert stored_role.matching_analysis_run_id == replacement.id
                assert stored.overall_match_score == 92
                assert stored.created_at == created_at
                assert stored.updated_at != updated_at
                assert stored.source_agent_run_id == replacement.id
                assert stored.generated_at == REPLACED_AT
                assert stored.profile_version == 4
                assert stored.job_description_version == 3
                assert stored.job_description_analysis_version == 5
                assert len(
                    (
                        await session.scalars(
                            select(MatchingAnalysis).where(
                                MatchingAnalysis.role_id == graph.role.id
                            )
                        )
                    ).all()
                ) == 1
                stored_jd_analysis = await session.get(
                    JobDescriptionAnalysis,
                    graph.role.id,
                )
                assert stored_jd_analysis is not None
                assert job_description_snapshot(stored_jd_analysis) == (
                    updated_jd_content
                )

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


def test_matching_service_rejects_same_source_with_dependency_mismatch() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, "same-source-mismatch")
            async with database.sessionmaker() as session:
                await MatchingAnalysisService(
                    session,
                    clock=lambda: GENERATED_AT,
                ).persist_success(graph.matching_run, output())

            async with database.sessionmaker() as session:
                stored = await session.get(MatchingAnalysis, graph.role.id)
                role = await session.get(TargetRole, graph.role.id)
                assert stored is not None
                assert role is not None
                stored.profile_version = 99
                await session.commit()
                before = {
                    "profile_version": stored.profile_version,
                    "generated_at": stored.generated_at,
                    "updated_at": stored.updated_at,
                    "score": stored.overall_match_score,
                }
                role_version = role.version

                with pytest.raises(MatchingAnalysisStateError) as exc_info:
                    await MatchingAnalysisService(
                        session,
                        clock=lambda: REPLACED_AT,
                    ).persist_success(graph.matching_run, output(12))
                assert exc_info.value.code == INVALID_MATCHING_ANALYSIS_RUN

                stored = await session.get(MatchingAnalysis, graph.role.id)
                role = await session.get(TargetRole, graph.role.id)
                assert stored is not None
                assert role is not None
                assert {
                    "profile_version": stored.profile_version,
                    "generated_at": stored.generated_at,
                    "updated_at": stored.updated_at,
                    "score": stored.overall_match_score,
                } == before
                assert role.version == role_version

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


def test_matching_service_old_and_new_runs_concurrently_only_new_run_writes() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, "old-new-concurrent")
            replacement = make_run(
                graph.owner.id,
                graph.role.id,
                graph.profile.profile_id,
                suffix="old-new-concurrent-replacement",
            )
            async with database.sessionmaker() as session:
                session.add(replacement)
                role = await session.get(TargetRole, graph.role.id)
                assert role is not None
                role.matching_analysis_run_id = replacement.id
                await session.commit()

            async def persist_old() -> MatchingAnalysis | Exception:
                async with database.sessionmaker() as session:
                    try:
                        return await MatchingAnalysisService(
                            session,
                            clock=lambda: GENERATED_AT,
                        ).persist_success(graph.matching_run, output())
                    except Exception as exc:
                        return exc

            async def persist_new() -> MatchingAnalysis | Exception:
                async with database.sessionmaker() as session:
                    try:
                        return await MatchingAnalysisService(
                            session,
                            clock=lambda: REPLACED_AT,
                        ).persist_success(replacement, output(92))
                    except Exception as exc:
                        return exc

            old_result, new_result = await asyncio.gather(
                persist_old(),
                persist_new(),
            )
            assert isinstance(old_result, MatchingAnalysisStateError)
            assert old_result.code == MATCHING_ANALYSIS_SUPERSEDED
            assert isinstance(new_result, MatchingAnalysis)

            async with database.sessionmaker() as session:
                role = await session.get(TargetRole, graph.role.id)
                stored = await session.get(MatchingAnalysis, graph.role.id)
                assert role is not None
                assert stored is not None
                assert role.version == 11
                assert role.matching_analysis_run_id == replacement.id
                assert stored.source_agent_run_id == replacement.id
                assert stored.overall_match_score == 92

    asyncio.run(run())


def test_matching_service_load_then_profile_edit_is_rejected() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, "load-profile-race")
            async with database.sessionmaker() as session:
                await MatchingAnalysisService(session).load_matching_input(
                    graph.matching_run
                )

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
                assert await session.get(MatchingAnalysis, graph.role.id) is None

    asyncio.run(run())


def test_matching_service_load_then_jd_save_is_rejected() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, "load-jd-race")
            async with database.sessionmaker() as session:
                await MatchingAnalysisService(session).load_matching_input(
                    graph.matching_run
                )

            async with database.sessionmaker() as session:
                role = await session.get(TargetRole, graph.role.id)
                assert role is not None
                role.job_description_version = 3
                role.raw_job_description = "A newer JD."
                await session.execute(
                    delete(JobDescriptionAnalysis).where(
                        JobDescriptionAnalysis.role_id == graph.role.id
                    )
                )
                await session.commit()

            async with database.sessionmaker() as session:
                with pytest.raises(MatchingAnalysisStateError) as exc_info:
                    await MatchingAnalysisService(session).persist_success(
                        graph.matching_run,
                        output(),
                    )
                assert exc_info.value.code == MATCHING_JOB_DESCRIPTION_VERSION_STALE
                assert await session.get(MatchingAnalysis, graph.role.id) is None

    asyncio.run(run())


def test_matching_service_load_then_analysis_edit_is_rejected() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, "load-analysis-race")
            async with database.sessionmaker() as session:
                await MatchingAnalysisService(session).load_matching_input(
                    graph.matching_run
                )

            async with database.sessionmaker() as session:
                analysis = await session.get(JobDescriptionAnalysis, graph.role.id)
                assert analysis is not None
                analysis.analysis_version = 5
                await session.commit()

            async with database.sessionmaker() as session:
                with pytest.raises(MatchingAnalysisStateError) as exc_info:
                    await MatchingAnalysisService(session).persist_success(
                        graph.matching_run,
                        output(),
                    )
                assert (
                    exc_info.value.code
                    == MATCHING_JOB_DESCRIPTION_ANALYSIS_VERSION_STALE
                )
                assert await session.get(MatchingAnalysis, graph.role.id) is None

    asyncio.run(run())


def test_matching_service_naive_clock_rolls_back_and_keeps_old_result() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            graph, _ = await seed(database, "naive-clock")
            async with database.sessionmaker() as session:
                await MatchingAnalysisService(
                    session,
                    clock=lambda: GENERATED_AT,
                ).persist_success(graph.matching_run, output())

            async with database.sessionmaker() as session:
                old = await session.get(MatchingAnalysis, graph.role.id)
                role = await session.get(TargetRole, graph.role.id)
                assert old is not None
                assert role is not None
                old_snapshot = {
                    "source": old.source_agent_run_id,
                    "generated_at": old.generated_at,
                    "created_at": old.created_at,
                    "updated_at": old.updated_at,
                    "score": old.overall_match_score,
                }
                role_version = role.version
                replacement = make_run(
                    graph.owner.id,
                    graph.role.id,
                    graph.profile.profile_id,
                    suffix="naive-clock-replacement",
                )
                session.add(replacement)
                role.matching_analysis_run_id = replacement.id
                await session.commit()

                with pytest.raises(ValueError, match="timezone-aware"):
                    await MatchingAnalysisService(
                        session,
                        clock=lambda: datetime(2026, 8, 4, 9, 30),
                    ).persist_success(replacement, output(12))

                role = await session.get(TargetRole, graph.role.id)
                stored = await session.get(MatchingAnalysis, graph.role.id)
                assert role is not None
                assert stored is not None
                assert {
                    "source": stored.source_agent_run_id,
                    "generated_at": stored.generated_at,
                    "created_at": stored.created_at,
                    "updated_at": stored.updated_at,
                    "score": stored.overall_match_score,
                } == old_snapshot
                assert role.version == role_version

                # The rollback must leave this transaction usable.
                assert await session.scalar(
                    select(TargetRole.id).where(TargetRole.id == graph.role.id)
                ) == graph.role.id

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
                    "FastAPI",
                    "Python",
                ]

                state = await session.scalar(
                    select(TargetRole).where(TargetRole.id == graph.role.id)
                )
                assert state is not None

    asyncio.run(run())
