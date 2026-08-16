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
    JSON,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.agent_runs import AgentRun
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
    planning_run_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
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
    planning_run: Mapped[AgentRun | None] = relationship(
        foreign_keys=[planning_run_id],
    )
    plans: Mapped[list[InterviewPlan]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewPlan.revision",
    )
    questions: Mapped[list[InterviewQuestion]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewQuestion.order",
    )


class InterviewPlan(Base):
    __tablename__ = "interview_plans"
    __table_args__ = (
        CheckConstraint(
            "revision >= 1",
            name="ck_interview_plans_revision",
        ),
        CheckConstraint(
            "total_main_questions >= 1",
            name="ck_interview_plans_total_main_questions",
        ),
        UniqueConstraint(
            "session_id",
            "revision",
            name="uq_interview_plans_session_revision",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    source_agent_run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    total_main_questions: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    questions: Mapped[list[dict[str, object]]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    session: Mapped[InterviewSession] = relationship(
        back_populates="plans",
    )
    source_agent_run: Mapped[AgentRun] = relationship(
        foreign_keys=[source_agent_run_id],
    )
    questions_records: Mapped[list[InterviewQuestion]] = relationship(
        back_populates="source_plan",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewQuestion.order",
    )


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"
    __table_args__ = (
        CheckConstraint(
            "plan_revision >= 1",
            name="ck_interview_questions_plan_revision",
        ),
        CheckConstraint(
            "\"order\" >= 1",
            name="ck_interview_questions_order",
        ),
        CheckConstraint(
            "length(trim(prompt)) > 0",
            name="ck_interview_questions_prompt_not_blank",
        ),
        CheckConstraint(
            "question_type IN ("
            "'selfIntroduction', 'projectDeepDive', 'roleCapability', "
            "'behavioral', 'technicalOrBusiness', 'resumeRisk', 'motivation'"
            ")",
            name="ck_interview_questions_type",
        ),
        UniqueConstraint(
            "session_id",
            "order",
            name="uq_interview_questions_session_order",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_plan_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    order: Mapped[int] = mapped_column("order", Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(String(64), nullable=False)
    assessed_capabilities: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    session: Mapped[InterviewSession] = relationship(
        back_populates="questions",
    )
    source_plan: Mapped[InterviewPlan] = relationship(
        back_populates="questions_records",
    )


__all__ = ["InterviewPlan", "InterviewQuestion", "InterviewSession"]
