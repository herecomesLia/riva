from sqlalchemy import text

from riva.db import Database
from riva.tasks import reset_task_schema, setup_task_schema


async def _table_exists(
    database: Database,
    *,
    schema: str,
    table: str,
) -> bool:
    async with database.engine.connect() as connection:
        result = await connection.scalar(
            text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = :schema AND table_name = :table
                )
                """
            ),
            {"schema": schema, "table": table},
        )
        return bool(result)


async def _drop_task_schema(database: Database) -> None:
    async with database.engine.begin() as connection:
        await connection.execute(text("DROP SCHEMA IF EXISTS procrastinate CASCADE"))


async def test_setup_creates_task_tables_only_in_task_schema(
    database: Database,
) -> None:
    await _drop_task_schema(database)
    await setup_task_schema(database)
    await setup_task_schema(database)

    assert await _table_exists(
        database,
        schema="procrastinate",
        table="procrastinate_jobs",
    )
    assert not await _table_exists(
        database,
        schema="public",
        table="procrastinate_jobs",
    )


async def test_reset_rebuilds_task_schema(
    database: Database,
) -> None:
    await setup_task_schema(database)
    async with database.engine.begin() as connection:
        await connection.execute(
            text("CREATE TABLE procrastinate.reset_probe (id integer)")
        )
    await reset_task_schema(database)

    assert not await _table_exists(
        database,
        schema="procrastinate",
        table="reset_probe",
    )
    assert await _table_exists(
        database,
        schema="procrastinate",
        table="procrastinate_jobs",
    )
