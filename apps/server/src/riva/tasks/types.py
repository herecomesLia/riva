from enum import StrEnum


class TaskErrorCode(StrEnum):
    SERVICE_UNAVAILABLE = "service_unavailable"
    INVALID_OUTPUT = "invalid_output"
    LLM_UNAVAILABLE = "llm_unavailable"
    INTERNAL_ERROR = "internal_error"


class TaskStatus(StrEnum):
    IDLE = "idle"
    QUEUED = "queued"
    RUNNING = "running"
    FAILED = "failed"
    ABORTING = "aborting"
