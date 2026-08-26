from collections.abc import Mapping
from dataclasses import dataclass

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError, ResponseValidationError
from fastapi.responses import JSONResponse
from starlette import status
from starlette.exceptions import HTTPException as StarletteHTTPException

from riva.api.cookies import delete_session_cookie
from riva.db.errors import DatabaseUnavailableError
from riva.schemas.errors import ErrorBody, ErrorIssue, ErrorResponse
from riva.services.errors import (
    AccountDisabledError,
    ApplicationError,
    InvalidCredentialsError,
    InvalidSessionError,
    SessionExpiredError,
    UsernameTakenError,
)


class APIRequestError(Exception):
    pass


class AuthRequiredError(APIRequestError):
    pass


class CsrfFailedError(APIRequestError):
    pass


@dataclass(frozen=True)
class ErrorSpec:
    status_code: int
    code: str
    message: str
    clear_session_cookie: bool = False


def _resolve_error(exc: Exception) -> ErrorSpec:
    match exc:
        case UsernameTakenError():
            return ErrorSpec(
                status_code=status.HTTP_409_CONFLICT,
                code="auth.username_taken",
                message="Username is already registered.",
            )

        case InvalidCredentialsError():
            return ErrorSpec(
                status_code=status.HTTP_401_UNAUTHORIZED,
                code="auth.invalid_credentials",
                message="Invalid username or password.",
            )

        case InvalidSessionError():
            return ErrorSpec(
                status_code=status.HTTP_401_UNAUTHORIZED,
                code="auth.invalid_session",
                message="Session is invalid.",
                clear_session_cookie=True,
            )

        case SessionExpiredError():
            return ErrorSpec(
                status_code=status.HTTP_401_UNAUTHORIZED,
                code="auth.session_expired",
                message="Session has expired.",
                clear_session_cookie=True,
            )

        case AccountDisabledError():
            return ErrorSpec(
                status_code=status.HTTP_403_FORBIDDEN,
                code="auth.account_disabled",
                message="Account is disabled.",
                clear_session_cookie=True,
            )

        case AuthRequiredError():
            return ErrorSpec(
                status_code=status.HTTP_401_UNAUTHORIZED,
                code="auth.not_authenticated",
                message="Authentication is required.",
            )

        case CsrfFailedError():
            return ErrorSpec(
                status_code=status.HTTP_403_FORBIDDEN,
                code="request.csrf_failed",
                message="CSRF validation failed.",
            )

        case DatabaseUnavailableError():
            return ErrorSpec(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                code="dependency.database_unavailable",
                message="Database is temporarily unavailable.",
            )

        case RequestValidationError():
            return ErrorSpec(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                code="request.validation_failed",
                message="Request validation failed.",
            )

        case StarletteHTTPException(status_code=status.HTTP_404_NOT_FOUND):
            return ErrorSpec(
                status_code=status.HTTP_404_NOT_FOUND,
                code="request.not_found",
                message="The requested endpoint was not found.",
            )

        case StarletteHTTPException(status_code=status.HTTP_405_METHOD_NOT_ALLOWED):
            return ErrorSpec(
                status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
                code="request.method_not_allowed",
                message="The HTTP method is not allowed for this endpoint.",
            )

        case StarletteHTTPException(status_code=status_code):
            return ErrorSpec(
                status_code=status_code,
                code="request.http_error",
                message="Request failed.",
            )

        case _:
            return ErrorSpec(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                code="server.internal_error",
                message="An internal server error occurred.",
            )


REQUEST_ID_HEADER = "X-Request-ID"


def _get_request_id(request: Request) -> str:
    return request.headers[REQUEST_ID_HEADER]


def _build_error_response(
    request: Request,
    spec: ErrorSpec,
    *,
    issues: list[ErrorIssue] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    request_id = _get_request_id(request)

    response = JSONResponse(
        status_code=spec.status_code,
        content=ErrorResponse(
            error=ErrorBody(
                code=spec.code,
                message=spec.message,
                issues=issues,
            ),
            request_id=request_id,
        ).model_dump(
            mode="json",
            by_alias=True,
            exclude_none=True,
        ),
        headers=dict(headers) if headers is not None else None,
    )
    if spec.clear_session_cookie:
        delete_session_cookie(response, request.app.state.settings)
    return response


async def mapped_error_handler(
    request: Request,
    exc: ApplicationError | APIRequestError,
) -> JSONResponse:
    return _build_error_response(request, _resolve_error(exc))


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
    return _build_error_response(request, _resolve_error(exc))


async def request_validation_error_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return _build_error_response(
        request,
        _resolve_error(exc),
        issues=_validation_issues(exc),
    )


async def http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    return _build_error_response(
        request,
        _resolve_error(exc),
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
    return _build_error_response(request, _resolve_error(exc))


async def unexpected_error_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    request_id = _get_request_id(request)
    # ServerErrorMiddleware sends this response outside CorrelationIdMiddleware.
    return _build_error_response(
        request,
        _resolve_error(exc),
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
    app.add_exception_handler(ApplicationError, mapped_error_handler)
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
