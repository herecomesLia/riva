from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
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
    from riva.models.user import User


class UserCompetency(Base):
    __tablename__ = "user_competencies"
    __table_args__ = (
        CheckConstraint(
            "length(trim(competency_key)) > 0 "
            "AND competency_key = lower(competency_key) "
            "AND competency_key ~ '^[a-z][a-z0-9]*([-_][a-z0-9]+)*$'",
            name="ck_user_competencies_competency_key",
        ),
        CheckConstraint(
            "level IS NULL OR (level >= 0 AND level <= 100)",
            name="ck_user_competencies_level",
        ),
        CheckConstraint(
            "confidence >= 0 AND confidence <= 100",
            name="ck_user_competencies_confidence",
        ),
        CheckConstraint(
            "evidence_count >= 0",
            name="ck_user_competencies_evidence_count",
        ),
        CheckConstraint(
            "trend IN ('insufficient', 'improving', 'stable', 'declining')",
            name="ck_user_competencies_trend",
        ),
        UniqueConstraint(
            "user_id",
            "competency_key",
            name="uq_user_competencies_user_key",
        ),
        UniqueConstraint(
            "user_id",
            "id",
            name="uq_user_competencies_user_id_id",
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
    competency_key: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    level: Mapped[int | None] = mapped_column(nullable=True)
    confidence: Mapped[int] = mapped_column(nullable=False, default=0)
    evidence_count: Mapped[int] = mapped_column(nullable=False, default=0)
    trend: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="insufficient",
    )
    last_evidence_at: Mapped[datetime | None] = mapped_column(
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
        back_populates="competencies",
        foreign_keys=[user_id],
        passive_deletes=True,
    )
    evidences: Mapped[list[CompetencyEvidence]] = relationship(
        back_populates="competency",
        cascade="all, delete-orphan",
        foreign_keys="[CompetencyEvidence.user_id, CompetencyEvidence.competency_id]",
        passive_deletes=True,
        order_by="CompetencyEvidence.occurred_at",
        overlaps="user",
    )


class CompetencyEvidence(Base):
    __tablename__ = "competency_evidence"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "competency_id"],
            ["user_competencies.user_id", "user_competencies.id"],
            ondelete="CASCADE",
            name="fk_competency_evidence_competency_owner",
        ),
        CheckConstraint(
            "("
            "source_type = 'practice' "
            "AND source_entity_type = 'practiceAttempt'"
            ") OR ("
            "source_type = 'interview' "
            "AND source_entity_type IN ('interviewTurn', 'interviewReview')"
            ")",
            name="ck_competency_evidence_source_type",
        ),
        CheckConstraint(
            "signal_type IN ('score', 'weakness', 'strength')",
            name="ck_competency_evidence_signal_type",
        ),
        CheckConstraint(
            "score IS NULL OR (score >= 0 AND score <= 100)",
            name="ck_competency_evidence_score",
        ),
        CheckConstraint(
            "("
            "signal_type = 'score' AND score IS NOT NULL"
            ") OR ("
            "signal_type IN ('weakness', 'strength') "
            "AND evidence_text IS NOT NULL "
            "AND length(trim(evidence_text)) > 0"
            ")",
            name="ck_competency_evidence_signal_payload",
        ),
        UniqueConstraint(
            "competency_id",
            "source_entity_type",
            "source_entity_id",
            "signal_type",
            name="uq_competency_evidence_source_entity_signal",
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
    competency_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
        index=True,
    )
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)
    source_session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )
    source_entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_entity_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        nullable=False,
    )
    signal_type: Mapped[str] = mapped_column(String(16), nullable=False)
    score: Mapped[int | None] = mapped_column(nullable=True)
    evidence_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[dict[str, object]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
        default=dict,
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    user: Mapped[User] = relationship(
        foreign_keys=[user_id],
        passive_deletes=True,
        overlaps="evidences,competency",
    )
    competency: Mapped[UserCompetency] = relationship(
        back_populates="evidences",
        foreign_keys=[user_id, competency_id],
        passive_deletes=True,
        overlaps="user",
    )
