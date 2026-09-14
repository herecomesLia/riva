import asyncio

import pytest
from procrastinate.jobs import Status

from riva.core.config import TaskSettings
from riva.tasks import TaskAttempt, TaskController, TaskSupervisor, app
from tests.support.tasks import create_job, fetch_job, read_job, stall_worker


@pytest.mark.parametrize("terminal", [Status.SUCCEEDED, Status.FAILED, Status.ABORTED])
async def test_old_worker_cannot_finish_recovered_attempt(task_database, terminal):
    db = task_database
    job_id = await create_job(db)
    old = await fetch_job()
    await stall_worker(db, old)
    await TaskSupervisor(db, TaskSettings()).sweep()
    current = await fetch_job()
    await app.job_manager.finish_job(old, terminal, False)
    job = await read_job(db, job_id)
    assert (job["status"], job["attempts"]) == ("doing", current.attempts)


@pytest.mark.parametrize("cancel", [False, True])
async def test_worker_distinguishes_shutdown_from_explicit_cancellation(
    task_database, cancel
):
    db = task_database
    job_id = await create_job(db)
    job = await fetch_job()
    if cancel:
        async with db.sessionmaker() as session:
            await TaskController(session).abort(job_id)
            await session.commit()
    await app.job_manager.finish_job(job, Status.ABORTED, False)
    assert (await read_job(db, job_id))["status"] == ("aborted" if cancel else "failed")
    if not cancel:
        async with db.sessionmaker() as session:
            await TaskController(session).retry(job_id)
            await session.commit()
        assert (await read_job(db, job_id))["status"] == "todo"


async def test_real_worker_acknowledges_atomic_failure_without_overwriting_retry(
    task_database, monkeypatch
):
    db = task_database
    executions = []

    async def fail(context):
        executions.append(context.job)
        async with db.sessionmaker() as session:
            attempt = TaskAttempt(context.job)
            assert await attempt.lock_for_write(session, context.job.id)
            await attempt.finish(session, failed=True)
            await session.commit()
        # Reproduce a retry arriving before the worker's terminal acknowledgement.
        async with db.sessionmaker() as session:
            await TaskController(session).retry(context.job.id)
            await session.commit()
        raise ValueError("business failure")

    task_name = "test.atomic_failure"

    # Register a real task, but move the retry to another queue so wait=False stops.
    async def run(context):
        try:
            await fail(context)
        finally:
            from tests.support.tasks import task_sql

            await task_sql(
                db,
                "UPDATE procrastinate_jobs SET queue_name = 'later' WHERE id = :id RETURNING id",
                id=context.job.id,
            )

    monkeypatch.setattr(app, "tasks", app.tasks.copy())
    task = app.task(name=task_name, queue="atomic", pass_context=True, retry=False)(run)
    job_id = await task.defer_async()
    async with asyncio.timeout(10):
        await app.run_worker_async(
            wait=False, listen_notify=False, queues=["atomic"], concurrency=1
        )
    assert len(executions) == 1
    assert (await read_job(db, job_id))["status"] == "todo"
