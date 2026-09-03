import pytest
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from riva.api.errors.exceptions import AuthRequiredError, CsrfFailedError
from riva.api.errors.mapping import (
    ErrorDetails,
    HttpErrorPolicy,
    resolve_error_details,
    resolve_http_policy,
)
from riva.db.errors import DatabaseUnavailableError
from riva.errors import ErrorCode
from riva.services.errors import (
    InvalidCredentialsError,
    InvalidSessionError,
    SessionExpiredError,
    UsernameTakenError,
)


@pytest.mark.parametrize(
    ("exception", "expected"),
    [
        (UsernameTakenError(), HttpErrorPolicy(409)),
        (InvalidCredentialsError(), HttpErrorPolicy(401)),
        (InvalidSessionError(), HttpErrorPolicy(401, clear_session_cookie=True)),
        (SessionExpiredError(), HttpErrorPolicy(401, clear_session_cookie=True)),
        (AuthRequiredError(), HttpErrorPolicy(401)),
        (CsrfFailedError(), HttpErrorPolicy(403)),
        (DatabaseUnavailableError(), HttpErrorPolicy(503)),
        (RequestValidationError([]), HttpErrorPolicy(422)),
        (StarletteHTTPException(status_code=418), HttpErrorPolicy(418)),
        (RuntimeError("unexpected"), HttpErrorPolicy(500)),
    ],
)
def test_resolve_http_policy(
    exception: Exception,
    expected: HttpErrorPolicy,
) -> None:
    assert resolve_http_policy(exception) == expected


@pytest.mark.parametrize(
    ("exception", "expected"),
    [
        (
            RequestValidationError([]),
            ErrorDetails(
                ErrorCode.REQUEST_VALIDATION_FAILED,
                "Request validation failed.",
            ),
        ),
        (
            StarletteHTTPException(status_code=404),
            ErrorDetails(
                ErrorCode.REQUEST_NOT_FOUND,
                "The requested endpoint was not found.",
            ),
        ),
        (
            StarletteHTTPException(status_code=405),
            ErrorDetails(
                ErrorCode.REQUEST_METHOD_NOT_ALLOWED,
                "The HTTP method is not allowed for this endpoint.",
            ),
        ),
        (
            StarletteHTTPException(status_code=418),
            ErrorDetails(ErrorCode.REQUEST_HTTP_ERROR, "Request failed."),
        ),
        (
            RuntimeError("unexpected"),
            ErrorDetails(
                ErrorCode.SERVER_INTERNAL_ERROR,
                "An internal server error occurred.",
            ),
        ),
    ],
)
def test_resolve_framework_error_details(
    exception: Exception,
    expected: ErrorDetails,
) -> None:
    assert resolve_error_details(exception) == expected


def test_resolve_error_details_does_not_use_error_attributes() -> None:
    class ErrorWithPublicAttributes(RuntimeError):
        code = ErrorCode.DEPENDENCY_DATABASE_UNAVAILABLE
        message = "internal-secret"

    assert resolve_error_details(ErrorWithPublicAttributes()) == ErrorDetails(
        ErrorCode.SERVER_INTERNAL_ERROR,
        "An internal server error occurred.",
    )
