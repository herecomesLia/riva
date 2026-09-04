from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import procrastinate
import psycopg
from procrastinate.tasks import Task
from procrastinate.types import JSONValue
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from riva.tasks.app import TASK_SCHEMA


async def defer_job(
    session: AsyncSession,
    task: Task,
    **task_kwargs: JSONValue,
) -> int:
    async with _task_connection(session) as connection:
        return await task.configure(connection=connection).defer_async(**task_kwargs)


async def cancel_job(
    session: AsyncSession,
    job_id: int,
    *,
    abort: bool = False,
    delete_job: bool = False,
) -> bool:
    async with _task_connection(session) as connection:
        # Procrastinate 3.9 supports external connections for defer, but not yet cancel.
        connector = procrastinate.PsycopgConnector()
        rows = await connector.execute_query_all_async_with_connection(
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
        raise TypeError("Transactional task dispatch requires psycopg.")
    try:
        yield driver_connection
    finally:
        await connection.execute(
            text("SELECT set_config('search_path', :search_path, true)"),
            {"search_path": original_search_path},
        )
