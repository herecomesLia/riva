import asyncio

import pytest
from procrastinate.jobs import Status
from sqlalchemy import text

from riva.core.config import TaskSettings
from riva.models import User
from riva.tasks import (
    Task,
    TaskAttempt,
    TaskController,
    TaskStatus,
    TaskSupervisor,
    app,
)
from riva.tasks.errors import TaskError, TaskStateError
from tests.support.tasks import (
    age_queue,
    create_job,
    fetch_job,
    read_job,
    stall_worker,
    task_sql,
)


@pytest.mark.parametrize("operation", ["start", "retry", "abort"])
@pytest.mark.parametrize("commit", [False, True], ids=["rollback", "commit"])
async def test_controller_joins_business_transaction(task_database, operation, commit):
    db = task_database
    job_id = None
    if operation != "start":
        job_id = await create_job(db)
        if operation == "retry":
            job = await fetch_job()
            await app.job_manager.finish_job(job, Status.FAILED, False)
    async with db.sessionmaker() as session:
        user = User(username="Atomic", password_hash="unused", display_name="Atomic")
        session.add(user)
        await session.flush()
        controller = TaskController(session)
        search_path = await session.scalar(text("SHOW search_path"))
        if operation == "start":
            job_id = await controller.start(Task.EXTRACT_JD_TEXT)
        else:
            await getattr(controller, operation)(job_id)
        assert await session.scalar(text("SHOW search_path")) == search_path
        await (session.commit() if commit else session.rollback())
    rows = await task_sql(db, "SELECT id FROM public.users WHERE username = 'Atomic'")
    jobs = await task_sql(
        db, "SELECT status FROM procrastinate_jobs WHERE id = :id", id=job_id
    )
    assert bool(rows) is commit
    if operation == "start" and not commit:
        assert not jobs
    else:
        assert jobs[0]["status"] == (
            {"start": "todo", "retry": "todo", "abort": "cancelled"}[operation]
            if commit
            else {"retry": "failed", "abort": "todo"}[operation]
        )


@pytest.mark.parametrize("operation", ["retry", "abort"])
async def test_controller_rejects_absent_task_and_corrupt_reference(
    task_database, operation
):
    async with task_database.sessionmaker() as session:
        controller = TaskController(session)
        with pytest.raises(TaskStateError):
            await getattr(controller, operation)(None)
        with pytest.raises(TaskError):
            await controller.get_status(-1)


async def test_controller_cancellation_is_idempotent_and_terminal_is_rejected(
    task_database,
):
    db = task_database
    job_id = await create_job(db)
    job = await fetch_job()
    async with db.sessionmaker() as session:
        controller = TaskController(session)
        with pytest.raises(TaskStateError):
            await controller.retry(job_id)
        await controller.abort(job_id)
        await controller.abort(job_id)
        assert await controller.get_status(job_id) is TaskStatus.ABORTING
        await session.commit()
    events = await task_sql(
        db,
        "SELECT id FROM procrastinate_events WHERE job_id = :id AND type = 'abort_requested'",
        id=job_id,
    )
    assert len(events) == 1
    await app.job_manager.finish_job(job, Status.ABORTED, False)
    async with db.sessionmaker() as session:
        controller = TaskController(session)
        assert await controller.get_status(job_id) is TaskStatus.IDLE
        for operation in (controller.abort, controller.retry):
            with pytest.raises(TaskStateError):
                await operation(job_id)


@pytest.mark.parametrize("failed", [False, True], ids=["success", "failure"])
@pytest.mark.parametrize("commit", [False, True], ids=["rollback", "commit"])
async def test_attempt_business_and_terminal_writes_are_atomic(
    task_database, extraction_role, failed, commit
):
    from riva.models.role import JobDescriptionExtraction
    from riva.tasks import TaskErrorCode

    db = task_database
    job_id = await create_job(db)
    async with db.sessionmaker() as session:
        state = await session.get(JobDescriptionExtraction, extraction_role)
        state.job_id = job_id
        await session.commit()
    attempt = TaskAttempt(await fetch_job())
    async with db.sessionmaker() as session:
        state = await session.get(
            JobDescriptionExtraction, extraction_role, with_for_update=True
        )
        assert await attempt.lock_for_write(session, state.job_id)
        state.error_code = TaskErrorCode.INVALID_OUTPUT if failed else None
        state.job_id = job_id if failed else None
        await attempt.finish(session, failed=failed)
        await (session.commit() if commit else session.rollback())
    async with db.sessionmaker() as session:
        state = await session.get(JobDescriptionExtraction, extraction_role)
        assert state.job_id == (None if commit and not failed else job_id)
        assert state.error_code == (
            TaskErrorCode.INVALID_OUTPUT if commit and failed else None
        )
    expected_status = ("failed" if failed else "succeeded") if commit else "doing"
    assert (await read_job(db, job_id))["status"] == expected_status


