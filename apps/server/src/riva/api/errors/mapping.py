from dataclasses import dataclass

from fastapi.exceptions import RequestValidationError
from starlette import status
from starlette.exceptions import HTTPException as StarletteHTTPException

from riva.db.errors import DatabaseUnavailableError
from riva.services.errors import (
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


class APINotImplementedError(APIRequestError):
    pass


@dataclass(frozen=True)
class ErrorSpec:
    status_code: int
    code: str
    message: str
    clear_session_cookie: bool = False


def resolve_error(exc: Exception) -> ErrorSpec:
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

        case APINotImplementedError():
            return ErrorSpec(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                code="request.not_implemented",
                message="This operation is not implemented.",
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
