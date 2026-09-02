from dataclasses import dataclass
from typing import ClassVar

from fastapi.exceptions import RequestValidationError, ResponseValidationError
from starlette import status
from starlette.exceptions import HTTPException as StarletteHTTPException

from riva.db.errors import DatabaseUnavailableError
from riva.errors import ErrorCode
from riva.services.errors import (
    CareerProfileAlreadyExistsError,
    CareerProfileNotFoundError,
    CareerProfileSkillMismatchError,
    InvalidCredentialsError,
    InvalidSessionError,
    SessionExpiredError,
    UsernameTakenError,
)


class APIRequestError(Exception):
    code: ClassVar[ErrorCode]
    message: ClassVar[str]

    def __init__(self) -> None:
        super().__init__(self.message)


class AuthRequiredError(APIRequestError):
    code = ErrorCode.AUTH_NOT_AUTHENTICATED
    message = "Authentication is required."


class CsrfFailedError(APIRequestError):
    code = ErrorCode.REQUEST_CSRF_FAILED
    message = "CSRF validation failed."


class APINotImplementedError(APIRequestError):
    code = ErrorCode.REQUEST_NOT_IMPLEMENTED
    message = "This operation is not implemented."


@dataclass(frozen=True)
class HttpErrorPolicy:
    status_code: int
    clear_session_cookie: bool = False


@dataclass(frozen=True)
class ErrorDetails:
    code: ErrorCode
    message: str


HTTP_ERROR_POLICIES: dict[type[Exception], HttpErrorPolicy] = {
    InvalidCredentialsError: HttpErrorPolicy(status.HTTP_401_UNAUTHORIZED),
    InvalidSessionError: HttpErrorPolicy(
        status.HTTP_401_UNAUTHORIZED,
        clear_session_cookie=True,
    ),
    SessionExpiredError: HttpErrorPolicy(
        status.HTTP_401_UNAUTHORIZED,
        clear_session_cookie=True,
    ),
    UsernameTakenError: HttpErrorPolicy(status.HTTP_409_CONFLICT),
    CareerProfileNotFoundError: HttpErrorPolicy(status.HTTP_404_NOT_FOUND),
    CareerProfileAlreadyExistsError: HttpErrorPolicy(status.HTTP_409_CONFLICT),
    CareerProfileSkillMismatchError: HttpErrorPolicy(
        status.HTTP_422_UNPROCESSABLE_CONTENT
    ),
    AuthRequiredError: HttpErrorPolicy(status.HTTP_401_UNAUTHORIZED),
    CsrfFailedError: HttpErrorPolicy(status.HTTP_403_FORBIDDEN),
    APINotImplementedError: HttpErrorPolicy(status.HTTP_501_NOT_IMPLEMENTED),
    DatabaseUnavailableError: HttpErrorPolicy(status.HTTP_503_SERVICE_UNAVAILABLE),
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
    return HTTP_ERROR_POLICIES.get(error_type, HTTP_ERROR_POLICIES[Exception])


def resolve_error_details(error: Exception | type[Exception]) -> ErrorDetails:
    code = getattr(error, "code", None)
    message = getattr(error, "message", None)
    if isinstance(code, ErrorCode) and isinstance(message, str):
        return ErrorDetails(code, message)

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
