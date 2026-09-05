from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.schema import CreateSchema, DropSchema

from riva.db import Database
from riva.tasks.core.app import TASK_SCHEMA, app, create_task_connector

JOBS_TABLE = "procrastinate_jobs"


async def setup_task_schema(database: Database) -> None:
    """Create the Procrastinate schema if it has not been initialized."""
    async with database.engine.begin() as connection:
        await connection.execute(CreateSchema(TASK_SCHEMA, if_not_exists=True))
        if await _has_task_schema(connection):
            return
    await _apply_task_schema(database)


async def reset_task_schema(database: Database) -> None:
    """Drop and recreate the Procrastinate schema from the installed version."""
    async with database.engine.begin() as connection:
        await connection.execute(DropSchema(TASK_SCHEMA, cascade=True, if_exists=True))
        await connection.execute(CreateSchema(TASK_SCHEMA))
    await _apply_task_schema(database)


async def _has_task_schema(connection: AsyncConnection) -> bool:
    def has_jobs_table(sync_connection) -> bool:
        return inspect(sync_connection).has_table(
            JOBS_TABLE,
            schema=TASK_SCHEMA,
        )

    return await connection.run_sync(has_jobs_table)


async def _apply_task_schema(database: Database) -> None:
    connector = create_task_connector(
        database.engine.url.render_as_string(hide_password=False)
    )
    with app.replace_connector(connector):
        async with app.open_async():
            await app.schema_manager.apply_schema_async()
