from riva.errors import AppError, ErrorCode


class AuthenticationError(AppError):
    pass


class ConflictError(AppError):
    pass


class InvalidCredentialsError(AuthenticationError):
    code = ErrorCode.AUTH_INVALID_CREDENTIALS
    message = "Invalid username or password."


class InvalidSessionError(AuthenticationError):
    code = ErrorCode.AUTH_INVALID_SESSION
    message = "Session is invalid."


class SessionExpiredError(AuthenticationError):
    code = ErrorCode.AUTH_SESSION_EXPIRED
    message = "Session has expired."


class UsernameTakenError(ConflictError):
    code = ErrorCode.AUTH_USERNAME_TAKEN
    message = "Username is already registered."


class CareerProfileNotFoundError(AppError):
    code = ErrorCode.CAREER_PROFILE_NOT_FOUND
    message = "Career profile was not found."


class CareerProfileAlreadyExistsError(ConflictError):
    code = ErrorCode.CAREER_PROFILE_ALREADY_EXISTS
    message = "Career profile already exists."


class CareerProfileSkillMismatchError(AppError):
    code = ErrorCode.CAREER_PROFILE_SKILL_MISMATCH
    message = "Work experience skills must exist in the career profile skills list."
