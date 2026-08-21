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
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.agent_runs import AgentRun
    from riva.models.practice_interactions import PracticeFollowUpQuestion
    from riva.models.question_cards import QuestionCard


class PracticeQuestionReferenceContext(Base):
    __tablename__ = "practice_question_reference_contexts"

    question_card_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("question_cards.id", ondelete="CASCADE"),
        primary_key=True,
    )
    frozen_context: Mapped[dict[str, object]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    question_card: Mapped[QuestionCard] = relationship(
        foreign_keys=[question_card_id],
        passive_deletes=True,
    )


class PracticeReferenceAnswerArtifact(Base):
    __tablename__ = "practice_reference_answers"
    __table_args__ = (
        CheckConstraint(
            "((target_type = 'main' "
            "AND follow_up_question_id IS NULL "
            "AND kind IN ('personalizedExample', 'technicalReference') "
            "AND addressed_gap IS NULL) OR "
            "(target_type = 'followUp' "
            "AND follow_up_question_id IS NOT NULL "
            "AND kind IN ('personalizedSupplement', 'technicalReference') "
            "AND addressed_gap IS NOT NULL "
            "AND length(trim(addressed_gap)) > 0))",
            name="ck_practice_reference_answers_target_kind",
        ),
        UniqueConstraint(
            "source_agent_run_id",
            name="uq_practice_reference_answers_source_run",
        ),
        Index(
            "uq_practice_reference_answers_main_target",
            "question_card_id",
            unique=True,
            postgresql_where=text("target_type = 'main'"),
            sqlite_where=text("target_type = 'main'"),
        ),
        Index(
            "uq_practice_reference_answers_follow_up_target",
            "follow_up_question_id",
            unique=True,
            postgresql_where=text("target_type = 'followUp'"),
            sqlite_where=text("target_type = 'followUp'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    question_card_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("question_cards.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    follow_up_question_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("practice_follow_up_questions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    source_agent_run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_type: Mapped[str] = mapped_column(String(16), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    addressed_gap: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    key_points: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    common_mistakes: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    question_card: Mapped[QuestionCard] = relationship(
        foreign_keys=[question_card_id],
        passive_deletes=True,
    )
    follow_up_question: Mapped[PracticeFollowUpQuestion | None] = relationship(
        foreign_keys=[follow_up_question_id],
        passive_deletes=True,
    )
    source_agent_run: Mapped[AgentRun] = relationship(
        foreign_keys=[source_agent_run_id],
        passive_deletes=True,
    )


__all__ = [
    "PracticeQuestionReferenceContext",
    "PracticeReferenceAnswerArtifact",
]
