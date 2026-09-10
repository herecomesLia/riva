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
from riva.models.target_role import (
    HardSkills,
    JobDescription,
    JobDescriptionContent,
    JobRequirements,
    TargetRole,
)
from riva.services.job_descriptions import JobDescriptionService
from riva.services.target_roles import TargetRoleService
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
from riva.tasks.target_roles import extract_jd_text

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
    monkeypatch.setattr(
        "riva.tasks.target_roles.JobDescriptionExtractor.from_text", result
    )
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
        old_role = await reader.get(TargetRole, extraction_role)
        async with extraction_database.sessionmaker() as session:
            role = await session.get(TargetRole, extraction_role)
            previous_updated_at = role.updated_at
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
        await reader.refresh(old_role, attribute_names=["updated_at"])
        assert old_role.updated_at == previous_updated_at
        await reader.commit()

    async with extraction_database.sessionmaker() as session:
        role = await session.get(TargetRole, extraction_role)
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
        role = await session.get(TargetRole, extraction_role)
        assert role.jd.extraction_job_id is None
        assert role.jd.extraction_error_code is None
        assert role.updated_at > previous_updated_at
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
        role = await session.get(TargetRole, extraction_role)
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
        extract_jd_text.func(
            context, target_role_id=str(extraction_role), text="Source JD"
        )
    )
    try:
        async with asyncio.timeout(10):
            await started.wait()
            async with extraction_database.sessionmaker() as session:
                role = await session.get(TargetRole, extraction_role)
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
                    user.active_target_role_id = extraction_role
                    await session.commit()
                    await TargetRoleService(session).delete(user, extraction_role)
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
            assert await session.get(TargetRole, extraction_role) is None
            assert await session.get(JobDescription, extraction_role) is None
            user = await session.get(User, user_id)
            assert user.active_target_role_id is None
        else:
            role = await session.get(TargetRole, extraction_role)
            assert role.jd.responsibilities == ["Original"]
            assert role.jd.extraction_job_id == current_job_id
            assert role.jd.extraction_error_code is None
