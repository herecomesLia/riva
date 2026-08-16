import asyncio

import pytest
from sqlalchemy import text

from riva.db import migrations
from riva.db.database import Database
from tests.helpers.integration_database import get_integration_database_url


pytestmark = pytest.mark.integration

HEAD_REVISION = "202608160004"


async def _clear_database(database_url: str) -> None:
    async with Database(database_url) as database:
        await database.drop_tables()
        async with database.engine.begin() as connection:
            await connection.execute(text("DROP TABLE IF EXISTS alembic_version"))


async def _create_legacy_database(database_url: str) -> None:
    async with Database(database_url) as database:
        await database.create_tables()


async def _current_revision(database_url: str) -> str | None:
    async with Database(database_url) as database:
        async with database.engine.connect() as connection:
            result = await connection.execute(text("SELECT version_num FROM alembic_version"))
            return result.scalar_one_or_none()


async def _table_names(database_url: str) -> set[str]:
    async with Database(database_url) as database:
        async with database.engine.connect() as connection:
            result = await connection.execute(
                text(
                    "SELECT tablename FROM pg_catalog.pg_tables "
                    "WHERE schemaname = 'public'"
                )
            )
            return {row[0] for row in result}


def test_migrations_build_and_rebuild_the_current_schema() -> None:
    database_url = get_integration_database_url()

    asyncio.run(_clear_database(database_url))
    try:
        migrations.upgrade(database_url)
        migrations.current(database_url)
        assert asyncio.run(_current_revision(database_url)) == HEAD_REVISION
        migrations.check(database_url)

        migrations.downgrade(database_url, "base")
        tables_after_downgrade = asyncio.run(_table_names(database_url))
        assert "users" not in tables_after_downgrade
        assert "practice_sessions" not in tables_after_downgrade

        migrations.upgrade(database_url)
        assert asyncio.run(_current_revision(database_url)) == HEAD_REVISION

        asyncio.run(_clear_database(database_url))
        asyncio.run(_create_legacy_database(database_url))
        tables_before_stamp = asyncio.run(_table_names(database_url))

        migrations.stamp(database_url)
        migrations.current(database_url)
        assert asyncio.run(_current_revision(database_url)) == HEAD_REVISION
        tables_after_stamp = asyncio.run(_table_names(database_url))
        assert tables_after_stamp == tables_before_stamp | {"alembic_version"}
        migrations.check(database_url)
    finally:
        asyncio.run(_clear_database(database_url))
