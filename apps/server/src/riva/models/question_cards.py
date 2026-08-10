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
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.profile import CareerProfile
    from riva.models.roles import TargetRole
    from riva.models.user import User


class QuestionCard(Base):
    __tablename__ = "question_cards"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "target_role_id"],
            ["target_roles.user_id", "target_roles.id"],
            ondelete="CASCADE",
            name="fk_question_cards_target_role_owner",
        ),
        ForeignKeyConstraint(
            ["user_id", "profile_id"],
            ["career_profiles.user_id", "career_profiles.id"],
            ondelete="CASCADE",
            name="fk_question_cards_profile_owner",
        ),
        CheckConstraint(
            "language IN ('zh-CN', 'en')",
            name="ck_question_cards_language",
        ),
        CheckConstraint(
            "question_type IN ("
            "'projectDeepDive', 'behavioral', 'businessUnderstanding', "
            "'motivation', 'technicalFoundation'"
            ")",
            name="ck_question_cards_question_type",
        ),
        CheckConstraint(
            "difficulty IN ('basic', 'pressure')",
            name="ck_question_cards_difficulty",
        ),
        CheckConstraint(
            "length(trim(prompt)) > 0",
            name="ck_question_cards_prompt_not_blank",
        ),
        CheckConstraint(
            "profile_version >= 1",
            name="ck_question_cards_profile_version",
        ),
        CheckConstraint(
            "job_description_version >= 1",
            name="ck_question_cards_jd_version",
        ),
        CheckConstraint(
            "job_description_analysis_version >= 1",
            name="ck_question_cards_analysis_version",
        ),
        UniqueConstraint(
            "source_agent_run_id",
            name="uq_question_cards_source_run",
        ),
        Index(
            "ix_question_cards_user_target_role",
            "user_id",
            "target_role_id",
        ),
        Index(
            "ix_question_cards_user_profile",
            "user_id",
            "profile_id",
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
    profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )
    source_agent_run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    matching_analysis_run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    language: Mapped[str] = mapped_column(String(16), nullable=False)
    question_type: Mapped[str] = mapped_column(String(64), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(32), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    assessed_capabilities: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    recommended_materials: Mapped[list[dict[str, object]]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    answer_hints: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    answer_framework: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    follow_up_directions: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    scoring_focus: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    profile_version: Mapped[int] = mapped_column(nullable=False)
    job_description_version: Mapped[int] = mapped_column(nullable=False)
    job_description_analysis_version: Mapped[int] = mapped_column(nullable=False)
    is_saved: Mapped[bool] = mapped_column(nullable=False, default=False)
    is_marked_weak: Mapped[bool] = mapped_column(nullable=False, default=False)
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
        back_populates="question_cards",
        foreign_keys=[user_id],
        overlaps="target_role,career_profile",
    )
    target_role: Mapped[TargetRole] = relationship(
        back_populates="question_cards",
        foreign_keys=[user_id, target_role_id],
        passive_deletes=True,
        overlaps="user,career_profile,question_cards",
    )
    career_profile: Mapped[CareerProfile] = relationship(
        back_populates="question_cards",
        foreign_keys=[user_id, profile_id],
        passive_deletes=True,
        overlaps="user,target_role,question_cards",
    )


__all__ = ["QuestionCard"]
