from dataclasses import dataclass

from fastapi.exceptions import RequestValidationError, ResponseValidationError
from starlette import status
from starlette.exceptions import HTTPException as StarletteHTTPException

from riva.api.errors.exceptions import (
    APINotImplementedError,
    AuthRequiredError,
    CsrfFailedError,
)
from riva.errors import AppError, DependencyUnavailableError, ErrorCode
from riva.services.errors import (
    AuthenticationError,
    ConflictError,
    DomainValidationError,
    InvalidSessionError,
    NotFoundError,
    SessionExpiredError,
)


@dataclass(frozen=True)
class HttpErrorPolicy:
    status_code: int
    clear_session_cookie: bool = False


@dataclass(frozen=True)
class ErrorDetails:
    code: ErrorCode
    message: str


HTTP_ERROR_POLICIES: dict[type[Exception], HttpErrorPolicy] = {
    InvalidSessionError: HttpErrorPolicy(
        status.HTTP_401_UNAUTHORIZED,
        clear_session_cookie=True,
    ),
    SessionExpiredError: HttpErrorPolicy(
        status.HTTP_401_UNAUTHORIZED,
        clear_session_cookie=True,
    ),
    AuthenticationError: HttpErrorPolicy(status.HTTP_401_UNAUTHORIZED),
    NotFoundError: HttpErrorPolicy(status.HTTP_404_NOT_FOUND),
    ConflictError: HttpErrorPolicy(status.HTTP_409_CONFLICT),
    DomainValidationError: HttpErrorPolicy(status.HTTP_422_UNPROCESSABLE_CONTENT),
    DependencyUnavailableError: HttpErrorPolicy(status.HTTP_503_SERVICE_UNAVAILABLE),
    AuthRequiredError: HttpErrorPolicy(status.HTTP_401_UNAUTHORIZED),
    CsrfFailedError: HttpErrorPolicy(status.HTTP_403_FORBIDDEN),
    APINotImplementedError: HttpErrorPolicy(status.HTTP_501_NOT_IMPLEMENTED),
    RequestValidationError: HttpErrorPolicy(status.HTTP_422_UNPROCESSABLE_CONTENT),
    ResponseValidationError: HttpErrorPolicy(status.HTTP_500_INTERNAL_SERVER_ERROR),
    Exception: HttpErrorPolicy(status.HTTP_500_INTERNAL_SERVER_ERROR),
}

FRAMEWORK_ERROR_DETAILS: dict[type[Exception], ErrorDetails] = {
    RequestValidationError: ErrorDetails(
        ErrorCode.REQUEST_VALIDATION_FAILED,
        "Request validation failed.",
    ),
    ResponseValidationError: ErrorDetails(
        ErrorCode.SERVER_INTERNAL_ERROR,
        "An internal server error occurred.",
    ),
    Exception: ErrorDetails(
        ErrorCode.SERVER_INTERNAL_ERROR,
        "An internal server error occurred.",
    ),
}


def resolve_http_policy(error: Exception | type[Exception]) -> HttpErrorPolicy:
    if isinstance(error, StarletteHTTPException):
        return HttpErrorPolicy(error.status_code)

    error_type = error if isinstance(error, type) else type(error)
    return next(
        (
            HTTP_ERROR_POLICIES[parent]
            for parent in error_type.__mro__
            if parent in HTTP_ERROR_POLICIES
        ),
        HTTP_ERROR_POLICIES[Exception],
    )


def resolve_error_details(error: Exception | type[Exception]) -> ErrorDetails:
    if isinstance(error, AppError):
        return ErrorDetails(error.code, error.message)

    if isinstance(error, type) and issubclass(error, AppError):
        return ErrorDetails(error.code, error._default_message)

    if isinstance(error, StarletteHTTPException):
        if error.status_code == status.HTTP_404_NOT_FOUND:
            return ErrorDetails(
                ErrorCode.REQUEST_NOT_FOUND,
                "The requested endpoint was not found.",
            )
        if error.status_code == status.HTTP_405_METHOD_NOT_ALLOWED:
            return ErrorDetails(
                ErrorCode.REQUEST_METHOD_NOT_ALLOWED,
                "The HTTP method is not allowed for this endpoint.",
            )
        return ErrorDetails(ErrorCode.REQUEST_HTTP_ERROR, "Request failed.")

    error_type = error if isinstance(error, type) else type(error)
    return FRAMEWORK_ERROR_DETAILS.get(
        error_type,
        FRAMEWORK_ERROR_DETAILS[Exception],
    )
