import asyncio
from unittest.mock import AsyncMock

import pytest

from riva.core.config import HealthProbeSettings, HealthSettings
from riva.core.health import HealthChecker, HealthProbe
from riva.db.errors import DatabaseUnavailableError
from riva.llm.errors import LLMError, LLMNotConfiguredError


@pytest.mark.parametrize(
    ("dependency", "failure"),
    [
        ("database", DatabaseUnavailableError("unavailable")),
        ("llm", LLMError("provider failure")),
        ("llm", LLMNotConfiguredError("not configured")),
    ],
)
async def test_health_maps_expected_failures_to_false(
    dependency: str, failure: Exception
) -> None:
    client = AsyncMock()
    client.ping.side_effect = failure
    async with HealthChecker(HealthSettings(), client, client) as health:
        assert await getattr(health, dependency).check() is False
        client.ping.assert_awaited_once_with()


async def test_health_does_not_hide_unexpected_errors() -> None:
    probe = HealthProbe(
        AsyncMock(side_effect=RuntimeError("programming bug")),
        HealthSettings().database,
        DatabaseUnavailableError,
    )
    try:
        with pytest.raises(RuntimeError, match="programming bug"):
            await probe.check()
    finally:
        await probe.close()


async def test_health_limits_probe_duration() -> None:
    probe = HealthProbe(
        asyncio.Event().wait,
        HealthProbeSettings(timeout_seconds=0.01, ttl_seconds=0),
        DatabaseUnavailableError,
    )
    try:
        async with asyncio.timeout(1):
            assert await probe.check() is False
    finally:
        await probe.close()


@pytest.mark.parametrize(
    ("database_ttl", "llm_ttl", "database_calls", "llm_calls"),
    [(5, 0, 1, 2), (0, 30, 2, 1)],
)
@pytest.mark.parametrize("available", [True, False])
async def test_health_respects_independent_cache_policies(
    database_ttl: int,
    llm_ttl: int,
    database_calls: int,
    llm_calls: int,
    available: bool,
) -> None:
    database = AsyncMock()
    llm = AsyncMock()
    if not available:
        database.ping.side_effect = DatabaseUnavailableError("unavailable")
        llm.ping.side_effect = LLMError("unavailable")
    settings = HealthSettings(
        database=HealthProbeSettings(timeout_seconds=2, ttl_seconds=database_ttl),
        llm=HealthProbeSettings(timeout_seconds=5, ttl_seconds=llm_ttl),
    )
    async with HealthChecker(settings, database, llm) as health:
        for _ in range(2):
            assert await health.database.check() is available
            assert await health.llm.check() is available
        assert database.ping.await_count == database_calls
        assert llm.ping.await_count == llm_calls
