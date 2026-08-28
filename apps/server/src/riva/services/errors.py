class ApplicationError(Exception):
    pass


class AuthenticationError(ApplicationError):
    pass


class ConflictError(ApplicationError):
    pass


class InvalidCredentialsError(AuthenticationError):
    pass


class InvalidSessionError(AuthenticationError):
    pass


class SessionExpiredError(AuthenticationError):
    pass


class UsernameTakenError(ConflictError):
    pass
