import asyncio
from datetime import UTC, datetime
import os
from uuid import UUID, uuid4

import pytest
from riva.core.errors import APIError
from riva.db import Database
from riva.models import (
    AgentRun,
    AgentRunStatus,
    JobDescriptionAnalysis,
    TargetRole,
    User,
)
from riva.schemas.roles import UpdateJobDescriptionAnalysisModuleRequest
from riva.services.roles import TargetRoleService


pytestmark = pytest.mark.integration
PARSED_AT = datetime(2026, 8, 1, 8, tzinfo=UTC)


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def owner(user_id: UUID, suffix: str) -> User:
    return User(
        id=user_id,
        username=f"analysis-edit-{suffix}-{user_id.hex[:8]}",
        normalized_username=f"analysis-edit-{suffix}-{user_id.hex[:8]}",
        password_hash="hash",
        display_name="Analysis Editor",
    )


def role(user_id: UUID, *, saved: bool = True, jd_version: int = 1) -> TargetRole:
    return TargetRole(
        id=uuid4(),
        user_id=user_id,
        title="Backend Engineer",
        company="Riva",
        preparation_status="preparing",
        job_description_status="saved" if saved else "missing",
        raw_job_description="Build reliable APIs." if saved else None,
        job_description_version=jd_version if saved else None,
        version=1,
    )


def source_run(user_id: UUID) -> AgentRun:
    run_id = uuid4()
    return AgentRun(
        id=run_id,
        user_id=user_id,
        agent_id="job-description-parser",
        prompt_id="job-description-parser",
        prompt_version="1",
        output_schema_id="job-description-analysis-v1",
        payload={},
        idempotency_key=f"analysis-edit-{run_id}",
        max_attempts=1,
        model="test-model",
    )


def failed_run(user_id: UUID) -> AgentRun:
    now = datetime(2026, 8, 1, 8, tzinfo=UTC)
    run = source_run(user_id)
    run.status = AgentRunStatus.FAILED
    run.attempt_count = 1
    run.started_at = now
    run.finished_at = now
    run.error_code = "invalid_structured_output"
    return run


