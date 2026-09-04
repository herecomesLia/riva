import psycopg
from psycopg import sql

from riva.tasks.app import TASK_SCHEMA, _to_psycopg_conninfo, create_task_app


async def setup_task_schema(database_url: str) -> None:
    await _execute_schema_ddl(database_url, create=True)
    await _apply_task_schema_if_needed(database_url)


async def reset_task_schema(database_url: str) -> None:
    await _execute_schema_ddl(database_url, create=False)
    await _apply_task_schema_if_needed(database_url)


async def _apply_task_schema_if_needed(database_url: str) -> None:
    task_app = create_task_app(database_url)
    async with task_app.open_async():
        if not await task_app.check_connection_async():
            await task_app.schema_manager.apply_schema_async()


async def _execute_schema_ddl(database_url: str, *, create: bool) -> None:
    async with await psycopg.AsyncConnection.connect(
        _to_psycopg_conninfo(database_url), autocommit=True
    ) as connection:
        if not create:
            await connection.execute(
                sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                    sql.Identifier(TASK_SCHEMA)
                )
            )
        await connection.execute(
            sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(
                sql.Identifier(TASK_SCHEMA)
            )
        )
