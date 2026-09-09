from dataclasses import dataclass
from enum import StrEnum

from riva.errors import ErrorCode


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


@dataclass(frozen=True, slots=True)
class TaskState:
    status: TaskStatus
    error_code: ErrorCode | None = None
