from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import procrastinate
import psycopg
from procrastinate.jobs import Status
from procrastinate.tasks import configure_task
from procrastinate.types import JSONValue
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from riva.tasks.core.app import TASK_SCHEMA, app
from riva.tasks.errors import TaskError
from riva.tasks.registry import Task
from riva.tasks.types import JobStatus
from riva.utils import utc_now


async def defer_job(
    session: AsyncSession,
    task: Task,
    **task_kwargs: JSONValue,
) -> int:
    async with _task_connection(session) as connection:
        return await configure_task(
            name=task.name,
            queue=task.queue,
            job_manager=app.job_manager,
            connection=connection,
        ).defer_async(**task_kwargs)


async def get_job_status(session: AsyncSession, job_id: int) -> JobStatus:
    async with _task_connection(session) as connection:
        # Procrastinate 3.9 does not accept an external connection for status queries.
        # Its built-in query also omits abort_requested, needed to identify aborting jobs.
        rows = await app.connector.execute_query_all_async_with_connection(
            connection,
            query="SELECT status, abort_requested FROM procrastinate_jobs WHERE id = %(job_id)s",
            job_id=job_id,
        )
    if not rows:
        raise TaskError(f"Job {job_id} was not found.")
    status = Status(rows[0]["status"])
    if status is Status.DOING and rows[0]["abort_requested"]:
        return JobStatus.ABORTING
    return {
        Status.TODO: JobStatus.QUEUED,
        Status.DOING: JobStatus.RUNNING,
        Status.SUCCEEDED: JobStatus.SUCCEEDED,
        Status.FAILED: JobStatus.FAILED,
        Status.ABORTING: JobStatus.ABORTING,
        Status.ABORTED: JobStatus.ABORTED,
        Status.CANCELLED: JobStatus.CANCELLED,
    }[status]


async def retry_job(session: AsyncSession, job_id: int) -> None:
    async with _task_connection(session) as connection:
        # Procrastinate 3.9 does not accept an external connection for retry.
        await app.connector.execute_query_all_async_with_connection(
            connection,
            query=procrastinate.sql.queries["retry_job"],
            job_id=job_id,
            retry_at=utc_now(),
            new_priority=None,
            new_queue_name=None,
            new_lock=None,
        )


async def cancel_job(
    session: AsyncSession,
    job_id: int,
    *,
    abort: bool = False,
    delete_job: bool = False,
) -> bool:
    async with _task_connection(session) as connection:
        # Procrastinate 3.9 supports external connections for defer, but not yet cancel.
        rows = await app.connector.execute_query_all_async_with_connection(
            connection,
            query=procrastinate.sql.queries["cancel_job"],
            job_id=job_id,
            abort=abort,
            delete_job=delete_job,
        )
        return rows[0]["id"] is not None


@asynccontextmanager
async def _task_connection(
    session: AsyncSession,
) -> AsyncGenerator[psycopg.AsyncConnection]:
    connection = await session.connection()
    original_search_path = await connection.scalar(text("SHOW search_path"))
    await connection.execute(text(f"SET LOCAL search_path TO {TASK_SCHEMA}, public"))
    raw_connection = await connection.get_raw_connection()
    driver_connection = raw_connection.driver_connection
    if not isinstance(driver_connection, psycopg.AsyncConnection):
        raise TaskError("Transactional task dispatch requires psycopg.")
    try:
        yield driver_connection
    finally:
        await connection.execute(
            text("SELECT set_config('search_path', :search_path, true)"),
            {"search_path": original_search_path},
        )
