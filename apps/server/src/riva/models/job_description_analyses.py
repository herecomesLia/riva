from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    JSON,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.roles import TargetRole


class JobDescriptionAnalysis(Base):
    __tablename__ = "job_description_analyses"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "role_id"],
            ["target_roles.user_id", "target_roles.id"],
            ondelete="CASCADE",
            name="fk_job_description_analyses_role_owner",
        ),
        CheckConstraint(
            "job_description_version >= 1",
            name="ck_job_description_analyses_jd_version",
        ),
        CheckConstraint(
            "analysis_version >= 1",
            name="ck_job_description_analyses_analysis_version",
        ),
        CheckConstraint(
            "length(trim(riva_summary)) > 0",
            name="ck_job_description_analyses_summary_not_blank",
        ),
        UniqueConstraint(
            "source_agent_run_id",
            name="uq_job_description_analyses_source_run",
        ),
        Index(
            "ix_job_description_analyses_user_role",
            "user_id",
            "role_id",
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
    job_description_version: Mapped[int] = mapped_column(nullable=False)
    analysis_version: Mapped[int] = mapped_column(nullable=False, default=1)
    source_agent_run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("agent_runs.id"),
        nullable=False,
    )
    parsed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    riva_summary: Mapped[str] = mapped_column(Text, nullable=False)
    responsibilities: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    qualification_requirements: Mapped[dict[str, list[str]]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    required_skills: Mapped[dict[str, list[str]]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    preferred_qualifications: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    soft_skills: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    business_domains: Mapped[list[str]] = mapped_column(
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
        back_populates="job_description_analysis",
        foreign_keys=[user_id, role_id],
    )
