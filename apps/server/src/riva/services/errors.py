class ApplicationError(Exception):
    pass


class AuthenticationError(ApplicationError):
    pass


class AuthorizationError(ApplicationError):
    pass


class ConflictError(ApplicationError):
    pass


class InvalidCredentialsError(AuthenticationError):
    pass


class InvalidSessionError(AuthenticationError):
    pass


class SessionExpiredError(AuthenticationError):
    pass


class AccountDisabledError(AuthorizationError):
    pass


class UsernameTakenError(ConflictError):
    pass
