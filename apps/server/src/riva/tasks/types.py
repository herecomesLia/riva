from enum import StrEnum


class TaskErrorCode(StrEnum):
    INVALID_OUTPUT = "invalid_output"
    LLM_UNAVAILABLE = "llm_unavailable"
    INTERNAL_ERROR = "internal_error"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    ABORTING = "aborting"
    ABORTED = "aborted"
    CANCELLED = "cancelled"


class TaskStatus(StrEnum):
    IDLE = "idle"
    QUEUED = "queued"
    RUNNING = "running"
    FAILED = "failed"
    ABORTING = "aborting"
