from dataclasses import dataclass

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from riva.api.cookies import delete_session_cookie
from riva.schemas.errors import ErrorBody, ErrorResponse
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


ERROR_SPECS: dict[type[Exception], ErrorSpec] = {
    UsernameTakenError: ErrorSpec(
        status_code=409,
        code="auth.username_taken",
        message="Username is already registered.",
    ),
    InvalidCredentialsError: ErrorSpec(
        status_code=401,
        code="auth.invalid_credentials",
        message="Invalid username or password.",
    ),
    InvalidSessionError: ErrorSpec(
        status_code=401,
        code="auth.invalid_session",
        message="Session is invalid.",
        clear_session_cookie=True,
    ),
    SessionExpiredError: ErrorSpec(
        status_code=401,
        code="auth.session_expired",
        message="Session has expired.",
        clear_session_cookie=True,
    ),
    AccountDisabledError: ErrorSpec(
        status_code=403,
        code="auth.account_disabled",
        message="Account is disabled.",
        clear_session_cookie=True,
    ),
    AuthRequiredError: ErrorSpec(
        status_code=401,
        code="auth.not_authenticated",
        message="Authentication is required.",
    ),
    CsrfFailedError: ErrorSpec(
        status_code=403,
        code="request.csrf_failed",
        message="CSRF validation failed.",
    ),
}

REQUEST_ID_HEADER = "X-Request-ID"


def _get_request_id(request: Request) -> str:
    return request.headers[REQUEST_ID_HEADER]


def _build_error_response(request: Request, spec: ErrorSpec) -> JSONResponse:
    response = JSONResponse(
        status_code=spec.status_code,
        content=ErrorResponse(
            error=ErrorBody(
                code=spec.code,
                message=spec.message,
            ),
            request_id=_get_request_id(request),
        ).model_dump(
            mode="json",
            by_alias=True,
            exclude_none=True,
        ),
    )
    if spec.clear_session_cookie:
        delete_session_cookie(response, request.app.state.settings)
    return response


async def expected_error_handler(
    request: Request,
    exc: ApplicationError | APIRequestError,
) -> JSONResponse:
    return _build_error_response(request, ERROR_SPECS[type(exc)])


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApplicationError, expected_error_handler)
    app.add_exception_handler(APIRequestError, expected_error_handler)
