import asyncio
from collections.abc import Awaitable, Callable
from time import time
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from procrastinate import JobContext
from procrastinate.jobs import Job
from sqlalchemy import text

from riva.db import Database
from riva.llm import LLMClient
from riva.llm.errors import LLMOutputError, LLMUnavailableError
from riva.models import User
from riva.models.career_profile import CareerProfile, CareerProfileContent
from riva.models.role import (
    HardSkills,
    JobDescription,
    JobDescriptionContent,
    JobRequirements,
    Role,
    RoleMatching,
    RoleMatchingResult,
)
from riva.services.job_descriptions import JobDescriptionService
from riva.services.roles import RoleService
from riva.tasks import (
    JobStatus,
    Task,
    TaskErrorCode,
    TaskResources,
    TaskStatus,
    app,
    get_job_status,
)
from riva.tasks.core.app import create_task_connector
from riva.tasks.registry import configure_task_registry
from riva.tasks.roles import analyze_role_matching, extract_jd_text

CONTENT = JobDescriptionContent(
    responsibilities=["Build APIs"],
    requirements=JobRequirements(experience=["Three years"]),
    hard_skills=HardSkills(programming_languages=["Python"]),
    soft_skills=["Communication"],
    preferred_qualifications=["Cloud experience"],
    business_domains=["SaaS"],
)


@pytest.fixture
def extract(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    result = AsyncMock(return_value=CONTENT)
    monkeypatch.setattr("riva.tasks.roles.JobDescriptionExtractor.from_text", result)
    return result


@pytest.fixture
def resources(extraction_database: Database) -> TaskResources:
    return TaskResources(extraction_database, MagicMock(spec=LLMClient))


@pytest.fixture
def run_extraction_worker(resources: TaskResources) -> Callable[[], Awaitable[None]]:
    async def run() -> None:
        configure_task_registry(app)
        url = resources.database.engine.url.render_as_string(hide_password=False)
        with app.replace_connector(create_task_connector(url)):
            async with app.open_async():
                await asyncio.wait_for(
                    app.run_worker_async(
                        wait=False,
                        listen_notify=False,
                        concurrency=1,
                        queues=["ai"],
                        additional_context={"resources": resources},
                    ),
                    timeout=10,
                )

    return run


@pytest.mark.parametrize(
    ("failure", "code", "resolution"),
    [
        (LLMOutputError("Invalid output"), TaskErrorCode.INVALID_OUTPUT, "retry"),
        (LLMUnavailableError(), TaskErrorCode.LLM_UNAVAILABLE, "retry"),
        (ValueError("Unexpected"), TaskErrorCode.INTERNAL_ERROR, "retry"),
        (LLMOutputError("Invalid output"), TaskErrorCode.INVALID_OUTPUT, "manual"),
    ],
)
async def test_failure_preserves_content_and_can_be_resolved(
    extraction_database: Database,
    extraction_role: UUID,
    extract: AsyncMock,
    run_extraction_worker: Callable[[], Awaitable[None]],
    failure: Exception,
    code: TaskErrorCode,
    resolution: str,
) -> None:
    async with extraction_database.sessionmaker() as reader:
        # Deliberately keep an old ORM instance across other committed transactions.
        old_role = await reader.get(Role, extraction_role)
        async with extraction_database.sessionmaker() as session:
            role = await session.get(Role, extraction_role)
            previous_updated_at = role.updated_at
            previous_jd_updated_at = role.jd.updated_at
            await JobDescriptionService(session).extract_text(role, text="Source JD")
            job_id = role.jd.extraction_job_id
        state = await JobDescriptionService(reader).get_extraction_state(old_role)
        assert state.status is TaskStatus.QUEUED
        await reader.commit()

        extract.side_effect = failure
        await run_extraction_worker()
        state = await JobDescriptionService(reader).get_extraction_state(old_role)
        assert state.status is TaskStatus.FAILED
        assert state.error_code is code
        assert old_role.jd.responsibilities == ["Original"]
        assert old_role.jd.extraction_job_id == job_id
        assert old_role.jd.updated_at == previous_jd_updated_at
        await reader.refresh(old_role, attribute_names=["updated_at"])
        assert old_role.updated_at == previous_updated_at
        await reader.commit()

    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, extraction_role)
        service = JobDescriptionService(session)
        if resolution == "manual":
            await service.update(role, responsibilities=["Manual"])
        else:
            await service.retry_extraction(role)
            assert role.jd.extraction_job_id == job_id
        assert role.jd.extraction_error_code is None

    if resolution == "retry":
        extract.side_effect = None
        await run_extraction_worker()
        assert extract.await_args_list[0].args == ("Source JD",)
        assert extract.await_args_list[1].args == ("Source JD",)

    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, extraction_role)
        assert role.jd.extraction_job_id is None
        assert role.jd.extraction_error_code is None
        assert role.updated_at > previous_updated_at
        assert role.jd.updated_at > previous_jd_updated_at
        if resolution == "manual":
            assert role.jd.responsibilities == ["Manual"]
            assert role.jd.soft_skills == ["Teamwork"]
        else:
            assert (
                JobDescriptionContent.model_validate(role.jd, from_attributes=True)
                == CONTENT
            )
            assert await get_job_status(session, job_id) is JobStatus.SUCCEEDED


