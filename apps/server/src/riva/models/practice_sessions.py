from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.agent_runs import AgentRun
    from riva.models.practice_interactions import (
        PracticeAnswer,
        PracticeEvaluation,
        PracticeFollowUpDecision,
        PracticeFollowUpQuestion,
        PracticeReview,
    )
    from riva.models.question_cards import QuestionCard
    from riva.models.roles import TargetRole
    from riva.models.user import User


class PracticeSession(Base):
    __tablename__ = "practice_sessions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "target_role_id"],
            ["target_roles.user_id", "target_roles.id"],
            ondelete="CASCADE",
            name="fk_practice_sessions_target_role_owner",
        ),
        CheckConstraint(
            "language IN ('zh-CN', 'en')",
            name="ck_practice_sessions_language",
        ),
        CheckConstraint(
            "version >= 1",
            name="ck_practice_sessions_version",
        ),
        CheckConstraint(
            "status IN ('active', 'completed')",
            name="ck_practice_sessions_status",
        ),
        CheckConstraint(
            "initial_question_type IN ("
            "'projectDeepDive', 'behavioral', 'businessUnderstanding', "
            "'motivation', 'technicalFoundation'"
            ")",
            name="ck_practice_sessions_initial_question_type",
        ),
        CheckConstraint(
            "initial_difficulty IN ('basic', 'pressure')",
            name="ck_practice_sessions_initial_difficulty",
        ),
        CheckConstraint(
            "source IN ('personalized', 'saved', 'history')",
            name="ck_practice_sessions_source",
        ),
        CheckConstraint(
            "completion_reason IS NULL OR completion_reason IN ("
            "'reviewCompleted', 'userEndedEarly'"
            ")",
            name="ck_practice_sessions_completion_reason",
        ),
        CheckConstraint(
            "(status = 'active' AND completed_at IS NULL "
            "AND completion_reason IS NULL) "
            "OR "
            "(status = 'completed' AND completed_at IS NOT NULL "
            "AND completion_reason IS NOT NULL)",
            name="ck_practice_sessions_completion_state",
        ),
        UniqueConstraint(
            "user_id",
            "id",
            name="uq_practice_sessions_user_id_id",
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
    version: Mapped[int] = mapped_column(nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="active",
    )
    initial_question_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    initial_difficulty: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
    )
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    prioritize_weaknesses: Mapped[bool] = mapped_column(
        nullable=False,
        default=False,
    )
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
        String(32),
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
        back_populates="practice_sessions",
        foreign_keys=[user_id],
        overlaps="target_role,practice_sessions",
    )
    target_role: Mapped[TargetRole] = relationship(
        back_populates="practice_sessions",
        foreign_keys=[user_id, target_role_id],
        passive_deletes=True,
        overlaps="user,practice_sessions",
    )
    attempts: Mapped[list[PracticeAttempt]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        foreign_keys="[PracticeAttempt.user_id, PracticeAttempt.session_id]",
        passive_deletes=True,
        order_by="PracticeAttempt.attempt_number",
    )


class PracticeAttempt(Base):
    __tablename__ = "practice_attempts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "session_id"],
            ["practice_sessions.user_id", "practice_sessions.id"],
            ondelete="CASCADE",
            name="fk_practice_attempts_session_owner",
        ),
        CheckConstraint(
            "attempt_number >= 1",
            name="ck_practice_attempts_attempt_number",
        ),
        CheckConstraint(
            "question_type IN ("
            "'projectDeepDive', 'behavioral', 'businessUnderstanding', "
            "'motivation', 'technicalFoundation'"
            ")",
            name="ck_practice_attempts_question_type",
        ),
        CheckConstraint(
            "difficulty IN ('basic', 'pressure')",
            name="ck_practice_attempts_difficulty",
        ),
        CheckConstraint(
            "status IN ("
            "'generatingQuestion', 'answering', 'answeringFollowUp', "
            "'evaluating', 'review', 'completed', 'endedEarly'"
            ")",
            name="ck_practice_attempts_status",
        ),
        UniqueConstraint(
            "session_id",
            "attempt_number",
            name="uq_practice_attempts_session_attempt_number",
        ),
        UniqueConstraint(
            "question_generation_run_id",
            name="uq_practice_attempts_question_generation_run",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )
    attempt_number: Mapped[int] = mapped_column(nullable=False)
    question_type: Mapped[str] = mapped_column(String(64), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="generatingQuestion",
    )
    question_generation_run_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="SET NULL"),
        nullable=True,
    )
    question_card_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("question_cards.id", ondelete="SET NULL"),
        nullable=True,
    )
    retry_of_attempt_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("practice_attempts.id", ondelete="SET NULL"),
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
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    session: Mapped[PracticeSession] = relationship(
        back_populates="attempts",
        foreign_keys=[user_id, session_id],
        passive_deletes=True,
    )
    question_generation_run: Mapped[AgentRun | None] = relationship(
        foreign_keys=[question_generation_run_id],
    )
    question_card: Mapped[QuestionCard | None] = relationship(
        foreign_keys=[question_card_id],
    )
    retry_of_attempt: Mapped[PracticeAttempt | None] = relationship(
        foreign_keys=[retry_of_attempt_id],
        remote_side="PracticeAttempt.id",
    )
    answers: Mapped[list[PracticeAnswer]] = relationship(
        back_populates="attempt",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="PracticeAnswer.order",
    )
    follow_up_questions: Mapped[list[PracticeFollowUpQuestion]] = relationship(
        back_populates="attempt",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="PracticeFollowUpQuestion.order",
    )
    follow_up_decisions: Mapped[list[PracticeFollowUpDecision]] = relationship(
        back_populates="attempt",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="PracticeFollowUpDecision.order",
    )
    evaluation: Mapped[PracticeEvaluation | None] = relationship(
        back_populates="attempt",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )
    review: Mapped[PracticeReview | None] = relationship(
        back_populates="attempt",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )


__all__ = ["PracticeAttempt", "PracticeSession"]
