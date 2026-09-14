from riva.errors import AppError, ErrorCode


class TaskError(RuntimeError):
    pass


class TaskStateError(AppError):
    code = ErrorCode.RESOURCE_CONFLICT
    _default_message = "The operation is not allowed in the current task state."
