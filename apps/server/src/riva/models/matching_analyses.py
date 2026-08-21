from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.roles import TargetRole


class MatchingAnalysis(Base):
    __tablename__ = "matching_analyses"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "role_id"],
            ["target_roles.user_id", "target_roles.id"],
            ondelete="CASCADE",
            name="fk_matching_analyses_role_owner",
        ),
        ForeignKeyConstraint(
            ["user_id", "profile_id"],
            ["career_profiles.user_id", "career_profiles.id"],
            ondelete="CASCADE",
            name="fk_matching_analyses_profile_owner",
        ),
        CheckConstraint(
            "profile_version >= 1",
            name="ck_matching_analyses_profile_version",
        ),
        CheckConstraint(
            "job_description_version >= 1",
            name="ck_matching_analyses_jd_version",
        ),
        CheckConstraint(
            "job_description_analysis_version >= 1",
            name="ck_matching_analyses_analysis_version",
        ),
        CheckConstraint(
            "overall_match_score >= 0 AND overall_match_score <= 100",
            name="ck_matching_analyses_score",
        ),
        CheckConstraint(
            "length(trim(core_requirements_summary)) > 0",
            name="ck_matching_analyses_summary_not_blank",
        ),
        UniqueConstraint(
            "source_agent_run_id",
            name="uq_matching_analyses_source_run",
        ),
        Index(
            "ix_matching_analyses_user_role",
            "user_id",
            "role_id",
        ),
        Index(
            "ix_matching_analyses_user_profile",
            "user_id",
            "profile_id",
        ),
    )

    role_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )
    profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )
    profile_version: Mapped[int] = mapped_column(nullable=False)
    job_description_version: Mapped[int] = mapped_column(nullable=False)
    job_description_analysis_version: Mapped[int] = mapped_column(nullable=False)
    source_agent_run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    overall_match_score: Mapped[int] = mapped_column(nullable=False)
    core_requirements_summary: Mapped[str] = mapped_column(Text, nullable=False)
    matched_capabilities: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    missing_capabilities: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    underrepresented_capabilities: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    resume_highlights: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    resume_gaps: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    high_risk_questions: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    preparation_recommendations: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
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

    role: Mapped[TargetRole] = relationship(
        back_populates="matching_analysis",
        foreign_keys=[user_id, role_id],
    )
