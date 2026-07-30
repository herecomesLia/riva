from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    JSON,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.user import User


JSONScalar = str | int | float | bool | None
JSONValue = JSONScalar | list["JSONValue"] | dict[str, "JSONValue"]
AgentRunPayload = dict[str, str | int]
AgentRunResult = dict[str, JSONValue]


class AgentRunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class AgentRun(Base):
    __tablename__ = "agent_runs"
    __table_args__ = (
        CheckConstraint(
            "attempt_count >= 0 AND max_attempts >= 1 "
            "AND attempt_count <= max_attempts",
            name="ck_agent_runs_attempts",
        ),
        CheckConstraint(
            "(attempt_count = 0 AND started_at IS NULL) "
            "OR (attempt_count > 0 AND started_at IS NOT NULL)",
            name="ck_agent_runs_started_at",
        ),
        CheckConstraint(
            "("
            "status = 'queued' "
            "AND attempt_count < max_attempts "
            "AND lease_owner IS NULL "
            "AND lease_token IS NULL "
            "AND lease_expires_at IS NULL "
            "AND finished_at IS NULL "
            "AND result IS NULL "
            "AND provider IS NULL "
            "AND input_tokens IS NULL "
            "AND output_tokens IS NULL"
            ") OR ("
            "status = 'running' "
            "AND attempt_count >= 1 "
            "AND lease_owner IS NOT NULL "
            "AND lease_token IS NOT NULL "
            "AND lease_expires_at IS NOT NULL "
            "AND finished_at IS NULL "
            "AND result IS NULL "
            "AND provider IS NULL "
            "AND input_tokens IS NULL "
            "AND output_tokens IS NULL"
            ") OR ("
            "status = 'succeeded' "
            "AND attempt_count >= 1 "
            "AND lease_owner IS NULL "
            "AND lease_token IS NULL "
            "AND lease_expires_at IS NULL "
            "AND finished_at IS NOT NULL "
            "AND result IS NOT NULL "
            "AND provider IS NOT NULL "
            "AND input_tokens IS NOT NULL "
            "AND output_tokens IS NOT NULL "
            "AND error_code IS NULL"
            ") OR ("
            "status = 'failed' "
            "AND attempt_count >= 1 "
            "AND lease_owner IS NULL "
            "AND lease_token IS NULL "
            "AND lease_expires_at IS NULL "
            "AND finished_at IS NOT NULL "
            "AND result IS NULL "
            "AND provider IS NULL "
            "AND input_tokens IS NULL "
            "AND output_tokens IS NULL "
            "AND error_code IS NOT NULL"
            ")",
            name="ck_agent_runs_status_fields",
        ),
        UniqueConstraint(
            "user_id",
            "agent_id",
            "prompt_id",
            "prompt_version",
            "idempotency_key",
            name="uq_agent_runs_idempotency",
        ),
        Index(
            "ix_agent_runs_queued_available",
            "status",
            "available_at",
            "created_at",
            "id",
            postgresql_where=text("status = 'queued'"),
        ),
        Index(
            "ix_agent_runs_user_created",
            "user_id",
            "created_at",
            "id",
        ),
        Index(
            "ix_agent_runs_expired_running",
            "lease_expires_at",
            "id",
            postgresql_where=text("status = 'running'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    agent_id: Mapped[str] = mapped_column(String(128), nullable=False)
    prompt_id: Mapped[str] = mapped_column(String(128), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(64), nullable=False)
    output_schema_id: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[AgentRunStatus] = mapped_column(
        Enum(
            AgentRunStatus,
            name="agent_run_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=lambda statuses: [status.value for status in statuses],
        ),
        nullable=False,
        default=AgentRunStatus.QUEUED,
    )
    payload: Mapped[AgentRunPayload] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
        default=dict,
    )
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    attempt_count: Mapped[int] = mapped_column(nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(nullable=False, default=1)
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    lease_owner: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    lease_token: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
    )
    lease_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    provider: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model: Mapped[str] = mapped_column(String(255), nullable=False)
    input_tokens: Mapped[int | None] = mapped_column(nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(nullable=True)
    result: Mapped[AgentRunResult | None] = mapped_column(
        JSON(none_as_null=True),
        nullable=True,
    )
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    user: Mapped[User] = relationship(back_populates="agent_runs")
