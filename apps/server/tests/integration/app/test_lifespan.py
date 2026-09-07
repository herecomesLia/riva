from unittest.mock import AsyncMock, MagicMock

import pytest
from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from structlog.testing import capture_logs

from riva.core.config import LLMSettings, Settings
from riva.db import Database
from riva.schemas.health import HealthStatus


def _event(
    events: list[dict[str, object]],
    name: str,
    status: str,
) -> dict[str, object]:
    return next(
        event
        for event in events
        if event["event"] == name and event["status"] == status
    )


def _llm_double(*, status: HealthStatus = HealthStatus.unavailable) -> MagicMock:
    llm = MagicMock()
    llm.check_health = AsyncMock(return_value=status)
    return llm


async def test_lifespan_starts_and_stops_with_real_database(app: FastAPI) -> None:
    with capture_logs() as events:
        async with LifespanManager(app):
            pass

    _event(events, "app.start", "in_progress")
    _event(events, "app.stop", "in_progress")
    assert _event(events, "app.start", "succeeded")["duration_ms"] >= 0
    assert _event(events, "app.stop", "succeeded")["duration_ms"] >= 0


async def test_lifespan_starts_with_llm_not_configured(app: FastAPI) -> None:
    llm = _llm_double()
    app.state.llm = llm

    with capture_logs() as events:
        async with LifespanManager(app):
            pass

    assert sum(event["event"] == "llm.not_configured" for event in events) == 1
    llm.check_health.assert_not_awaited()


@pytest.mark.parametrize(
    ("status", "event_name"),
    [
        (HealthStatus.ok, "llm.available"),
        (HealthStatus.degraded, "llm.degraded"),
        (HealthStatus.unavailable, "llm.unavailable"),
    ],
)
async def test_lifespan_reports_initial_llm_readiness(
    app: FastAPI,
    settings: Settings,
    status: HealthStatus,
    event_name: str,
) -> None:
    app.state.settings = settings.model_copy(
        update={
            "llm": LLMSettings(
                base_url="https://llm.test/v1",
                models={"default": {"id": "test-model"}},
                api_key="test-key",
            )
        }
    )
    llm = _llm_double(status=status)
    app.state.llm = llm

    with capture_logs() as events:
        async with LifespanManager(app):
            pass

    readiness = next(event for event in events if event["event"] == event_name)
    assert readiness["models"] == {"default": "test-model", "reasoning": "test-model"}
    llm.check_health.assert_awaited_once_with()


async def test_lifespan_propagates_startup_database_failure(
    app: FastAPI,
    database: Database,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    failure = RuntimeError("startup database failure")

    async def fail_ping() -> None:
        raise failure

    monkeypatch.setattr(database, "ping", fail_ping)

    with capture_logs() as events, pytest.raises(RuntimeError) as raised:
        async with LifespanManager(app):
            pass

    assert raised.value is failure
    failed = _event(events, "app.start", "failed")
    assert failed["reason"] == "database_unavailable"
    assert failed["duration_ms"] >= 0


async def test_lifespan_propagates_shutdown_failure(
    app: FastAPI,
    database: Database,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    failure = RuntimeError("shutdown failure")

    async def fail_dispose() -> None:
        raise failure

    monkeypatch.setattr(database, "dispose", fail_dispose)

    with capture_logs() as events, pytest.raises(RuntimeError) as raised:
        async with LifespanManager(app):
            pass

    assert raised.value is failure
    failed = _event(events, "app.stop", "failed")
    assert failed["reason"] == "shutdown_failed"
    assert failed["duration_ms"] >= 0
