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
from typing import Any
from uuid import UUID, uuid4

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from structlog.typing import EventDict

from riva.utils import seconds_to_ms


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


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        logger = structlog.get_logger("riva.request")

        started_at = perf_counter()
        request_id = self._resolve_request_id(request)

        # Bind request id to structlog context.
        context_tokens = structlog.contextvars.bind_contextvars(request_id=request_id)

        status_code = 500
        error: Exception | None = None

        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response

        except Exception as exc:
            error = exc
            raise

        finally:
            try:
                duration_ms = seconds_to_ms(perf_counter() - started_at)

                log_fields: dict[str, Any] = {
                    "status_code": status_code,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": duration_ms,
                    "client_ip": request.client.host if request.client else None,
                    "user_agent": request.headers.get("user-agent"),
                    "request_id": request_id,
                }

                route = self._resolve_route_template(request)
                if route is not None:
                    log_fields["route"] = route

                if error is not None:
                    log_fields["error_type"] = type(error).__name__
                    log_fields["error_message"] = str(error)

                logger.info("http.request", **log_fields)

            except Exception:
                # Logging must not break the request.
                try:
                    logger.exception(
                        "http.request_log_failed",
                        request_id=request_id,
                        path=request.url.path,
                        method=request.method,
                    )
                except Exception:
                    pass

            finally:
                # Always clear request context.
                try:
                    structlog.contextvars.reset_contextvars(**context_tokens)
                except Exception:
                    pass

    def _resolve_request_id(self, request: Request) -> str:
        request_id = request.headers.get("x-request-id")

        if request_id is not None:
            try:
                UUID(request_id)
            except ValueError:
                pass
            else:
                return request_id

        return str(uuid4())

    def _resolve_route_template(self, request: Request) -> str | None:
        route = request.scope.get("route")

        if route is None:
            return None

        route_name = getattr(route, "name", None)

        if route_name is None:
            return None

        path_params = {name: f"{{{name}}}" for name in request.path_params}

        try:
            # Resolve full route template, including router prefixes.
            return str(request.app.url_path_for(route_name, **path_params))
        except Exception:
            # Do not return an unreliable fallback route.
            return None


def configure_logging(log_level: LogLevel, log_format: LogFormat) -> None:
    level = log_level.to_stdlib_level()
    shared_processors = _shared_processors(log_format)
    structlog_processors = [
        structlog.stdlib.filter_by_level,
        *shared_processors,
    ]
    foreign_processors = [*shared_processors, _normalize_foreign_event]

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
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]


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
