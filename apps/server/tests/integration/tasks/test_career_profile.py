import asyncio
from time import time
from unittest.mock import AsyncMock, MagicMock

import pytest
from procrastinate import JobContext
from procrastinate.jobs import Job
from sqlalchemy import text

from riva.ai.practice import PracticeRoundAgent
from riva.llm import LLMClient
from riva.llm.errors import LLMOutputError, LLMUnavailableError
from riva.models import User
from riva.models.career_profile import CareerProfile, CareerProfileContent
from riva.services.career_profile import CareerProfileService
from riva.services.errors import ConflictError
from riva.services.user import UserService
from riva.tasks import (
    Task,
    TaskController,
    TaskErrorCode,
    TaskResources,
    TaskStatus,
    app,
)
from riva.tasks.career_profile import extract_career_profile_text
from riva.tasks.core.app import create_task_connector
from riva.tasks.registry import configure_task_registry

CONTENT = CareerProfileContent(skills=["Python"])


@pytest.fixture
async def extraction_user(extraction_database, settings):
    # Use registration so the first extraction exercises state initialization too.
    async with extraction_database.sessionmaker() as session:
        result = await UserService(session, settings).register(
            "ResumeUser", "ValidPass123!"
        )
        return result.user.id


@pytest.fixture
def extract(monkeypatch):
    result = AsyncMock(return_value=CONTENT)
    monkeypatch.setattr(
        "riva.tasks.career_profile.CareerProfileExtractor.from_text", result
    )
    return result


@pytest.fixture
def resources(extraction_database):
    return TaskResources(
        extraction_database,
        MagicMock(spec=LLMClient),
        MagicMock(spec=PracticeRoundAgent),
    )


@pytest.fixture
def run_extraction_worker(resources):
    async def run():
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


@pytest.mark.parametrize("has_profile", [False, True], ids=["first-import", "replace"])
@pytest.mark.parametrize(
    ("failure", "code", "resolution"),
    [
        (LLMOutputError("Invalid output"), TaskErrorCode.INVALID_OUTPUT, "retry"),
        (LLMUnavailableError(), TaskErrorCode.LLM_UNAVAILABLE, "retry"),
        (ValueError("Unexpected"), TaskErrorCode.INTERNAL_ERROR, "retry"),
        (LLMOutputError("Invalid output"), TaskErrorCode.INVALID_OUTPUT, "manual"),
    ],
)
async def test_failure_preserves_profile_and_can_be_resolved(
    extraction_database,
    extraction_user,
    extract,
    run_extraction_worker,
    has_profile,
    failure,
    code,
    resolution,
):
    async with extraction_database.sessionmaker() as session:
        user = await session.get(User, extraction_user)
        service = CareerProfileService(session)
        if has_profile:
            profile = await service.create(user, skills=["SQL"])
            previous_version = profile.updated_at
        assert (await service.get_extraction_state(user)).status is TaskStatus.IDLE
        await session.commit()

    async with extraction_database.sessionmaker() as reader:
        old_user = await reader.get(User, extraction_user)
        async with extraction_database.sessionmaker() as session:
            user = await session.get(User, extraction_user)
            await CareerProfileService(session).extract_text(user, text="Source resume")
            job_id = user.career_profile_extraction.job_id
        service = CareerProfileService(reader)
        assert (
            await service.get_extraction_state(old_user)
        ).status is TaskStatus.QUEUED
        await reader.commit()

        extract.side_effect = failure
        await run_extraction_worker()
        state = await service.get_extraction_state(old_user)
        assert (state.status, state.error_code) == (TaskStatus.FAILED, code)
        assert old_user.career_profile_extraction.job_id == job_id
        profile = await reader.get(
            CareerProfile, extraction_user, populate_existing=True
        )
        if has_profile:
            assert profile.skills == ["SQL"]
            assert profile.updated_at == previous_version
        else:
            assert profile is None
        await reader.commit()

    async with extraction_database.sessionmaker() as session:
        user = await session.get(User, extraction_user)
        service = CareerProfileService(session)
        if resolution == "retry":
            await service.retry_extraction(user)
            assert user.career_profile_extraction.job_id == job_id
            assert (
                await service.get_extraction_state(user)
            ).status is TaskStatus.QUEUED
        elif has_profile:
            await service.update(user, skills=["Manual"])
        else:
            await service.create(user, skills=["Manual"])
        assert user.career_profile_extraction.error_code is None
        await session.commit()

    if resolution == "retry":
        extract.side_effect = None
        await run_extraction_worker()
        assert [call.args for call in extract.await_args_list] == [
            ("Source resume",)
        ] * 2

    async with extraction_database.sessionmaker() as session:
        user = await session.get(User, extraction_user)
        assert user.career_profile_extraction.job_id is None
        assert user.career_profile_extraction.error_code is None
        expected = (
            CONTENT
            if resolution == "retry"
            else CareerProfileContent(skills=["Manual"])
        )
        assert (
            CareerProfileContent.model_validate(
                user.career_profile, from_attributes=True
            )
            == expected
        )
        assert (
            await CareerProfileService(session).get_extraction_state(user)
        ).status is TaskStatus.IDLE
        if has_profile:
            assert user.career_profile.updated_at > previous_version
        if resolution == "retry":
            assert (
                await session.scalar(
                    text(
                        "SELECT status FROM procrastinate.procrastinate_jobs WHERE id = :id"
                    ),
                    {"id": job_id},
                )
                == "succeeded"
            )


