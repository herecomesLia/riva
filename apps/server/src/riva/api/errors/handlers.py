from collections.abc import Mapping

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError, ResponseValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from riva.api.cookies import delete_session_cookie
from riva.api.errors.mapping import (
    APIRequestError,
    resolve_error_details,
    resolve_http_policy,
)
from riva.db.errors import DatabaseUnavailableError
from riva.errors import AppError
from riva.schemas.errors import ErrorBody, ErrorIssue, ErrorResponse

REQUEST_ID_HEADER = "X-Request-ID"


def _get_request_id(request: Request) -> str:
    return request.headers[REQUEST_ID_HEADER]


def _build_error_response(
    request: Request,
    exc: Exception,
    *,
    issues: list[ErrorIssue] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    details = resolve_error_details(exc)
    policy = resolve_http_policy(exc)
    structlog.contextvars.bind_contextvars(error_code=details.code.value)

    response = JSONResponse(
        status_code=policy.status_code,
        content=ErrorResponse(
            error=ErrorBody(
                code=details.code,
                message=details.message,
                issues=issues,
            ),
        ).model_dump(
            mode="json",
            by_alias=True,
            exclude_none=True,
        ),
        headers=dict(headers) if headers is not None else None,
    )
    if policy.clear_session_cookie:
        delete_session_cookie(response, request.app.state.settings)
    return response


async def mapped_error_handler(
    request: Request,
    exc: AppError | APIRequestError,
) -> JSONResponse:
    return _build_error_response(request, exc)


async def database_unavailable_error_handler(
    request: Request,
    exc: DatabaseUnavailableError,
) -> JSONResponse:
    structlog.get_logger("riva.api").error(
        "api.dependency_unavailable",
        dependency="database",
        request_id=_get_request_id(request),
        method=request.method,
        path=request.url.path,
    )
    return _build_error_response(request, exc)


async def request_validation_error_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return _build_error_response(
        request,
        exc,
        issues=_validation_issues(exc),
    )


async def http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    return _build_error_response(
        request,
        exc,
        headers=exc.headers,
    )


def _log_response_validation_error(
    request: Request,
    exc: ResponseValidationError,
) -> None:
    request_id = _get_request_id(request)
    safe_error = RuntimeError("Response validation failed.")
    structlog.get_logger("riva.api").error(
        "api.response_validation_failed",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        error_count=len(exc.errors()),
        exc_info=(RuntimeError, safe_error, exc.__traceback__),
    )


async def response_validation_error_handler(
    request: Request,
    exc: ResponseValidationError,
) -> JSONResponse:
    _log_response_validation_error(request, exc)
    return _build_error_response(request, exc)


async def unexpected_error_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    request_id = _get_request_id(request)
    # ServerErrorMiddleware sends this response outside CorrelationIdMiddleware.
    return _build_error_response(
        request,
        exc,
        headers={REQUEST_ID_HEADER: request_id},
    )


def _validation_issues(exc: RequestValidationError) -> list[ErrorIssue]:
    return [
        ErrorIssue(
            location=[
                part if isinstance(part, (str, int)) else str(part)
                for part in error.get("loc", ())
            ],
            message=str(error.get("msg", "Value is invalid.")),
        )
        for error in exc.errors()
    ]


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, mapped_error_handler)
    app.add_exception_handler(APIRequestError, mapped_error_handler)
    app.add_exception_handler(RequestValidationError, request_validation_error_handler)
    app.add_exception_handler(
        ResponseValidationError,
        response_validation_error_handler,
    )
    app.add_exception_handler(
        DatabaseUnavailableError,
        database_unavailable_error_handler,
    )
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unexpected_error_handler)
