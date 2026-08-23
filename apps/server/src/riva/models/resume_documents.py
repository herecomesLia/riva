from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.resume_import_drafts import ResumeImportDraft
    from riva.models.resume_parsing_results import ResumeParsingResult
    from riva.models.user import User


class ResumeDocument(Base):
    __tablename__ = "resume_documents"
    __table_args__ = (
        CheckConstraint(
            "byte_size > 0",
            name="ck_resume_documents_byte_size_positive",
        ),
        CheckConstraint(
            "length(sha256) = 64",
            name="ck_resume_documents_sha256_length",
        ),
        CheckConstraint(
            "source_type IN ('file', 'pastedText')",
            name="ck_resume_documents_source_type",
        ),
        CheckConstraint(
            "extraction_status IN ('pending', 'succeeded', 'failed')",
            name="ck_resume_documents_extraction_status",
        ),
        CheckConstraint(
            "("
            "source_type = 'file' "
            "AND original_filename IS NOT NULL "
            "AND length(trim(original_filename)) > 0 "
            "AND storage_key IS NOT NULL "
            "AND length(trim(storage_key)) > 0"
            ") OR ("
            "source_type = 'pastedText' "
            "AND original_filename IS NULL "
            "AND storage_key IS NULL "
            "AND media_type = 'text/plain'"
            ")",
            name="ck_resume_documents_source_fields",
        ),
        CheckConstraint(
            "("
            "extraction_status = 'pending' "
            "AND extracted_text IS NULL "
            "AND extraction_failure_code IS NULL "
            "AND extracted_at IS NULL"
            ") OR ("
            "extraction_status = 'succeeded' "
            "AND extracted_text IS NOT NULL "
            "AND length(trim(extracted_text)) > 0 "
            "AND extraction_failure_code IS NULL "
            "AND extracted_at IS NOT NULL"
            ") OR ("
            "extraction_status = 'failed' "
            "AND extracted_text IS NULL "
            "AND extraction_failure_code IS NOT NULL "
            "AND length(trim(extraction_failure_code)) > 0 "
            "AND extracted_at IS NOT NULL"
            ")",
            name="ck_resume_documents_extraction_fields",
        ),
        UniqueConstraint(
            "user_id",
            "id",
            name="uq_resume_documents_user_id_id",
        ),
        UniqueConstraint(
            "storage_key",
            name="uq_resume_documents_storage_key",
        ),
        Index(
            "ix_resume_documents_user_uploaded_at",
            "user_id",
            "uploaded_at",
        ),
        Index(
            "ix_resume_documents_extraction_status",
            "extraction_status",
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
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    media_type: Mapped[str] = mapped_column(String(127), nullable=False)
    byte_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_key: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
    )
    extraction_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="pending",
    )
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extraction_failure_code: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    extracted_at: Mapped[datetime | None] = mapped_column(
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

    user: Mapped[User] = relationship(
        back_populates="resume_documents",
        foreign_keys=[user_id],
    )
    parsing_result: Mapped[ResumeParsingResult | None] = relationship(
        back_populates="document",
        passive_deletes=True,
        uselist=False,
    )
    import_draft: Mapped[ResumeImportDraft | None] = relationship(
        "ResumeImportDraft",
        back_populates="document",
        foreign_keys=(
            "[ResumeImportDraft.user_id, ResumeImportDraft.resume_document_id]"
        ),
        passive_deletes=True,
        uselist=False,
    )
