class ServiceError(RuntimeError):
    """Base class for errors raised by domain services."""

    def __init__(self, error: str) -> None:
        super().__init__(error)
        self.error = error


class AuthenticationError(ServiceError):
    """The caller cannot be authenticated for the requested operation."""


class AuthenticationRequiredError(AuthenticationError):
    """Authentication credentials are required."""


class InvalidCredentialsError(AuthenticationError):
    """The supplied credentials are invalid."""


class InvalidSessionError(AuthenticationError):
    """The supplied session is not valid."""


class SessionExpiredError(AuthenticationError):
    """The supplied session has expired."""


class PermissionDeniedError(ServiceError):
    """The authenticated caller cannot perform the requested operation."""


class AccountDisabledError(PermissionDeniedError):
    """The account is disabled."""


class ResourceMissingError(ServiceError):
    """A required domain resource does not exist."""


class DomainConflictError(ServiceError):
    """The requested operation conflicts with current domain state."""


class UsernameTakenError(DomainConflictError):
    """The requested username is already registered."""


class InvalidDataError(ServiceError):
    """The supplied domain data cannot be accepted."""


class DataTooLargeError(ServiceError):
    """The supplied data exceeds a domain limit."""


class ExternalDependencyError(ServiceError):
    """An external dependency required by the operation is unavailable."""


def service_error_for_code(error: str) -> ServiceError:
    """Classify a legacy domain error code without introducing a new error type."""
    if error.endswith("_not_found"):
        return ResourceMissingError(error)
    if error.endswith(("_unavailable", "_model_not_configured")):
        return ExternalDependencyError(error)
    return DomainConflictError(error)
