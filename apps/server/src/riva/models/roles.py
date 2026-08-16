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
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.agent_runs import AgentRun
    from riva.models.job_description_analyses import JobDescriptionAnalysis
    from riva.models.interviews import InterviewSession
    from riva.models.matching_analyses import MatchingAnalysis
    from riva.models.practice_sessions import PracticeSession
    from riva.models.question_cards import QuestionCard
    from riva.models.user import User


class TargetRole(Base):
    __tablename__ = "target_roles"
    __table_args__ = (
        CheckConstraint("recruitment_type IN ('campus', 'experienced')"),
        CheckConstraint(
            "preparation_status IN ('preparing', 'paused', 'archived')"
        ),
        CheckConstraint("job_description_status IN ('missing', 'saved')"),
        CheckConstraint("version >= 1"),
        CheckConstraint(
            "job_description_version IS NULL OR job_description_version >= 1"
        ),
        CheckConstraint(
            "min_experience_years IS NULL OR min_experience_years >= 0"
        ),
        CheckConstraint(
            "max_experience_years IS NULL OR max_experience_years >= 0"
        ),
        CheckConstraint(
            "min_experience_years IS NULL "
            "OR max_experience_years IS NULL "
            "OR max_experience_years >= min_experience_years"
        ),
        CheckConstraint(
            "(job_description_status = 'missing' "
            "AND raw_job_description IS NULL "
            "AND job_description_version IS NULL) "
            "OR "
            "(job_description_status = 'saved' "
            "AND raw_job_description IS NOT NULL "
            "AND length(trim(raw_job_description)) > 0 "
            "AND job_description_version >= 1)"
        ),
        UniqueConstraint("user_id", "id"),
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
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recruitment_type: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
    )
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    min_experience_years: Mapped[int | None] = mapped_column(nullable=True)
    max_experience_years: Mapped[int | None] = mapped_column(nullable=True)
    preparation_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="preparing",
    )
    job_description_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="missing",
    )
    raw_job_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    job_description_version: Mapped[int | None] = mapped_column(nullable=True)
    job_description_parsing_run_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    matching_analysis_run_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    version: Mapped[int] = mapped_column(nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    user: Mapped[User] = relationship(
        back_populates="target_roles",
        foreign_keys=[user_id],
    )
    current_target_role: Mapped[CurrentTargetRole | None] = relationship(
        back_populates="role",
        overlaps="current_target_role,user",
        passive_deletes=True,
        uselist=False,
    )
    job_description_analysis: Mapped[JobDescriptionAnalysis | None] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )
    matching_analysis: Mapped[MatchingAnalysis | None] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )
    question_cards: Mapped[list[QuestionCard]] = relationship(
        back_populates="target_role",
        cascade="all, delete-orphan",
        foreign_keys="[QuestionCard.user_id, QuestionCard.target_role_id]",
        passive_deletes=True,
        overlaps="user,question_cards",
    )
    practice_sessions: Mapped[list[PracticeSession]] = relationship(
        back_populates="target_role",
        cascade="all, delete-orphan",
        foreign_keys="[PracticeSession.user_id, PracticeSession.target_role_id]",
        passive_deletes=True,
        overlaps="user,practice_sessions",
    )
    interview_sessions: Mapped[list[InterviewSession]] = relationship(
        back_populates="target_role",
        cascade="all, delete-orphan",
        foreign_keys="[InterviewSession.user_id, InterviewSession.target_role_id]",
        passive_deletes=True,
        overlaps="user,interview_sessions",
    )
    job_description_parsing_run: Mapped[AgentRun | None] = relationship(
        foreign_keys=[job_description_parsing_run_id],
    )
    matching_analysis_run: Mapped[AgentRun | None] = relationship(
        foreign_keys=[matching_analysis_run_id],
    )


class CurrentTargetRole(Base):
    __tablename__ = "current_target_roles"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "role_id"],
            ["target_roles.user_id", "target_roles.id"],
            ondelete="CASCADE",
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    user: Mapped[User] = relationship(
        back_populates="current_target_role",
        foreign_keys=[user_id],
        overlaps="current_target_role,role",
    )
    role: Mapped[TargetRole] = relationship(
        back_populates="current_target_role",
        foreign_keys=[user_id, role_id],
        overlaps="current_target_role,user",
    )