def analysis(
    target: TargetRole,
    run: AgentRun,
    *,
    jd_version: int | None = None,
) -> JobDescriptionAnalysis:
    return JobDescriptionAnalysis(
        role_id=target.id,
        user_id=target.user_id,
        job_description_version=(
            target.job_description_version
            if jd_version is None
            else jd_version
        ),
        analysis_version=1,
        source_agent_run_id=run.id,
        parsed_at=PARSED_AT,
        riva_summary="Original structured summary.",
        responsibilities=["Design APIs"],
        qualification_requirements={
            "education": [],
            "graduation_cohorts": [],
            "majors": [],
            "experience": [],
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
        soft_skills=[],
        business_domains=[],
    )


def request(
    *,
    role_version: int,
    jd_version: int,
    analysis_version: int,
    field: str,
    value: object,
) -> UpdateJobDescriptionAnalysisModuleRequest:
    from pydantic import TypeAdapter

    return TypeAdapter(UpdateJobDescriptionAnalysisModuleRequest).validate_python(
        {
            "version": role_version,
            "jobDescriptionVersion": jd_version,
            "analysisVersion": analysis_version,
            "field": field,
            "value": value,
        }
    )


def response_role(page, role_id: UUID):
    return next(item for item in page.roles if item.id == role_id)


async def expect_error(
    database: Database,
    user: User,
    role_id: UUID,
    payload: UpdateJobDescriptionAnalysisModuleRequest,
    error: str,
    status_code: int = 409,
) -> None:
    async with database.sessionmaker() as session:
        with pytest.raises(APIError) as exc_info:
            await TargetRoleService(session).update_job_description_analysis_module(
                user,
                role_id,
                payload,
            )
    assert exc_info.value.error == error
    assert exc_info.value.status_code == status_code


def test_editing_each_analysis_module_and_noop() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                user = owner(uuid4(), "owner")
                target = role(user.id)
                run = source_run(user.id)
                target_analysis = analysis(target, run)

                async with database.sessionmaker() as session:
                    session.add_all([user, target, run, target_analysis])
                    await session.commit()

                updates = [
                    ("responsibilities", ["  Own APIs  ", "Own APIs"]),
                    (
                        "qualificationRequirements",
                        {
                            "education": ["Bachelor degree"],
                            "graduationCohorts": [],
                            "majors": ["Computer Science"],
                            "experience": [],
                            "languages": [],
                            "certifications": [],
                            "other": [],
                        },
                    ),
                    (
                        "requiredSkills",
                        {
                            "programmingLanguages": ["Python", "Go"],
                            "frameworksAndLibraries": ["FastAPI"],
                            "platforms": [],
                            "tools": [],
                            "conceptsAndMethods": [],
                            "databasesAndMiddleware": [],
                            "other": [],
                        },
                    ),
                    ("preferredQualifications", ["Payments experience"]),
                    ("softSkills", ["Communication"]),
                    ("businessDomains", ["Payments"]),
                ]
                field_map = {
                    "responsibilities": "responsibilities",
                    "qualificationRequirements": "qualification_requirements",
                    "requiredSkills": "required_skills",
                    "preferredQualifications": "preferred_qualifications",
                    "softSkills": "soft_skills",
                    "businessDomains": "business_domains",
                }

                current_role_version = 1
                current_analysis_version = 1
                page = None
                for field, value in updates:
                    async with database.sessionmaker() as session:
                        before = response_role(page, target.id) if page else None
                        before_values = (
                            None
                            if before is None
                            else before.job_description_analysis.model_dump(
                                mode="json", by_alias=False
                            )
                        )
                        parsed_request = request(
                            role_version=current_role_version,
                            jd_version=1,
                            analysis_version=current_analysis_version,
                            field=field,
                            value=value,
                        )
                        page = await TargetRoleService(
                            session
                        ).update_job_description_analysis_module(
                            user,
                            target.id,
                            parsed_request,
                        )

                    updated = response_role(page, target.id)
                    assert updated.job_description.status == "ready"
                    assert updated.job_description.version == 1
                    assert updated.job_description_analysis is not None
                    assert (
                        updated.job_description_analysis.job_description_version
                        == 1
                    )
                    assert (
                        updated.job_description_analysis.analysis_version
                        == current_analysis_version + 1
                    )
                    after_values = updated.job_description_analysis.model_dump(
                        mode="json", by_alias=False
                    )
                    changed_key = field_map[field]
                    if before_values is not None:
                        for key, before_value in before_values.items():
                            if key not in {
                                "analysis_version",
                                "riva_summary",
                                "parsed_at",
                                changed_key,
                            }:
                                assert after_values[key] == before_value
                    expected_changed = (
                        list(parsed_request.value)
                        if field
                        in {
                            "responsibilities",
                            "preferredQualifications",
                            "softSkills",
                            "businessDomains",
                        }
                        else parsed_request.value.model_dump(
                            mode="json", by_alias=False
                        )
                    )
                    assert after_values[changed_key] == expected_changed
                    current_role_version += 1
                    current_analysis_version += 1

                assert page is not None
                final_role = response_role(page, target.id)
                assert final_role.version == 7
                assert final_role.job_description_analysis is not None
                final_analysis = final_role.job_description_analysis

                async with database.sessionmaker() as session:
                    stored_role = await session.get(TargetRole, target.id)
                    stored_analysis = await session.get(
                        JobDescriptionAnalysis, target.id
                    )
                    assert stored_role is not None
                    assert stored_analysis is not None
                    role_updated_at = stored_role.updated_at
                    analysis_updated_at = stored_analysis.updated_at
                    parsed_at = stored_analysis.parsed_at
                    source_run_id = stored_analysis.source_agent_run_id

                normalized_responsibilities = [
                    f" {item} " for item in final_analysis.responsibilities
                ] + [final_analysis.responsibilities[0]]
                no_op_page = None
                async with database.sessionmaker() as session:
                    no_op_page = await TargetRoleService(
                        session
                    ).update_job_description_analysis_module(
                        user,
                        target.id,
                        request(
                            role_version=final_role.version,
                            jd_version=1,
                            analysis_version=final_analysis.analysis_version,
                            field="responsibilities",
                            value=normalized_responsibilities,
                        ),
                    )
                no_op_role = response_role(no_op_page, target.id)
                assert no_op_role.version == final_role.version
                assert (
                    no_op_role.job_description_analysis.analysis_version
                    == final_analysis.analysis_version
                )
                assert (
                    no_op_role.job_description_analysis.riva_summary
                    == final_analysis.riva_summary
                )

                nested_no_op_value = (
                    final_analysis.qualification_requirements.model_dump(
                        mode="json"
                    )
                )
                async with database.sessionmaker() as session:
                    nested_no_op_page = await TargetRoleService(
                        session
                    ).update_job_description_analysis_module(
                        user,
                        target.id,
                        request(
                            role_version=no_op_role.version,
                            jd_version=1,
                            analysis_version=(
                                no_op_role.job_description_analysis.analysis_version
                            ),
                            field="qualificationRequirements",
                            value=nested_no_op_value,
                        ),
                    )
                assert response_role(nested_no_op_page, target.id).version == 7

                async with database.sessionmaker() as session:
                    stored_role = await session.get(TargetRole, target.id)
                    stored_analysis = await session.get(
                        JobDescriptionAnalysis, target.id
                    )
                    assert stored_role is not None
                    assert stored_analysis is not None
                    assert stored_role.version == 7
                    assert stored_analysis.analysis_version == 7
                    assert stored_role.updated_at == role_updated_at
                    assert stored_analysis.updated_at == analysis_updated_at
                    assert stored_analysis.parsed_at == parsed_at
                    assert stored_analysis.source_agent_run_id == source_run_id
                    assert stored_role.raw_job_description == "Build reliable APIs."
                    assert stored_role.job_description_version == 1
                    assert stored_role.job_description_parsing_run_id is None
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_editing_guards_and_same_version_concurrency() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                user = owner(uuid4(), "owner")
                other = owner(uuid4(), "other")
                target = role(user.id)
                target_run = source_run(user.id)
                target_analysis = analysis(target, target_run)
                missing_jd = role(user.id, saved=False)
                missing_analysis = role(user.id)
                stale_analysis_role = role(user.id, jd_version=2)
                stale_run = source_run(user.id)
                stale_analysis = analysis(stale_analysis_role, stale_run, jd_version=1)
                parsing_role = role(user.id)
                parsing_run = source_run(user.id)
                parsing_role.job_description_parsing_run_id = parsing_run.id
                failed_role = role(user.id)
                failed_agent_run = failed_run(user.id)
                failed_role.job_description_parsing_run_id = failed_agent_run.id
                concurrent_role = role(user.id)
                concurrent_run = source_run(user.id)
                concurrent_analysis = analysis(concurrent_role, concurrent_run)

                async with database.sessionmaker() as session:
                    session.add_all(
                        [
                            user,
                            other,
                            target,
                            target_run,
                            target_analysis,
                            missing_jd,
                            missing_analysis,
                            stale_analysis_role,
                            stale_run,
                            stale_analysis,
                            parsing_role,
                            parsing_run,
                            failed_role,
                            failed_agent_run,
                            concurrent_role,
                            concurrent_run,
                            concurrent_analysis,
                        ]
                    )
                    await session.commit()

                common = lambda role_id: request(
                    role_version=1,
                    jd_version=1,
                    analysis_version=1,
                    field="responsibilities",
                    value=["Own APIs"],
                )
                await expect_error(
                    database,
                    other,
                    target.id,
                    common(target.id),
                    "target_role_not_found",
                    404,
                )
                await expect_error(
                    database,
                    user,
                    uuid4(),
                    common(target.id),
                    "target_role_not_found",
                    404,
                )
                await expect_error(
                    database,
                    user,
                    target.id,
                    request(
                        role_version=2,
                        jd_version=1,
                        analysis_version=1,
                        field="responsibilities",
                        value=["Own APIs"],
                    ),
                    "target_role_version_conflict",
                )
                await expect_error(
                    database,
                    user,
                    missing_jd.id,
                    common(missing_jd.id),
                    "job_description_missing",
                )
                await expect_error(
                    database,
                    user,
                    target.id,
                    request(
                        role_version=1,
                        jd_version=2,
                        analysis_version=1,
                        field="responsibilities",
                        value=["Own APIs"],
                    ),
                    "job_description_version_conflict",
                )
                await expect_error(
                    database,
                    user,
                    missing_analysis.id,
                    common(missing_analysis.id),
                    "job_description_analysis_not_ready",
                )
                await expect_error(
                    database,
                    user,
                    stale_analysis_role.id,
                    request(
                        role_version=1,
                        jd_version=2,
                        analysis_version=1,
                        field="responsibilities",
                        value=["Own APIs"],
                    ),
                    "job_description_analysis_not_ready",
                )
                await expect_error(
                    database,
                    user,
                    target.id,
                    request(
                        role_version=1,
                        jd_version=1,
                        analysis_version=2,
                        field="responsibilities",
                        value=["Own APIs"],
                    ),
                    "job_description_analysis_version_conflict",
                )
                await expect_error(
                    database,
                    user,
                    parsing_role.id,
                    common(parsing_role.id),
                    "job_description_analysis_not_ready",
                )
                await expect_error(
                    database,
                    user,
                    failed_role.id,
                    common(failed_role.id),
                    "job_description_analysis_not_ready",
                )

                async def concurrent_edit(value: str):
                    async with database.sessionmaker() as session:
                        try:
                            return await TargetRoleService(
                                session
                            ).update_job_description_analysis_module(
                                user,
                                concurrent_role.id,
                                request(
                                    role_version=1,
                                    jd_version=1,
                                    analysis_version=1,
                                    field="responsibilities",
                                    value=[value],
                                ),
                            )
                        except Exception as exc:
                            return exc

                results = await asyncio.gather(
                    concurrent_edit("First edit"),
                    concurrent_edit("Second edit"),
                )
                successes = [item for item in results if not isinstance(item, Exception)]
                errors = [item for item in results if isinstance(item, APIError)]
                assert len(successes) == 1
                assert len(errors) == 1
                assert errors[0].error == "target_role_version_conflict"

                successful_page = successes[0]
                successful_role = response_role(successful_page, concurrent_role.id)
                async with database.sessionmaker() as session:
                    stored_role = await session.get(TargetRole, concurrent_role.id)
                    stored_analysis = await session.get(
                        JobDescriptionAnalysis, concurrent_role.id
                    )
                    assert stored_role is not None
                    assert stored_analysis is not None
                    assert stored_role.version == 2
                    assert stored_analysis.analysis_version == 2
                    assert stored_analysis.responsibilities == (
                        successful_role.job_description_analysis.responsibilities
                    )
            finally:
                await database.reset()

    asyncio.run(run_test())
