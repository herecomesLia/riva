from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.roles import TargetRole


class JobDescriptionImportDraft(Base):
    __tablename__ = "job_description_import_drafts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('ready', 'applied')",
            name="ck_job_description_import_drafts_status",
        ),
        CheckConstraint(
            "length(trim(raw_text)) > 0",
            name="ck_job_description_import_drafts_raw_text_not_blank",
        ),
        CheckConstraint(
            "parsed_title IS NULL OR length(trim(parsed_title)) > 0",
            name="ck_job_description_import_drafts_title_not_blank",
        ),
        Index(
            "ix_job_description_import_drafts_user_status_updated_at",
            "user_id",
            "status",
            "updated_at",
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
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    parsed_company: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    parsed_title: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    parsed_location: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    parsed_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_result: Mapped[dict[str, object] | None] = mapped_column(
        JSON(none_as_null=True),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="ready",
    )
    applied_role_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("target_roles.id", ondelete="SET NULL"),
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

    applied_role: Mapped[TargetRole | None] = relationship(
        "TargetRole",
        foreign_keys=[applied_role_id],
    )
