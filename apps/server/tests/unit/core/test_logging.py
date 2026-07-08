import asyncio
import logging
from collections.abc import Awaitable, Callable, Iterator
from typing import Any

import pytest
import structlog
from asgi_correlation_id import correlation_id
from starlette.types import Message, Receive, Scope, Send

import riva.core.logging as logging_module
from riva.core.logging import LogFormat, LogLevel, RequestLoggingMiddleware


class FakeLogger:
    def __init__(self) -> None:
        self.info_events: list[tuple[str, dict[str, Any]]] = []
        self.error_events: list[tuple[str, dict[str, Any]]] = []

    def info(self, event: str, **fields: Any) -> None:
        self.info_events.append((event, fields))

    def error(self, event: str, **fields: Any) -> None:
        self.error_events.append((event, fields))


@pytest.fixture
def isolated_logging_state() -> Iterator[None]:
    logger_names = ["", "uvicorn", "fastapi", "watchfiles", "riva", "uvicorn.access"]
    saved = {}

    for name in logger_names:
        logger = logging.getLogger(name)
        saved[name] = {
            "handlers": logger.handlers[:],
            "level": logger.level,
            "propagate": logger.propagate,
            "disabled": logger.disabled,
        }
        for handler in logger.handlers[:]:
            logger.removeHandler(handler)

    structlog.reset_defaults()

    yield

    for name in logger_names:
        logger = logging.getLogger(name)
        for handler in logger.handlers[:]:
            logger.removeHandler(handler)
            handler.close()

        state = saved[name]
        for handler in state["handlers"]:
            logger.addHandler(handler)
        logger.setLevel(state["level"])
        logger.propagate = state["propagate"]
        logger.disabled = state["disabled"]

    structlog.reset_defaults()


def run_middleware(
    app: Callable[[Scope, Receive, Send], Awaitable[None]],
    path: str = "/health",
) -> list[Message]:
    messages: list[Message] = []
    middleware = RequestLoggingMiddleware(app)
    scope: Scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [(b"user-agent", b"pytest")],
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 80),
    }

    async def receive() -> Message:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: Message) -> None:
        messages.append(message)

    asyncio.run(middleware(scope, receive, send))
    return messages


def test_log_level_maps_to_stdlib_levels() -> None:
    assert LogLevel.CRITICAL.to_stdlib_level() == logging.CRITICAL
    assert LogLevel.ERROR.to_stdlib_level() == logging.ERROR
    assert LogLevel.WARNING.to_stdlib_level() == logging.WARNING
    assert LogLevel.INFO.to_stdlib_level() == logging.INFO
    assert LogLevel.DEBUG.to_stdlib_level() == logging.DEBUG


def test_configure_logging_sets_core_loggers(isolated_logging_state) -> None:
    logging_module.configure_logging(LogLevel.DEBUG, LogFormat.JSON)

    root_logger = logging.getLogger()
    assert root_logger.level == logging.DEBUG
    assert len(root_logger.handlers) == 1

    for logger_name in ["uvicorn", "fastapi", "watchfiles", "riva"]:
        logger = logging.getLogger(logger_name)
        assert logger.level == logging.DEBUG
        assert logger.propagate is True
        assert logger.disabled is False

    access_logger = logging.getLogger("uvicorn.access")
    assert access_logger.disabled is True
    assert access_logger.propagate is False


def test_request_logging_middleware_logs_success(monkeypatch) -> None:
    logger = FakeLogger()
    monkeypatch.setattr(logging_module.structlog, "get_logger", lambda _name: logger)
    token = correlation_id.set("request-id-1")

    async def ok_app(_scope: Scope, _receive: Receive, send: Send) -> None:
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    try:
        messages = run_middleware(ok_app, path="/ok")
    finally:
        correlation_id.reset(token)

    assert messages[0]["status"] == 204
    assert len(logger.info_events) == 1
    event, fields = logger.info_events[0]
    assert event == "http.request"
    assert fields["method"] == "GET"
    assert fields["path"] == "/ok"
    assert fields["status_code"] == 204
    assert fields["request_id"] == "request-id-1"
    assert not logger.error_events


def test_request_logging_middleware_logs_and_reraises_errors(monkeypatch) -> None:
    logger = FakeLogger()
    monkeypatch.setattr(logging_module.structlog, "get_logger", lambda _name: logger)
    token = correlation_id.set("request-id-2")

    async def failing_app(
        _scope: Scope,
        _receive: Receive,
        _send: Send,
    ) -> None:
        raise RuntimeError("boom")

    try:
        with pytest.raises(RuntimeError, match="boom"):
            run_middleware(failing_app, path="/fail")
    finally:
        correlation_id.reset(token)

    assert len(logger.error_events) == 1
    event, fields = logger.error_events[0]
    assert event == "http.request"
    assert fields["method"] == "GET"
    assert fields["path"] == "/fail"
    assert fields["status_code"] == 500
    assert fields["request_id"] == "request-id-2"
    assert fields["error_type"] == "RuntimeError"
    assert fields["error_message"] == "boom"
    assert not logger.info_events
