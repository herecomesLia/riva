from typing import Any

from sqlalchemy import text

from riva.tasks import Task, TaskController, app


async def task_sql(database, statement: str, **params: Any):
    async with database.sessionmaker() as session:
        await session.execute(text("SET LOCAL search_path TO procrastinate, public"))
        rows = (await session.execute(text(statement), params)).mappings().all()
        await session.commit()
        return rows


async def create_job(database) -> int:
    async with database.sessionmaker() as session:
        job_id = await TaskController(session).start(Task.EXTRACT_JD_TEXT)
        await session.commit()
        return job_id


async def fetch_job():
    worker_id = await app.job_manager.register_worker()
    job = await app.job_manager.fetch_job(["ai"], worker_id)
    assert job is not None
    return job


async def read_job(database, job_id):
    return (
        await task_sql(
            database, "SELECT * FROM procrastinate_jobs WHERE id = :id", id=job_id
        )
    )[0]


async def stall_worker(database, job):
    await task_sql(
        database,
        "UPDATE procrastinate_workers SET last_heartbeat = clock_timestamp() - interval '1 hour' WHERE id = :id RETURNING id",
        id=job.worker_id,
    )


async def age_queue(database, job_id):
    await task_sql(
        database,
        "UPDATE procrastinate_events SET at = clock_timestamp() - interval '1 hour' WHERE job_id = :id RETURNING id",
        id=job_id,
    )
    await task_sql(
        database,
        "UPDATE procrastinate_jobs SET scheduled_at = clock_timestamp() - interval '1 hour' WHERE id = :id RETURNING id",
        id=job_id,
    )
