import pytest
from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from structlog.testing import capture_logs

from riva.db import Database


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


async def test_lifespan_starts_and_stops_with_real_database(app: FastAPI) -> None:
    with capture_logs() as events:
        async with LifespanManager(app):
            pass

    _event(events, "app.start", "in_progress")
    _event(events, "app.stop", "in_progress")
    assert _event(events, "app.start", "succeeded")["duration_ms"] >= 0
    assert _event(events, "app.stop", "succeeded")["duration_ms"] >= 0


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
