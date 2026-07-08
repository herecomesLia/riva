import asyncio

import pytest

from riva.core.errors import DatabaseUnavailableError
from riva.db.database import Database
from tests.helpers.fakes import FakeEngine, FakeSession, FakeSessionMaker


def test_dispose_disposes_engine() -> None:
    database = Database.__new__(Database)
    database.engine = FakeEngine()

    asyncio.run(database.dispose())

    assert database.engine.dispose_count == 1


def test_ping_executes_query() -> None:
    database = Database.__new__(Database)
    session = FakeSession()
    database.sessionmaker = FakeSessionMaker(session)

    asyncio.run(database.ping())

    assert len(session.execute_calls) == 1


def test_ping_wraps_session_errors() -> None:
    database = Database.__new__(Database)
    database.sessionmaker = FakeSessionMaker(
        FakeSession(execute_error=RuntimeError("connection refused"))
    )

    with pytest.raises(DatabaseUnavailableError, match="Database ping failed"):
        asyncio.run(database.ping())


def test_reset_drops_then_creates_tables() -> None:
    class DatabaseDouble(Database):
        def __init__(self) -> None:
            self.calls: list[str] = []

        async def drop_tables(self) -> None:
            self.calls.append("drop_tables")

        async def create_tables(self) -> None:
            self.calls.append("create_tables")

    database = DatabaseDouble()

    asyncio.run(database.reset())

    assert database.calls == ["drop_tables", "create_tables"]
