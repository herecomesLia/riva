from sqlalchemy import BigInteger, Enum
from sqlalchemy.orm import Mapped, mapped_column

from riva.tasks.types import TaskErrorCode


class TaskStateMixin:
    job_id: Mapped[int | None] = mapped_column(BigInteger)
    error_code: Mapped[TaskErrorCode | None] = mapped_column(
        Enum(
            TaskErrorCode,
            values_callable=lambda enum: [member.value for member in enum],
            native_enum=False,
            validate_strings=True,
        )
    )