@pytest.mark.parametrize("action", ["supersede", "abort", "delete"])
@pytest.mark.parametrize("fails", [False, True], ids=["late-result", "late-error"])
async def test_late_extraction_cannot_write_after_lifecycle_change(
    extraction_database: Database,
    extraction_role: UUID,
    resources: TaskResources,
    extract: AsyncMock,
    action: str,
    fails: bool,
) -> None:
    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, extraction_role)
        user_id = role.user_id
        await JobDescriptionService(session).extract_text(role, text="Source JD")
        job_id = role.jd.extraction_job_id
        # Execute the task directly so a late LLM result can arrive after abort_requested.
        await session.execute(text("SET LOCAL search_path TO procrastinate, public"))
        await session.execute(
            text("UPDATE procrastinate_jobs SET status = 'doing' WHERE id = :id"),
            {"id": job_id},
        )
        await session.commit()

    started, release = asyncio.Event(), asyncio.Event()

    async def delayed(_text: str) -> JobDescriptionContent:
        started.set()
        await release.wait()
        if fails:
            raise LLMOutputError("Late failure")
        return CONTENT

    extract.side_effect = delayed
    context = JobContext(
        app=app,
        job=Job(
            id=job_id,
            task_name=Task.EXTRACT_JD_TEXT.name,
            queue="ai",
            lock=None,
            queueing_lock=None,
        ),
        start_timestamp=time(),
        abort_reason=lambda: None,
        additional_context={"resources": resources},
    )
    running = asyncio.create_task(
        extract_jd_text.func(context, role_id=str(extraction_role), text="Source JD")
    )
    try:
        async with asyncio.timeout(10):
            await started.wait()
            async with extraction_database.sessionmaker() as session:
                role = await session.get(Role, extraction_role)
                service = JobDescriptionService(session)
                if action == "supersede":
                    await service.extract_text(role, text="Replacement JD")
                    current_job_id = role.jd.extraction_job_id
                    assert current_job_id != job_id
                elif action == "abort":
                    await service.abort_extraction(role)
                    current_job_id = job_id
                else:
                    user = await session.get(User, user_id)
                    user.active_role_id = extraction_role
                    await session.commit()
                    await RoleService(session).delete(user, extraction_role)
                assert await get_job_status(session, job_id) is JobStatus.ABORTING
                # The lifecycle command must finish while the LLM is still waiting.
                assert not running.done()
            release.set()
            if fails:
                with pytest.raises(LLMOutputError, match="Late failure"):
                    await running
            else:
                await running
    finally:
        running.cancel()
        await asyncio.gather(running, return_exceptions=True)

    async with extraction_database.sessionmaker() as session:
        if action == "delete":
            assert await session.get(Role, extraction_role) is None
            assert await session.get(JobDescription, extraction_role) is None
            user = await session.get(User, user_id)
            assert user.active_role_id is None
        else:
            role = await session.get(Role, extraction_role)
            assert role.jd.responsibilities == ["Original"]
            assert role.jd.extraction_job_id == current_job_id
            assert role.jd.extraction_error_code is None


MATCHING_RESULT = RoleMatchingResult(
    score=75,
    core_requirements="Backend development",
    resume_strengths=["API experience"],
    resume_gaps=["Limited deployment evidence"],
    resume_optimization_suggestions=["Describe actual API contributions"],
    interview_preparation_suggestions=["Review database indexing"],
)


@pytest.fixture
async def matching_role(extraction_database, extraction_role):
    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, extraction_role)
        session.add(CareerProfile(user_id=role.user_id, skills=["Python"]))
        role.matching.result = MATCHING_RESULT
        role.matching.generated_at = role.created_at
        role.matching.profile_updated_at = role.created_at
        role.matching.jd_updated_at = role.jd.updated_at
        await session.commit()
    return extraction_role


@pytest.fixture
def analyze(monkeypatch):
    mock = AsyncMock(return_value=MATCHING_RESULT.model_copy(update={"score": 90}))
    monkeypatch.setattr("riva.tasks.roles.RoleMatchingAnalyzer.analyze", mock)
    return mock


def _saved_matching(matching):
    return (
        matching.result,
        matching.profile_updated_at,
        matching.jd_updated_at,
        matching.generated_at,
    )


