"""Structured logging policy.

Event names:
- Internal: <domain>.[<entity>].<action>, e.g. http.request.
- Foreign: <source>.log.

Fields:
- Put status, reason, errors, timings, IDs, and request context in fields.
- Keep original foreign log text in message.
"""

import logging
import sys
from enum import StrEnum
from time import perf_counter
from types import TracebackType
from typing import Any

import structlog
from asgi_correlation_id import correlation_id
from fastapi import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from structlog.typing import EventDict

from riva.utils import seconds_to_ms

ExcInfo = tuple[type[BaseException], BaseException, TracebackType | None]


class LogLevel(StrEnum):
    CRITICAL = "critical"
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"
    DEBUG = "debug"

    def to_stdlib_level(self) -> int:
        return logging.getLevelNamesMapping()[self.value.upper()]


class LogFormat(StrEnum):
    CONSOLE = "console"
    JSON = "json"


class RequestLoggingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        logger = structlog.get_logger("riva.request")

        request = Request(scope)
        started_at = perf_counter()
        request_id = correlation_id.get()

        previous_context = structlog.contextvars.get_contextvars()

        # Bind request id to structlog context.
        if request_id is not None:
            structlog.contextvars.bind_contextvars(request_id=request_id)

        status_code = 500
        exc_info: ExcInfo | None = None

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code

            if message["type"] == "http.response.start":
                status_code = message["status"]

            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)

        except Exception as exc:
            # Keep the original exception flow.
            exc_info = (type(exc), exc, exc.__traceback__)
            raise

        finally:
            try:
                log_fields: dict[str, Any] = {
                    "status_code": status_code,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": seconds_to_ms(perf_counter() - started_at),
                    "client_ip": request.client.host if request.client else None,
                    "user_agent": request.headers.get("user-agent"),
                }

                if request_id is not None:
                    log_fields["request_id"] = request_id

                route = self._resolve_route_template(request)
                if route is not None:
                    log_fields["route"] = route

                if exc_info is None:
                    logger.info("http.request", **log_fields)
                else:
                    exc_type, exc, _ = exc_info
                    log_fields["error_type"] = exc_type.__name__
                    log_fields["error_message"] = str(exc)
                    log_fields["exc_info"] = exc_info
                    logger.error("http.request", **log_fields)

            finally:
                structlog.contextvars.clear_contextvars()
                if previous_context:
                    structlog.contextvars.bind_contextvars(**previous_context)

    def _resolve_route_template(self, request: Request) -> str | None:
        route = request.scope.get("route")

        if route is None:
            return None

        route_name = getattr(route, "name", None)
        if route_name is None:
            return None

        path_params = {name: f"{{{name}}}" for name in request.path_params}

        try:
            # Resolve full route template with router prefixes.
            return str(request.app.url_path_for(route_name, **path_params))
        except Exception:  # noqa: BLE001 - logging metadata must not affect request handling
            # Avoid unreliable fallback values.
            return None


def configure_logging(log_level: LogLevel, log_format: LogFormat) -> None:
    level = log_level.to_stdlib_level()
    shared_processors = _shared_processors(log_format)
    exception_processors = _exception_processors(log_format)

    structlog_processors = [
        structlog.stdlib.filter_by_level,
        *shared_processors,
        *exception_processors,
    ]

    foreign_processors = [
        *shared_processors,
        *exception_processors,
        _normalize_foreign_event,
    ]

    formatter_processors = _formatter_processors(log_format)

    handler = logging.StreamHandler(sys.stderr)
    handler.setLevel(level)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            processors=formatter_processors,
            foreign_pre_chain=foreign_processors,
        )
    )

    root_logger = logging.getLogger()
    _clear_handlers(root_logger)
    root_logger.setLevel(level)
    root_logger.addHandler(handler)

    _setup_logger("uvicorn", level)
    _setup_logger("fastapi", level)
    _setup_logger("watchfiles", level)
    _setup_logger("riva", level)

    _disable_logger("uvicorn.access")

    structlog.configure(
        processors=[
            *structlog_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def _shared_processors(log_format: LogFormat) -> list[Any]:
    if log_format == LogFormat.JSON:
        timestamp = structlog.processors.TimeStamper(fmt="iso", utc=True)
    else:
        timestamp = structlog.processors.TimeStamper(
            fmt="%Y-%m-%d %H:%M:%S.%f", utc=False
        )

    return [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        timestamp,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]


def _exception_processors(log_format: LogFormat) -> list[Any]:
    if log_format == LogFormat.JSON:
        return [structlog.processors.dict_tracebacks]

    return []


def _formatter_processors(log_format: LogFormat) -> list[Any]:
    if log_format == LogFormat.JSON:
        return [
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(),
        ]

    renderer = structlog.dev.ConsoleRenderer(
        colors=True, pad_level=False, pad_event_to=16
    )
    renderer.columns = [
        *renderer.columns,
        structlog.dev.Column(
            "foreign_message",
            structlog.dev.KeyValueColumnFormatter(
                key_style=None,
                value_style="",
                reset_style="",
                value_repr=str,
            ),
        ),
    ]

    def prepare_foreign_message(
        _logger: logging.Logger | None, _method_name: str, event_dict: EventDict
    ) -> EventDict:
        if not event_dict.get("_from_structlog", False):
            message = event_dict.pop("message", "")
            if message:
                event_dict["foreign_message"] = message

        return event_dict

    return [
        prepare_foreign_message,
        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
        renderer,
    ]


def _normalize_foreign_event(
    logger: logging.Logger | None, _method_name: str, event_dict: EventDict
) -> EventDict:
    event_dict["message"] = event_dict.pop("event", "")
    record = event_dict.get("_record")
    logger_name = str(
        event_dict.get("logger")
        or getattr(record, "name", None)
        or getattr(logger, "name", "")
    )

    if logger_name == "uvicorn" or logger_name.startswith("uvicorn."):
        event_dict["event"] = "uvicorn.log"
    elif logger_name == "fastapi" or logger_name.startswith("fastapi."):
        event_dict["event"] = "fastapi.log"
    elif logger_name == "watchfiles" or logger_name.startswith("watchfiles."):
        event_dict["event"] = "watchfiles.log"
    else:
        event_dict["event"] = "external.log"

    return event_dict


def _setup_logger(logger_name: str, level: int) -> None:
    logger = logging.getLogger(logger_name)
    _clear_handlers(logger)
    logger.disabled = False
    logger.propagate = True
    logger.setLevel(level)


def _disable_logger(logger_name: str) -> None:
    logger = logging.getLogger(logger_name)
    _clear_handlers(logger)
    logger.propagate = False
    logger.disabled = True


def _clear_handlers(logger: logging.Logger) -> None:
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
        handler.close()
