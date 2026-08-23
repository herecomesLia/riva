import asyncio
import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from riva.agents.job_description_parsing import JobDescriptionParsingAgent
from riva.db.database import Database
from riva.models import AgentRun, JobDescriptionAnalysis, TargetRole, User
from riva.schemas.job_description_parsing import JobDescriptionParsingOutput
from riva.schemas.roles import SaveJobDescriptionRequest
from riva.services.job_description_analyses import (
    INVALID_PARSE_RUN,
    JOB_DESCRIPTION_MISSING,
    JOB_DESCRIPTION_VERSION_STALE,
    PARSE_SUPERSEDED,
    TARGET_NOT_FOUND,
    JobDescriptionAnalysisService,
    JobDescriptionParsingStateError,
)
from riva.services.roles import TargetRoleService

pytestmark = pytest.mark.integration
PARSED_AT_1 = datetime(2026, 7, 31, 8, tzinfo=UTC)
PARSED_AT_2 = datetime(2026, 7, 31, 9, tzinfo=UTC)


def user(user_id: UUID, username: str) -> User:
    return User(
        id=user_id,
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name=username,
    )


def role(owner_id: UUID, *, saved: bool = True) -> TargetRole:
    return TargetRole(
        id=uuid4(),
        user_id=owner_id,
        title="Backend Engineer",
        company="Riva",
        preparation_status="preparing",
        job_description_status="saved" if saved else "missing",
        raw_job_description="Build reliable APIs." if saved else None,
        job_description_version=1 if saved else None,
        version=1,
    )


def parsing_run(
    owner_id: UUID,
    role_id: UUID,
    *,
    run_id: UUID | None = None,
    job_description_version: int = 1,
    agent_id: str = "job-description-parser",
    prompt_id: str = JobDescriptionParsingAgent.agent_id,
    prompt_version: str = JobDescriptionParsingAgent.agent_version,
    output_schema_id: str = JobDescriptionParsingAgent.output_schema_id,
    payload: dict[str, str | int] | None = None,
) -> AgentRun:
    identifier = run_id or uuid4()
    return AgentRun(
        id=identifier,
        user_id=owner_id,
        agent_id=agent_id,
        prompt_id=prompt_id,
        prompt_version=prompt_version,
        output_schema_id=output_schema_id,
        payload=payload
        or {
            "roleId": str(role_id),
            "jobDescriptionVersion": job_description_version,
        },
        idempotency_key=f"parse-{identifier}",
        max_attempts=3,
        model="test-model",
    )


def output(summary: str) -> JobDescriptionParsingOutput:
    return JobDescriptionParsingOutput.model_validate(
        {
            "riva_summary": summary,
            "responsibilities": ["Design APIs"],
            "qualification_requirements": {
                "education": ["Bachelor's degree"],
                "graduation_cohorts": [],
                "majors": [
                    "Computer Science, Software Engineering, or a related field"
                ],
                "experience": ["Three years of experience"],
                "languages": ["English"],
                "certifications": [],
                "other": [],
            },
            "required_skills": {
                "programming_languages": ["Python"],
                "frameworks_and_libraries": ["FastAPI"],
                "platforms": ["Linux"],
                "tools": ["Git"],
                "concepts_and_methods": ["Distributed systems"],
                "databases_and_middleware": ["PostgreSQL"],
                "other": [],
            },
            "preferred_qualifications": ["Kubernetes or cloud platform experience"],
            "soft_skills": ["Communication"],
            "business_domains": ["Payments"],
        }
    )


async def expect_load_error(
    database: Database,
    run: AgentRun,
    code: str,
) -> None:
    async with database.sessionmaker() as session:
        with pytest.raises(JobDescriptionParsingStateError) as exc_info:
            await JobDescriptionAnalysisService(session).load_parsing_input(run)

    assert exc_info.value.code == code
    assert str(exc_info.value) == JobDescriptionParsingStateError.safe_message


