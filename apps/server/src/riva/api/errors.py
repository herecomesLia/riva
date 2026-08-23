from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from riva.api.cookies import delete_session_cookie
from riva.db.errors import DatabaseUnavailableError
from riva.services.errors import (
    AuthenticationError,
    DataTooLargeError,
    DomainConflictError,
    ExternalDependencyError,
    InvalidDataError,
    PermissionDeniedError,
    ResourceMissingError,
    ServiceError,
)


class APIError(RuntimeError):
    def __init__(
        self,
        status_code: int,
        error: str,
        *,
        clear_session_cookie: bool = False,
    ) -> None:
        super().__init__(error)
        self.status_code = status_code
        self.error = error
        self.clear_session_cookie = clear_session_cookie


def service_error_to_api_error(error: ServiceError) -> APIError:
    if isinstance(error, AuthenticationError):
        status_code = status.HTTP_401_UNAUTHORIZED
    elif isinstance(error, PermissionDeniedError):
        status_code = status.HTTP_403_FORBIDDEN
    elif isinstance(error, ResourceMissingError):
        status_code = status.HTTP_404_NOT_FOUND
    elif isinstance(error, DomainConflictError):
        status_code = status.HTTP_409_CONFLICT
    elif isinstance(error, InvalidDataError):
        status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    elif isinstance(error, DataTooLargeError):
        status_code = status.HTTP_413_CONTENT_TOO_LARGE
    elif isinstance(error, ExternalDependencyError):
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    else:
        raise TypeError(f"unmapped service error: {type(error).__name__}")

    return APIError(
        status_code,
        error.error,
        clear_session_cookie=error.error
        in {"invalid_session", "session_expired", "account_disabled"},
    )


async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    response = JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.error},
    )
    if exc.clear_session_cookie:
        delete_session_cookie(response, request.app.state.settings)
    return response


async def service_error_handler(
    request: Request,
    exc: ServiceError,
) -> JSONResponse:
    return await api_error_handler(request, service_error_to_api_error(exc))


async def database_error_handler(
    request: Request,
    exc: DatabaseUnavailableError,
) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"error": "database_unavailable"},
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(APIError, api_error_handler)
    app.add_exception_handler(ServiceError, service_error_handler)
    app.add_exception_handler(DatabaseUnavailableError, database_error_handler)
