from enum import StrEnum
from typing import ClassVar


class ErrorCode(StrEnum):
    DEPENDENCY_DATABASE_UNAVAILABLE = "dependency.database_unavailable"
    DEPENDENCY_LLM_UNAVAILABLE = "dependency.llm_unavailable"
    REQUEST_CSRF_FAILED = "request.csrf_failed"
    REQUEST_HTTP_ERROR = "request.http_error"
    REQUEST_METHOD_NOT_ALLOWED = "request.method_not_allowed"
    REQUEST_NOT_FOUND = "request.not_found"
    REQUEST_NOT_IMPLEMENTED = "request.not_implemented"
    REQUEST_VALIDATION_FAILED = "request.validation_failed"
    RESOURCE_CONFLICT = "resource.conflict"
    RESOURCE_NOT_FOUND = "resource.not_found"
    DOMAIN_VALIDATION_FAILED = "domain.validation_failed"
    SERVER_INTERNAL_ERROR = "server.internal_error"
    AUTH_INVALID_CREDENTIALS = "auth.invalid_credentials"
    AUTH_INVALID_SESSION = "auth.invalid_session"
    AUTH_NOT_AUTHENTICATED = "auth.not_authenticated"
    AUTH_SESSION_EXPIRED = "auth.session_expired"
    AUTH_USERNAME_TAKEN = "auth.username_taken"


class AppError(Exception):
    code: ClassVar[ErrorCode]
    _default_message: ClassVar[str]

    def __init__(self, message: str | None = None) -> None:
        self.message = self._default_message if message is None else message
        super().__init__(self.message)


class DependencyUnavailableError(AppError):
    dependency: ClassVar[str]