def test_job_description_analysis_lifecycle_guards_and_invalidation() -> None:
    test_database_url = os.getenv("RIVA_TEST_DATABASE_URL")
    if not test_database_url:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")

    development_database_url = os.getenv("RIVA_DATABASE_URL")
    if development_database_url == test_database_url:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")

    async def run() -> None:
        owner = user(uuid4(), "analysis-owner")
        other = user(uuid4(), "analysis-other")
        target = role(owner.id)
        current_run = parsing_run(owner.id, target.id)
        missing_target = role(owner.id, saved=False)
        missing_run = parsing_run(owner.id, missing_target.id)

        async with Database(test_database_url) as database:
            await database.reset()
            try:
                async with database.sessionmaker() as session:
                    session.add_all(
                        [
                            owner,
                            other,
                            target,
                            current_run,
                            missing_target,
                            missing_run,
                        ]
                    )
                    await session.flush()
                    target.job_description_parsing_run_id = current_run.id
                    missing_target.job_description_parsing_run_id = missing_run.id
                    await session.commit()

                async with database.sessionmaker() as session:
                    parsing_input = await JobDescriptionAnalysisService(
                        session
                    ).load_parsing_input(current_run)
                assert parsing_input.role_title == "Backend Engineer"
                assert parsing_input.company == "Riva"
                assert parsing_input.raw_job_description == "Build reliable APIs."

                await expect_load_error(
                    database,
                    parsing_run(other.id, target.id),
                    TARGET_NOT_FOUND,
                )
                await expect_load_error(
                    database,
                    parsing_run(owner.id, uuid4()),
                    TARGET_NOT_FOUND,
                )
                await expect_load_error(database, missing_run, JOB_DESCRIPTION_MISSING)
                await expect_load_error(
                    database,
                    parsing_run(
                        owner.id,
                        target.id,
                        run_id=current_run.id,
                        job_description_version=2,
                    ),
                    JOB_DESCRIPTION_VERSION_STALE,
                )
                await expect_load_error(
                    database,
                    parsing_run(owner.id, target.id),
                    PARSE_SUPERSEDED,
                )

                for invalid_run in (
                    parsing_run(owner.id, target.id, agent_id="other-agent"),
                    parsing_run(owner.id, target.id, prompt_id="other-prompt"),
                    parsing_run(owner.id, target.id, prompt_version="1"),
                    parsing_run(
                        owner.id,
                        target.id,
                        output_schema_id="other-schema",
                    ),
                    parsing_run(
                        owner.id,
                        target.id,
                        payload={"rawText": "must-not-be-loaded"},
                    ),
                ):
                    await expect_load_error(database, invalid_run, INVALID_PARSE_RUN)

                first_output = output("Original structured summary.")
                async with database.sessionmaker() as session:
                    analysis = await JobDescriptionAnalysisService(
                        session,
                        clock=lambda: PARSED_AT_1,
                    ).persist_success(current_run, first_output)

                assert analysis.role_id == target.id
                assert analysis.user_id == owner.id
                assert analysis.job_description_version == 1
                assert analysis.analysis_version == 1
                assert analysis.source_agent_run_id == current_run.id
                assert analysis.parsed_at == PARSED_AT_1
                assert analysis.riva_summary == "Original structured summary."
                assert analysis.responsibilities == ["Design APIs"]
                assert analysis.qualification_requirements["education"] == [
                    "Bachelor's degree"
                ]
                assert analysis.required_skills["programming_languages"] == ["Python"]
                assert analysis.qualification_requirements["majors"] == [
                    "Computer Science, Software Engineering, or a related field"
                ]
                assert analysis.preferred_qualifications == [
                    "Kubernetes or cloud platform experience"
                ]
                assert analysis.soft_skills == ["Communication"]
                assert analysis.business_domains == ["Payments"]

                async with database.sessionmaker() as session:
                    persisted_role = await session.get(TargetRole, target.id)
                    assert persisted_role is not None
                    assert persisted_role.version == 2

                async with database.sessionmaker() as session:
                    duplicate = await JobDescriptionAnalysisService(
                        session,
                        clock=lambda: PARSED_AT_2,
                    ).persist_success(
                        current_run,
                        output("This must not overwrite the first result."),
                    )
                assert duplicate.riva_summary == "Original structured summary."
                assert duplicate.parsed_at == PARSED_AT_1
                async with database.sessionmaker() as session:
                    persisted_role = await session.get(TargetRole, target.id)
                    assert persisted_role is not None
                    assert persisted_role.version == 2

                async with database.sessionmaker() as session:
                    no_op_page = await TargetRoleService(session).save_job_description(
                        owner,
                        target.id,
                        SaveJobDescriptionRequest(
                            version=2,
                            raw_text="Build reliable APIs.",
                        ),
                    )
                    no_op_role = no_op_page.roles[0]
                    assert no_op_role.version == 2
                async with database.sessionmaker() as session:
                    persisted_role = await session.get(TargetRole, target.id)
                    retained = await session.get(JobDescriptionAnalysis, target.id)
                    assert persisted_role is not None
                    assert persisted_role.job_description_parsing_run_id == (
                        current_run.id
                    )
                    assert retained is not None

                replacement_run = parsing_run(owner.id, target.id)
                async with database.sessionmaker() as session:
                    session.add(replacement_run)
                    await session.flush()
                    persisted_role = await session.get(TargetRole, target.id)
                    assert persisted_role is not None
                    persisted_role.job_description_parsing_run_id = replacement_run.id
                    await session.commit()

                async with database.sessionmaker() as session:
                    replacement = await JobDescriptionAnalysisService(
                        session,
                        clock=lambda: PARSED_AT_2,
                    ).persist_success(
                        replacement_run,
                        output("Replacement structured summary."),
                    )
                assert replacement.analysis_version == 1
                assert replacement.source_agent_run_id == replacement_run.id
                assert replacement.parsed_at == PARSED_AT_2
                assert replacement.riva_summary == "Replacement structured summary."
                async with database.sessionmaker() as session:
                    persisted_role = await session.get(TargetRole, target.id)
                    assert persisted_role is not None
                    assert persisted_role.version == 3

                async with database.sessionmaker() as session:
                    with pytest.raises(JobDescriptionParsingStateError) as exc_info:
                        await JobDescriptionAnalysisService(session).persist_success(
                            current_run,
                            first_output,
                        )
                assert exc_info.value.code == PARSE_SUPERSEDED

                async with database.sessionmaker() as session:
                    changed_page = await TargetRoleService(
                        session
                    ).save_job_description(
                        owner,
                        target.id,
                        SaveJobDescriptionRequest(
                            version=3,
                            raw_text="Build distributed systems.",
                        ),
                    )
                    changed = changed_page.roles[0]
                    assert changed.version == 4
                    assert changed.job_description.version == 2
                async with database.sessionmaker() as session:
                    persisted_role = await session.get(TargetRole, target.id)
                    invalidated = await session.get(JobDescriptionAnalysis, target.id)
                    old_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.id.in_(
                                        (current_run.id, replacement_run.id)
                                    )
                                )
                            )
                        ).all()
                    )
                    assert persisted_role is not None
                    assert persisted_role.job_description_parsing_run_id is None
                    assert invalidated is None
                    assert len(old_runs) == 2

                async with database.sessionmaker() as session:
                    with pytest.raises(JobDescriptionParsingStateError) as exc_info:
                        await JobDescriptionAnalysisService(session).persist_success(
                            replacement_run,
                            output("Stale result."),
                        )
                assert exc_info.value.code == JOB_DESCRIPTION_VERSION_STALE

                final_run = parsing_run(
                    owner.id,
                    target.id,
                    job_description_version=2,
                )
                async with database.sessionmaker() as session:
                    session.add(final_run)
                    await session.flush()
                    persisted_role = await session.get(TargetRole, target.id)
                    assert persisted_role is not None
                    persisted_role.job_description_parsing_run_id = final_run.id
                    await session.commit()
                async with database.sessionmaker() as session:
                    await JobDescriptionAnalysisService(
                        session,
                        clock=lambda: PARSED_AT_2,
                    ).persist_success(final_run, output("Final summary."))

                transient_run = parsing_run(
                    owner.id,
                    target.id,
                    job_description_version=2,
                )
                async with database.sessionmaker() as session:
                    session.add(transient_run)
                    await session.flush()
                    persisted_role = await session.get(TargetRole, target.id)
                    assert persisted_role is not None
                    persisted_role.job_description_parsing_run_id = transient_run.id
                    await session.commit()
                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, transient_run.id)
                    assert stored_run is not None
                    await session.delete(stored_run)
                    await session.commit()
                async with database.sessionmaker() as session:
                    persisted_role = await session.get(TargetRole, target.id)
                    assert persisted_role is not None
                    assert persisted_role.job_description_parsing_run_id is None
                    assert (
                        await session.get(JobDescriptionAnalysis, target.id) is not None
                    )

                async with database.sessionmaker() as session:
                    persisted_role = await session.get(TargetRole, target.id)
                    assert persisted_role is not None
                    assert persisted_role.version == 5
                    await TargetRoleService(session).delete_role(
                        owner,
                        target.id,
                        version=5,
                    )
                async with database.sessionmaker() as session:
                    assert await session.get(TargetRole, target.id) is None
                    assert await session.get(JobDescriptionAnalysis, target.id) is None
                    assert await session.get(AgentRun, final_run.id) is not None
            finally:
                await database.reset()

    asyncio.run(run())
