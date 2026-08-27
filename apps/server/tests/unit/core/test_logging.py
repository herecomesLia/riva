import logging
from typing import Any

import pytest
import structlog
from asgi_correlation_id import correlation_id
from fastapi import FastAPI, Response
from httpx import ASGITransport, AsyncClient
from structlog.testing import capture_logs

from riva.core.logging import (
    LogLevel,
    RequestLoggingMiddleware,
    _normalize_foreign_event,
)


@pytest.mark.parametrize(
    ("log_level", "stdlib_level"),
    [
        (LogLevel.CRITICAL, logging.CRITICAL),
        (LogLevel.ERROR, logging.ERROR),
        (LogLevel.WARNING, logging.WARNING),
        (LogLevel.INFO, logging.INFO),
        (LogLevel.DEBUG, logging.DEBUG),
    ],
)
def test_log_level_converts_to_stdlib_level(
    log_level: LogLevel,
    stdlib_level: int,
) -> None:
    assert log_level.to_stdlib_level() == stdlib_level


@pytest.mark.parametrize(
    ("logger_name", "expected_event"),
    [
        ("uvicorn", "uvicorn.log"),
        ("uvicorn.error", "uvicorn.log"),
        ("fastapi", "fastapi.log"),
        ("fastapi.routing", "fastapi.log"),
        ("watchfiles", "watchfiles.log"),
        ("watchfiles.main", "watchfiles.log"),
        ("sqlalchemy.engine", "external.log"),
    ],
)
def test_foreign_logger_event_is_normalized(
    logger_name: str,
    expected_event: str,
) -> None:
    event: dict[str, Any] = {
        "event": "Started server",
        "logger": logger_name,
    }

    normalized = _normalize_foreign_event(
        logging.getLogger(logger_name),
        "info",
        event,
    )

    assert normalized["event"] == expected_event
    assert normalized["message"] == "Started server"


async def test_request_logging_records_route_and_cleans_context() -> None:
    app = FastAPI()

    @app.get("/items/{item_id}", name="get_item", status_code=204)
    async def get_item(item_id: str) -> Response:
        structlog.contextvars.bind_contextvars(
            user_id="user-1",
            error_code="auth.invalid_credentials",
        )
        return Response(status_code=204)

    request_id = "00000000-0000-4000-8000-000000000001"
    correlation_token = correlation_id.set(request_id)
    structlog.contextvars.clear_contextvars()

    try:
        with capture_logs(
            processors=[structlog.contextvars.merge_contextvars]
        ) as events:
            transport = ASGITransport(app=RequestLoggingMiddleware(app))
            async with AsyncClient(
                transport=transport,
                base_url="https://testserver",
                headers={"User-Agent": "test-client"},
            ) as client:
                response = await client.get("/items/123")

        assert structlog.contextvars.get_contextvars() == {}
    finally:
        correlation_id.reset(correlation_token)
        structlog.contextvars.clear_contextvars()

    assert response.status_code == 204
    event = next(event for event in events if event["event"] == "http.request")
    assert event["status_code"] == 204
    assert event["method"] == "GET"
    assert event["path"] == "/items/123"
    assert event["route"] == "/items/{item_id}"
    assert event["duration_ms"] >= 0
    assert event["client_ip"] == "127.0.0.1"
    assert event["user_agent"] == "test-client"
    assert event["request_id"] == request_id
    assert event["user_id"] == "user-1"
    assert event["error_code"] == "auth.invalid_credentials"


async def test_request_logging_records_and_propagates_exception() -> None:
    failure = RuntimeError("boom")

    async def failing_app(
        scope: dict[str, Any],
        receive: Any,
        send: Any,
    ) -> None:
        raise failure

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/failure",
        "raw_path": b"/failure",
        "query_string": b"",
        "headers": [(b"user-agent", b"test-client")],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 443),
    }

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        raise AssertionError(f"Unexpected response message: {message}")

    middleware = RequestLoggingMiddleware(failing_app)

    with capture_logs() as events, pytest.raises(RuntimeError) as raised:
        await middleware(scope, receive, send)

    assert raised.value is failure
    event = next(event for event in events if event["event"] == "http.request")
    assert event["status_code"] == 500
    assert event["method"] == "GET"
    assert event["path"] == "/failure"
    assert event["duration_ms"] >= 0
    assert event["error_type"] == "RuntimeError"
    assert event["error_message"] == "boom"
    assert event["exc_info"]
