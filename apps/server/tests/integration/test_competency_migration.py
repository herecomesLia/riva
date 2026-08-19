import asyncio

import pytest
from sqlalchemy import inspect, text

from riva.db import migrations
from riva.db.database import Database
from tests.helpers.integration_database import get_integration_database_url


pytestmark = pytest.mark.integration

REVISION = "202608170006"
PREVIOUS_REVISION = "202608160005"


async def _clear_database(database_url: str) -> None:
    async with Database(database_url) as database:
        await database.drop_tables()
        async with database.engine.begin() as connection:
            await connection.execute(text("DROP TABLE IF EXISTS alembic_version"))


async def _schema_details(database_url: str) -> dict[str, object]:
    async with Database(database_url) as database:
        async with database.engine.connect() as connection:
            def inspect_schema(sync_connection):
                inspector = inspect(sync_connection)
                return {
                    "tables": set(inspector.get_table_names()),
                    "checks": {
                        item["name"]
                        for item in inspector.get_check_constraints(
                            "user_competencies"
                        )
                    }
                    | {
                        item["name"]
                        for item in inspector.get_check_constraints(
                            "competency_evidence"
                        )
                    },
                    "uniques": {
                        item["name"]
                        for table in ("user_competencies", "competency_evidence")
                        for item in inspector.get_unique_constraints(table)
                    },
                    "foreign_keys": {
                        item["name"]
                        for table in ("user_competencies", "competency_evidence")
                        for item in inspector.get_foreign_keys(table)
                    },
                    "indexes": {
                        item["name"]
                        for table in ("user_competencies", "competency_evidence")
                        for item in inspector.get_indexes(table)
                    },
                }

            return await connection.run_sync(inspect_schema)


def test_competency_migration_upgrades_downgrades_and_matches_orm() -> None:
    database_url = get_integration_database_url()

    asyncio.run(_clear_database(database_url))
    try:
        migrations.upgrade(database_url, PREVIOUS_REVISION)
        migrations.upgrade(database_url, REVISION)

        details = asyncio.run(_schema_details(database_url))
        assert {"user_competencies", "competency_evidence"} <= details["tables"]
        assert {
            "ck_user_competencies_competency_key",
            "ck_user_competencies_level",
            "ck_user_competencies_confidence",
            "ck_user_competencies_evidence_count",
            "ck_user_competencies_trend",
            "ck_competency_evidence_source_type",
            "ck_competency_evidence_signal_type",
            "ck_competency_evidence_score",
            "ck_competency_evidence_signal_payload",
        } <= details["checks"]
        assert {
            "uq_user_competencies_user_key",
            "uq_user_competencies_user_id_id",
            "uq_competency_evidence_source_entity_signal",
        } <= details["uniques"]
        assert "fk_competency_evidence_competency_owner" in details[
            "foreign_keys"
        ]
        assert {
            "ix_user_competencies_user_id",
            "ix_competency_evidence_user_id",
            "ix_competency_evidence_competency_id",
        } <= details["indexes"]

        migrations.check(database_url)

        migrations.downgrade(database_url, PREVIOUS_REVISION)
        after_downgrade = asyncio.run(
            _schema_details_without_competency_tables(database_url)
        )
        assert "user_competencies" not in after_downgrade
        assert "competency_evidence" not in after_downgrade

        migrations.upgrade(database_url, REVISION)
        migrations.check(database_url)
    finally:
        asyncio.run(_clear_database(database_url))


async def _schema_details_without_competency_tables(database_url: str) -> set[str]:
    async with Database(database_url) as database:
        async with database.engine.connect() as connection:
            return await connection.run_sync(
                lambda sync_connection: set(inspect(sync_connection).get_table_names())
            )
