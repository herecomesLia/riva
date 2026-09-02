from enum import StrEnum
from typing import ClassVar


class ErrorCode(StrEnum):
    DEPENDENCY_DATABASE_UNAVAILABLE = "dependency.database_unavailable"
    REQUEST_CSRF_FAILED = "request.csrf_failed"
    REQUEST_HTTP_ERROR = "request.http_error"
    REQUEST_METHOD_NOT_ALLOWED = "request.method_not_allowed"
    REQUEST_NOT_FOUND = "request.not_found"
    REQUEST_NOT_IMPLEMENTED = "request.not_implemented"
    REQUEST_VALIDATION_FAILED = "request.validation_failed"
    SERVER_INTERNAL_ERROR = "server.internal_error"
    AUTH_INVALID_CREDENTIALS = "auth.invalid_credentials"
    AUTH_INVALID_SESSION = "auth.invalid_session"
    AUTH_NOT_AUTHENTICATED = "auth.not_authenticated"
    AUTH_SESSION_EXPIRED = "auth.session_expired"
    AUTH_USERNAME_TAKEN = "auth.username_taken"
    CAREER_PROFILE_ALREADY_EXISTS = "career_profile.already_exists"
    CAREER_PROFILE_NOT_FOUND = "career_profile.not_found"
    CAREER_PROFILE_SKILL_MISMATCH = "career_profile.skill_mismatch"


class AppError(Exception):
    code: ClassVar[ErrorCode]
    message: ClassVar[str]

    def __init__(self) -> None:
        super().__init__(self.message)
