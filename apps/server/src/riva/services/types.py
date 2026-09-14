from dataclasses import dataclass

from typing_extensions import Sentinel

from riva.tasks.types import TaskErrorCode, TaskStatus

UNSET = Sentinel("UNSET")


@dataclass(frozen=True, slots=True)
class TaskState:
    status: TaskStatus
    error_code: TaskErrorCode | None = None
