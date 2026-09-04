from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from riva.tasks.schema import reset_task_schema, setup_task_schema


async def _table_exists(
    database_url: str,
    *,
    schema: str,
    table: str,
) -> bool:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
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
    finally:
        await engine.dispose()


async def _drop_task_schema(database_url: str) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text("DROP SCHEMA IF EXISTS procrastinate CASCADE")
            )
    finally:
        await engine.dispose()


async def test_setup_creates_task_tables_only_in_task_schema(
    test_database_url: str,
) -> None:
    await _drop_task_schema(test_database_url)
    await setup_task_schema(test_database_url)

    assert await _table_exists(
        test_database_url,
        schema="procrastinate",
        table="procrastinate_jobs",
    )
    assert not await _table_exists(
        test_database_url,
        schema="public",
        table="procrastinate_jobs",
    )


async def test_setup_is_idempotent(test_database_url: str) -> None:
    await _drop_task_schema(test_database_url)
    await setup_task_schema(test_database_url)
    await setup_task_schema(test_database_url)


async def test_reset_rebuilds_task_schema(test_database_url: str) -> None:
    await setup_task_schema(test_database_url)
    engine = create_async_engine(test_database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text("CREATE TABLE procrastinate.reset_probe (id integer)")
            )
    finally:
        await engine.dispose()

    await reset_task_schema(test_database_url)

    assert not await _table_exists(
        test_database_url,
        schema="procrastinate",
        table="reset_probe",
    )
    assert await _table_exists(
        test_database_url,
        schema="procrastinate",
        table="procrastinate_jobs",
    )
