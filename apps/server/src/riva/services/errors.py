from riva.errors import AppError, ErrorCode


class AuthenticationError(AppError):
    _default_message = "Authentication failed."


class NotFoundError(AppError):
    code = ErrorCode.RESOURCE_NOT_FOUND
    _default_message = "Resource was not found."


class ConflictError(AppError):
    code = ErrorCode.RESOURCE_CONFLICT
    _default_message = "The operation conflicts with the current resource state."


class DomainValidationError(AppError):
    code = ErrorCode.DOMAIN_VALIDATION_FAILED
    _default_message = "The operation violates domain constraints."


class InvalidCredentialsError(AuthenticationError):
    code = ErrorCode.AUTH_INVALID_CREDENTIALS
    _default_message = "Invalid username or password."


class InvalidSessionError(AuthenticationError):
    code = ErrorCode.AUTH_INVALID_SESSION
    _default_message = "Session is invalid."


class SessionExpiredError(AuthenticationError):
    code = ErrorCode.AUTH_SESSION_EXPIRED
    _default_message = "Session has expired."


class UsernameTakenError(ConflictError):
    code = ErrorCode.AUTH_USERNAME_TAKEN
    _default_message = "Username is already registered."