@pytest.mark.parametrize(
    ("failure", "code"),
    [
        (LLMOutputError("bad output"), TaskErrorCode.INVALID_OUTPUT),
        (LLMUnavailableError(), TaskErrorCode.LLM_UNAVAILABLE),
        (ValueError("unexpected"), TaskErrorCode.INTERNAL_ERROR),
    ],
)
async def test_matching_failure_preserves_result_and_manual_restart_succeeds(
    extraction_database,
    matching_role,
    analyze,
    run_extraction_worker,
    failure,
    code,
):
    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, matching_role)
        user = await session.get(User, role.user_id)
        profile = await session.get(CareerProfile, user.id)
        expected_versions = (profile.updated_at, role.jd.updated_at)
        previous = _saved_matching(role.matching)
        await RoleService(session).start_matching_analysis(user, role.id)
        job_id = role.matching.job_id
        assert _saved_matching(role.matching) == previous
    analyze.side_effect = failure
    await run_extraction_worker()
    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, matching_role)
        user = await session.get(User, role.user_id)
        service = RoleService(session)
        state = await service.get_matching_analysis_state(user, role.id)
        assert (state.status, state.error_code) == (TaskStatus.FAILED, code)
        assert _saved_matching(role.matching) == previous
        await service.start_matching_analysis(user, role.id)
        assert role.matching.job_id != job_id
        assert role.matching.error_code is None
        assert _saved_matching(role.matching) == previous
    analyze.side_effect = None
    await run_extraction_worker()
    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, matching_role)
        assert role.matching.result == analyze.return_value
        assert (
            role.matching.profile_updated_at,
            role.matching.jd_updated_at,
        ) == expected_versions
        assert role.matching.generated_at > previous[3]
        assert role.matching.job_id is None
        assert role.matching.error_code is None
    profile_input, jd_input = analyze.await_args.args
    assert isinstance(profile_input, CareerProfileContent)
    assert profile_input.skills == ["Python"]
    assert isinstance(jd_input, JobDescriptionContent)
    assert jd_input.responsibilities == ["Original"]


@pytest.mark.parametrize("action", ["supersede", "abort", "delete", "edit-inputs"])
@pytest.mark.parametrize("fails", [False, True], ids=["late-result", "late-error"])
async def test_matching_late_completion_respects_ownership_and_input_snapshots(
    extraction_database,
    matching_role,
    resources,
    analyze,
    action,
    fails,
):
    async with extraction_database.sessionmaker() as session:
        role = await session.get(Role, matching_role)
        user = await session.get(User, role.user_id)
        user_id = user.id
        profile = await session.get(CareerProfile, user_id)
        versions = (profile.updated_at, role.jd.updated_at)
        previous = _saved_matching(role.matching)
        await RoleService(session).start_matching_analysis(user, role.id)
        job_id = role.matching.job_id
        await session.execute(text("SET LOCAL search_path TO procrastinate, public"))
        await session.execute(
            text("UPDATE procrastinate_jobs SET status = 'doing' WHERE id = :id"),
            {"id": job_id},
        )
        await session.commit()
    started, release = asyncio.Event(), asyncio.Event()

    async def delayed(profile, jd):
        started.set()
        await release.wait()
        assert profile.skills == ["Python"]
        assert jd.responsibilities == ["Original"]
        if fails:
            raise LLMOutputError("Late failure")
        return analyze.return_value

    analyze.side_effect = delayed
    context = JobContext(
        app=app,
        job=Job(
            id=job_id,
            task_name=Task.ANALYZE_ROLE_MATCHING.name,
            queue="ai",
            lock=None,
            queueing_lock=None,
        ),
        start_timestamp=time(),
        abort_reason=lambda: None,
        additional_context={"resources": resources},
    )
    running = asyncio.create_task(
        analyze_role_matching.func(context, role_id=str(matching_role))
    )
    try:
        async with asyncio.timeout(10):
            await started.wait()
            async with extraction_database.sessionmaker() as session:
                role = await session.get(Role, matching_role)
                user = await session.get(User, user_id)
                service = RoleService(session)
                if action == "supersede":
                    await service.start_matching_analysis(user, role.id)
                    current_job_id = role.matching.job_id
                    assert current_job_id != job_id
                elif action == "abort":
                    await service.abort_matching_analysis(user, role.id)
                    await service.abort_matching_analysis(user, role.id)
                    assert (
                        await service.get_matching_analysis_state(user, role.id)
                    ).status is TaskStatus.ABORTING
                    await session.commit()
                elif action == "delete":
                    await service.delete(user, role.id)
                else:
                    from riva.services.career_profiles import CareerProfileService

                    await CareerProfileService(session).update(user, skills=["Go"])
                    await JobDescriptionService(session).update(
                        role, responsibilities=["New JD"]
                    )
                    assert role.matching.job_id == job_id
                    assert _saved_matching(role.matching) == previous
                assert not running.done()
            release.set()
            if fails:
                with pytest.raises(LLMOutputError, match="Late failure"):
                    await running
            else:
                await running
    finally:
        running.cancel()
        await asyncio.gather(running, return_exceptions=True)
    async with extraction_database.sessionmaker() as session:
        matching = await session.get(RoleMatching, matching_role)
        if action == "delete":
            assert matching is None
            assert await session.get(JobDescription, matching_role) is None
            assert await session.get(Role, matching_role) is None
        elif action == "edit-inputs" and not fails:
            assert matching.result == analyze.return_value
            assert (matching.profile_updated_at, matching.jd_updated_at) == versions
            assert matching.job_id is None
        else:
            assert _saved_matching(matching) == previous
            assert matching.error_code == (
                TaskErrorCode.INVALID_OUTPUT if action == "edit-inputs" else None
            )
            assert matching.job_id == (
                current_job_id if action == "supersede" else job_id
            )
