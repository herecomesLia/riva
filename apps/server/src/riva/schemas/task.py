from typing import Annotated, Literal

from pydantic import Field

from riva.schemas.base import ResponseModel
from riva.tasks import TaskErrorCode, TaskStatus


class TaskErrorBody(ResponseModel):
    code: TaskErrorCode = Field(description="Stable task failure code.")
    message: str = Field(description="Human-readable explanation of the task failure.")


class TaskStatusResponse(ResponseModel):
    status: Literal[
        TaskStatus.IDLE,
        TaskStatus.QUEUED,
        TaskStatus.RUNNING,
        TaskStatus.ABORTING,
    ] = Field(description="Current task state; idle means no active or failed task.")
    error: None


class TaskFailureResponse(ResponseModel):
    status: Literal[TaskStatus.FAILED]
    error: TaskErrorBody


TaskStateResponse = Annotated[
    TaskStatusResponse | TaskFailureResponse,
    Field(discriminator="status"),
]
