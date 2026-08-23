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
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.resume_documents import ResumeDocument
    from riva.models.resume_parsing_results import ResumeParsingResult


class ResumeImportDraft(Base):
    __tablename__ = "resume_import_drafts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "resume_document_id"],
            ["resume_documents.user_id", "resume_documents.id"],
            ondelete="CASCADE",
            name="fk_resume_import_drafts_document_owner",
        ),
        CheckConstraint(
            "parsing_result_version >= 1",
            name="ck_resume_import_drafts_parsing_result_version",
        ),
        CheckConstraint(
            "draft_version >= 1",
            name="ck_resume_import_drafts_draft_version",
        ),
        CheckConstraint(
            "(base_profile_id IS NULL AND base_profile_version IS NULL) OR "
            "(base_profile_id IS NOT NULL AND base_profile_version IS NOT NULL "
            "AND base_profile_version >= 1)",
            name="ck_resume_import_drafts_base_profile_consistency",
        ),
        CheckConstraint(
            "status IN ('ready', 'applied', 'superseded')",
            name="ck_resume_import_drafts_status",
        ),
        CheckConstraint(
            "summary_action IN ('set', 'preserve', 'none')",
            name="ck_resume_import_drafts_summary_action",
        ),
        CheckConstraint(
            "(status IN ('ready', 'superseded') "
            "AND applied_profile_version IS NULL AND applied_at IS NULL) OR "
            "(status = 'applied' "
            "AND applied_profile_version IS NOT NULL "
            "AND applied_profile_version >= 1 AND applied_at IS NOT NULL)",
            name="ck_resume_import_drafts_applied_state",
        ),
        Index(
            "ix_resume_import_drafts_user_document",
            "user_id",
            "resume_document_id",
        ),
        Index(
            "ix_resume_import_drafts_user_status_updated_at",
            "user_id",
            "status",
            "updated_at",
        ),
    )

    resume_document_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey(
            "resume_parsing_results.resume_document_id",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )
    parsing_result_version: Mapped[int] = mapped_column(nullable=False)
    base_profile_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        nullable=True,
    )
    base_profile_version: Mapped[int | None] = mapped_column(
        nullable=True,
    )
    draft_version: Mapped[int] = mapped_column(
        nullable=False,
        default=1,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="ready",
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_action: Mapped[str] = mapped_column(String(32), nullable=False)
    education: Mapped[list[dict[str, object]]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    work_experiences: Mapped[list[dict[str, object]]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    project_experiences: Mapped[list[dict[str, object]]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    skills: Mapped[list[dict[str, object]]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    unresolved_items: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    skipped_items: Mapped[list[dict[str, object]]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    protected_items: Mapped[list[dict[str, object]]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    change_summary: Mapped[dict[str, int]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    applied_profile_version: Mapped[int | None] = mapped_column(
        nullable=True,
    )
    applied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
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

    document: Mapped[ResumeDocument] = relationship(
        "ResumeDocument",
        back_populates="import_draft",
        foreign_keys=[user_id, resume_document_id],
        passive_deletes=True,
        uselist=False,
    )
    parsing_result: Mapped[ResumeParsingResult] = relationship(
        "ResumeParsingResult",
        foreign_keys=[resume_document_id],
        passive_deletes=True,
        uselist=False,
        overlaps="document,import_draft",
    )


__all__ = ["ResumeImportDraft"]
