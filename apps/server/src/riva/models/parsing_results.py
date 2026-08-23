from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.resumes import ResumeDocument


class ResumeParsingResult(Base):
    __tablename__ = "resume_parsing_results"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "resume_document_id"],
            ["resume_documents.user_id", "resume_documents.id"],
            ondelete="CASCADE",
            name="fk_resume_parsing_results_document_owner",
        ),
        CheckConstraint(
            "result_version >= 1",
            name="ck_resume_parsing_results_result_version",
        ),
        Index(
            "ix_resume_parsing_results_user_document",
            "user_id",
            "resume_document_id",
        ),
        Index(
            "ix_resume_parsing_results_parsed_at",
            "parsed_at",
        ),
    )

    resume_document_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )
    result_version: Mapped[int] = mapped_column(
        nullable=False,
        default=1,
    )
    parsed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    skills: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    unresolved_items: Mapped[list[str]] = mapped_column(
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

    document: Mapped[ResumeDocument] = relationship(
        back_populates="parsing_result",
        foreign_keys=[user_id, resume_document_id],
    )
