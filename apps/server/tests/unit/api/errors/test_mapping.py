import pytest
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from riva.api.errors.mapping import (
    AuthRequiredError,
    CsrfFailedError,
    ErrorSpec,
    resolve_error,
)
from riva.db.errors import DatabaseUnavailableError
from riva.services.errors import (
    AccountDisabledError,
    InvalidCredentialsError,
    InvalidSessionError,
    SessionExpiredError,
    UsernameTakenError,
)


@pytest.mark.parametrize(
    ("exception", "expected"),
    [
        (
            UsernameTakenError(),
            ErrorSpec(409, "auth.username_taken", "Username is already registered."),
        ),
        (
            InvalidCredentialsError(),
            ErrorSpec(401, "auth.invalid_credentials", "Invalid username or password."),
        ),
        (
            InvalidSessionError(),
            ErrorSpec(
                401,
                "auth.invalid_session",
                "Session is invalid.",
                clear_session_cookie=True,
            ),
        ),
        (
            SessionExpiredError(),
            ErrorSpec(
                401,
                "auth.session_expired",
                "Session has expired.",
                clear_session_cookie=True,
            ),
        ),
        (
            AccountDisabledError(),
            ErrorSpec(
                403,
                "auth.account_disabled",
                "Account is disabled.",
                clear_session_cookie=True,
            ),
        ),
        (
            AuthRequiredError(),
            ErrorSpec(401, "auth.not_authenticated", "Authentication is required."),
        ),
        (
            CsrfFailedError(),
            ErrorSpec(403, "request.csrf_failed", "CSRF validation failed."),
        ),
        (
            DatabaseUnavailableError(),
            ErrorSpec(
                503,
                "dependency.database_unavailable",
                "Database is temporarily unavailable.",
            ),
        ),
        (
            RequestValidationError([]),
            ErrorSpec(
                422,
                "request.validation_failed",
                "Request validation failed.",
            ),
        ),
        (
            StarletteHTTPException(status_code=404),
            ErrorSpec(
                404,
                "request.not_found",
                "The requested endpoint was not found.",
            ),
        ),
        (
            StarletteHTTPException(status_code=405),
            ErrorSpec(
                405,
                "request.method_not_allowed",
                "The HTTP method is not allowed for this endpoint.",
            ),
        ),
        (
            StarletteHTTPException(status_code=418),
            ErrorSpec(418, "request.http_error", "Request failed."),
        ),
        (
            RuntimeError("unexpected"),
            ErrorSpec(
                500,
                "server.internal_error",
                "An internal server error occurred.",
            ),
        ),
    ],
)
def test_resolve_error_maps_exception_to_public_spec(
    exception: Exception,
    expected: ErrorSpec,
) -> None:
    assert resolve_error(exception) == expected
