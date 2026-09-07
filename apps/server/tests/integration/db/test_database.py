import asyncio
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select

from riva.core.config import DatabaseSettings, HealthCheckSettings
from riva.db import Database
from riva.db.errors import DatabaseUnavailableError
from riva.models import User
from riva.schemas.health import HealthStatus
from tests.support.settings import PLACEHOLDER_DATABASE_URL


def _user(username: str) -> User:
    return User(
        username=username,
        password_hash="test-password-hash",
        display_name=username,
    )


async def test_reset_removes_persisted_data_and_recreates_schema(
    resettable_database: Database,
) -> None:
    database = resettable_database
    async with database.sessionmaker() as session:
        session.add(_user("BeforeReset"))
        await session.commit()
        assert await session.scalar(select(func.count()).select_from(User)) == 1

    await database.reset()

    async with database.sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(User)) == 0
        session.add(_user("AfterReset"))
        await session.commit()
        assert await session.scalar(select(func.count()).select_from(User)) == 1


async def test_health_maps_expected_failures_to_unavailable(
    database: Database,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ping = AsyncMock(side_effect=DatabaseUnavailableError("unavailable"))
    monkeypatch.setattr(database, "ping", ping)
    assert await database.check_health() == HealthStatus.unavailable
    ping.assert_awaited_once_with()


async def test_health_does_not_hide_unexpected_errors(
    database: Database,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        database, "ping", AsyncMock(side_effect=RuntimeError("programming bug"))
    )
    with pytest.raises(RuntimeError, match="programming bug"):
        await database.check_health()


async def test_health_limits_probe_duration(monkeypatch: pytest.MonkeyPatch) -> None:
    async with Database(
        DatabaseSettings(
            url=PLACEHOLDER_DATABASE_URL,
            health=HealthCheckSettings(timeout_seconds=0.01, ttl_seconds=0),
        )
    ) as database:
        monkeypatch.setattr(database, "ping", asyncio.Event().wait)
        async with asyncio.timeout(1):
            assert await database.check_health() == HealthStatus.unavailable
