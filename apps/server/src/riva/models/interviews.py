from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.roles import TargetRole
    from riva.models.user import User


class InterviewSession(Base):
    __tablename__ = "interview_sessions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "target_role_id"],
            ["target_roles.user_id", "target_roles.id"],
            ondelete="CASCADE",
            name="fk_interview_sessions_target_role_owner",
        ),
        CheckConstraint(
            "language IN ('zh-CN', 'en')",
            name="ck_interview_sessions_language",
        ),
        CheckConstraint(
            "version >= 1",
            name="ck_interview_sessions_version",
        ),
        CheckConstraint(
            "status IN ("
            "'opening', 'generatingQuestion', 'question', 'generatingTurn', "
            "'followUp', 'candidateQuestions', 'generatingCandidateAnswer', "
            "'generatingReview', 'completed'"
            ")",
            name="ck_interview_sessions_status",
        ),
        CheckConstraint(
            "round IN ('hr', 'firstBusiness', 'technical', 'manager', 'final', 'comprehensive')",
            name="ck_interview_sessions_round",
        ),
        CheckConstraint(
            "difficulty IN ('basic', 'pressure')",
            name="ck_interview_sessions_difficulty",
        ),
        CheckConstraint(
            "duration_minutes IN (15, 30, 45)",
            name="ck_interview_sessions_duration_minutes",
        ),
        CheckConstraint(
            "plan_revision >= 0",
            name="ck_interview_sessions_plan_revision",
        ),
        CheckConstraint(
            "total_main_questions IS NULL OR total_main_questions >= 1",
            name="ck_interview_sessions_total_main_questions",
        ),
        CheckConstraint(
            "(status = 'completed' AND completed_at IS NOT NULL "
            "AND completion_reason IS NOT NULL) OR "
            "(status <> 'completed' AND completed_at IS NULL "
            "AND completion_reason IS NULL)",
            name="ck_interview_sessions_completion_state",
        ),
        Index(
            "uq_interview_sessions_active_user",
            "user_id",
            unique=True,
            postgresql_where=text("status <> 'completed'"),
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
        index=True,
    )
    target_role_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )
    language: Mapped[str] = mapped_column(String(16), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="opening",
    )
    round: Mapped[str] = mapped_column(String(32), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(32), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completion_reason: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    plan_revision: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    total_main_questions: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
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

    user: Mapped[User] = relationship(
        back_populates="interview_sessions",
        foreign_keys=[user_id],
        passive_deletes=True,
    )
    target_role: Mapped[TargetRole] = relationship(
        back_populates="interview_sessions",
        foreign_keys=[user_id, target_role_id],
        passive_deletes=True,
        overlaps="user,interview_sessions",
    )


__all__ = ["InterviewSession"]