@pytest.mark.parametrize("action", ["supersede", "abort"])
@pytest.mark.parametrize("fails", [False, True], ids=["late-result", "late-error"])
async def test_late_extraction_cannot_write_after_lifecycle_change(
    extraction_database,
    extraction_user,
    resources,
    extract,
    action,
    fails,
):
    async with extraction_database.sessionmaker() as session:
        user = await session.get(User, extraction_user)
        await CareerProfileService(session).extract_text(user, text="Source resume")
        job_id = user.career_profile_extraction.job_id
        # As in JD tests, deliver the AI result after an abort request is committed.
        await session.execute(text("SET LOCAL search_path TO procrastinate, public"))
        await session.execute(
            text("UPDATE procrastinate_jobs SET status = 'doing' WHERE id = :id"),
            {"id": job_id},
        )
        await session.commit()

    started, release = asyncio.Event(), asyncio.Event()

    async def delayed(_text):
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
            task_name=Task.EXTRACT_CAREER_PROFILE_TEXT.name,
            queue="ai",
            lock=None,
            queueing_lock=None,
        ),
        start_timestamp=time(),
        abort_reason=lambda: None,
        additional_context={"resources": resources},
    )
    running = asyncio.create_task(
        extract_career_profile_text.func(
            context, user_id=str(extraction_user), text="Source resume"
        )
    )
    try:
        async with asyncio.timeout(10):
            await started.wait()
            async with extraction_database.sessionmaker() as session:
                user = await session.get(User, extraction_user)
                service = CareerProfileService(session)
                if action == "supersede":
                    await service.extract_text(user, text="Replacement resume")
                    current_job_id = user.career_profile_extraction.job_id
                    assert current_job_id != job_id
                else:
                    await service.abort_extraction(user)
                    await service.abort_extraction(user)
                    current_job_id = job_id
                    assert (
                        await service.get_extraction_state(user)
                    ).status is TaskStatus.ABORTING
                assert (
                    await TaskController(session).get_status(job_id)
                    is TaskStatus.ABORTING
                )
                assert not running.done()
                await session.commit()
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
        user = await session.get(User, extraction_user)
        assert user.career_profile is None
        assert user.career_profile_extraction.job_id == current_job_id
        assert user.career_profile_extraction.error_code is None


@pytest.mark.parametrize("has_profile", [False, True], ids=["create", "update"])
@pytest.mark.parametrize("status", ["todo", "doing", "aborting"])
async def test_active_extraction_blocks_manual_write(
    extraction_database,
    extraction_user,
    has_profile,
    status,
):
    async with extraction_database.sessionmaker() as session:
        user = await session.get(User, extraction_user)
        service = CareerProfileService(session)
        if has_profile:
            await service.create(user, skills=["SQL"])
        await service.extract_text(user, text="Source resume")
        job_id = user.career_profile_extraction.job_id
        await session.execute(text("SET LOCAL search_path TO procrastinate, public"))
        await session.execute(
            text("UPDATE procrastinate_jobs SET status = :status WHERE id = :id"),
            {"status": "doing" if status == "aborting" else status, "id": job_id},
        )
        if status == "aborting":
            await TaskController(session).abort(job_id)
        await session.commit()
        with pytest.raises(ConflictError):
            if has_profile:
                await service.update(user, skills=["Manual"])
            else:
                await service.create(user, skills=["Manual"])
        # Commit to expose unintended partial writes despite the rejected operation.
        await session.commit()
    async with extraction_database.sessionmaker() as session:
        user = await session.get(User, extraction_user)
        assert user.career_profile_extraction.job_id == job_id
        if has_profile:
            assert user.career_profile.skills == ["SQL"]
        else:
            assert user.career_profile is None
        if status == "todo":
            service = CareerProfileService(session)
            await service.abort_extraction(user)
            assert (await service.get_extraction_state(user)).status is TaskStatus.IDLE
            if has_profile:
                await service.update(user, skills=["Manual"])
            else:
                await service.create(user, skills=["Manual"])
            assert user.career_profile_extraction.job_id is None
