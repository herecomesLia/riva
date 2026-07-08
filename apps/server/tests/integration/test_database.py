import asyncio
import os

import pytest

from riva.db.database import Database


pytestmark = pytest.mark.integration


def test_database_can_ping_and_manage_empty_metadata() -> None:
    test_database_url = os.getenv("RIVA_TEST_DATABASE_URL")
    if not test_database_url:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")

    development_database_url = os.getenv("RIVA_DATABASE_URL")
    if development_database_url == test_database_url:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")

    async def run() -> None:
        async with Database(test_database_url) as database:
            await database.ping()
            await database.create_tables()
            await database.drop_tables()

    asyncio.run(run())
