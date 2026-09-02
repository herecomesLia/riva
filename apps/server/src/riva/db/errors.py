from riva.errors import ErrorCode


class DatabaseUnavailableError(RuntimeError):
    code = ErrorCode.DEPENDENCY_DATABASE_UNAVAILABLE
    message = "Database is temporarily unavailable."