@pytest.mark.parametrize("revocation", ["recovery", "abort", "replacement", "terminal"])
async def test_attempt_cannot_write_after_ownership_revoked(task_database, revocation):
    db = task_database
    job_id = await create_job(db)
    job = await fetch_job()
    business_job_id = job_id
    if revocation == "recovery":
        await stall_worker(db, job)
        await TaskSupervisor(db, TaskSettings()).sweep()
        await fetch_job()
    elif revocation == "abort":
        async with db.sessionmaker() as session:
            await TaskController(session).abort(job_id)
            await session.commit()
    elif revocation == "replacement":
        business_job_id = await create_job(db)
    else:
        await app.job_manager.finish_job(job, Status.FAILED, False)
    async with db.sessionmaker() as session:
        assert not await TaskAttempt(job).lock_for_write(session, business_job_id)


async def test_attempt_lock_prevents_recovery_until_transaction_finishes(task_database):
    db = task_database
    job_id = await create_job(db)
    job = await fetch_job()
    await stall_worker(db, job)
    supervisor = TaskSupervisor(db, TaskSettings())
    async with db.sessionmaker() as session:
        assert await TaskAttempt(job).lock_for_write(session, job_id)
        async with asyncio.timeout(5):
            await supervisor.sweep()
        assert (await read_job(db, job_id))["attempts"] == job.attempts
        await session.rollback()
    await supervisor.sweep()
    assert (await read_job(db, job_id))["attempts"] == job.attempts + 1


@pytest.mark.parametrize("recovery", [False, True])
async def test_supervisor_queue_deadline_respects_schedule(task_database, recovery):
    db = task_database
    job_id = await create_job(db)
    supervisor = TaskSupervisor(
        db,
        TaskSettings(
            queue_timeout_seconds=7200 if recovery else 120,
            recovery_timeout_seconds=120 if recovery else 7200,
        ),
    )
    if recovery:
        job = await fetch_job()
        await stall_worker(db, job)
        await supervisor.sweep()
    await age_queue(db, job_id)
    await task_sql(
        db,
        "UPDATE procrastinate_jobs SET scheduled_at = clock_timestamp() + interval '1 hour' WHERE id = :id RETURNING id",
        id=job_id,
    )
    await supervisor.sweep()
    assert (await read_job(db, job_id))["status"] == "todo"
    await age_queue(db, job_id)
    await supervisor.sweep()
    assert (await read_job(db, job_id))["status"] == "failed"


@pytest.mark.parametrize("missing_worker", [False, True])
async def test_supervisor_recovers_once_and_user_retry_resets_budget(
    task_database, missing_worker
):
    db = task_database
    job_id = await create_job(db)
    supervisor = TaskSupervisor(db, TaskSettings(max_recovery_attempts=1))
    async with db.sessionmaker() as session:
        assert await TaskController(session).get_status(job_id) is TaskStatus.QUEUED
    for cycle in range(2):
        job = await fetch_job()
        if missing_worker:
            await app.job_manager.unregister_worker(job.worker_id)
        else:
            await stall_worker(db, job)
        await asyncio.gather(supervisor.sweep(), supervisor.sweep())
        assert (await read_job(db, job_id))["attempts"] == job.attempts + 1
        async with db.sessionmaker() as session:
            assert (
                await TaskController(session).get_status(job_id) is TaskStatus.RUNNING
            )
        recovered = await fetch_job()
        await age_queue(db, job_id)
        await supervisor.sweep()
        assert (await read_job(db, job_id))["status"] == "doing"
        await stall_worker(db, recovered)
        await supervisor.sweep()
        assert (await read_job(db, job_id))["status"] == "failed"
        if cycle == 0:
            async with db.sessionmaker() as session:
                await TaskController(session).retry(job_id)
                assert (
                    await TaskController(session).get_status(job_id)
                    is TaskStatus.QUEUED
                )
                await session.commit()


@pytest.mark.parametrize("cancel", [False, True])
async def test_supervisor_does_not_recover_cancelled_or_disabled_task(
    task_database, cancel
):
    db = task_database
    job_id = await create_job(db)
    job = await fetch_job()
    if cancel:
        async with db.sessionmaker() as session:
            await TaskController(session).abort(job_id)
            await session.commit()
    await stall_worker(db, job)
    await TaskSupervisor(db, TaskSettings(max_recovery_attempts=0)).sweep()
    assert (await read_job(db, job_id))["status"] == ("aborted" if cancel else "failed")


@pytest.mark.parametrize("transition", ["claimed", "finished"])
async def test_supervisor_rechecks_candidate_after_scan(
    task_database, monkeypatch, transition
):
    from riva.tasks.core.runtime import _JobStore

    db = task_database
    job_id = await create_job(db)
    await age_queue(db, job_id)
    scanned = asyncio.Event()
    proceed = asyncio.Event()
    original = _JobStore.list_active_job_ids

    async def paused_scan(store):
        ids = await original(store)
        scanned.set()
        await proceed.wait()
        return ids

    monkeypatch.setattr(_JobStore, "list_active_job_ids", paused_scan)
    async with asyncio.timeout(5), asyncio.TaskGroup() as group:
        group.create_task(TaskSupervisor(db, TaskSettings()).sweep())
        await scanned.wait()
        job = await fetch_job()
        if transition == "finished":
            await app.job_manager.finish_job(job, Status.SUCCEEDED, False)
        proceed.set()
    assert (await read_job(db, job_id))["status"] == (
        "doing" if transition == "claimed" else "succeeded"
    )
