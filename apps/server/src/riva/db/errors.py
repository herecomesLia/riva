from riva.errors import DependencyUnavailableError, ErrorCode


class DatabaseUnavailableError(DependencyUnavailableError):
    dependency = "database"
    code = ErrorCode.DEPENDENCY_DATABASE_UNAVAILABLE
    _default_message = "Database is temporarily unavailable."
