from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
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
    from riva.models.agent_runs import AgentRun
    from riva.models.practice_sessions import PracticeAttempt


class PracticeAnswer(Base):
    __tablename__ = "practice_answers"
    __table_args__ = (
        CheckConstraint(
            '"order" >= 1',
            name="ck_practice_answers_order",
        ),
        CheckConstraint(
            "length(trim(content)) > 0 AND length(content) <= 20000",
            name="ck_practice_answers_content",
        ),
        CheckConstraint(
            "((kind = 'main' AND \"order\" = 1 AND follow_up_question_id IS NULL) "
            "OR (kind = 'followUp' AND \"order\" >= 2 "
            "AND follow_up_question_id IS NOT NULL))",
            name="ck_practice_answers_kind_order_question",
        ),
        UniqueConstraint(
            "attempt_id",
            "order",
            name="uq_practice_answers_attempt_order",
        ),
        UniqueConstraint(
            "follow_up_question_id",
            name="uq_practice_answers_follow_up_question",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    attempt_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("practice_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    order: Mapped[int] = mapped_column(nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    follow_up_question_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("practice_follow_up_questions.id", ondelete="CASCADE"),
        nullable=True,
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    attempt: Mapped[PracticeAttempt] = relationship(
        back_populates="answers",
        passive_deletes=True,
    )
    follow_up_question: Mapped[PracticeFollowUpQuestion | None] = relationship(
        back_populates="answer",
        foreign_keys=[follow_up_question_id],
        passive_deletes=True,
    )


class PracticeFollowUpQuestion(Base):
    __tablename__ = "practice_follow_up_questions"
    __table_args__ = (
        CheckConstraint(
            '"order" >= 1',
            name="ck_practice_follow_up_questions_order",
        ),
        CheckConstraint(
            "length(trim(prompt)) > 0 AND length(prompt) <= 4000",
            name="ck_practice_follow_up_questions_prompt",
        ),
        CheckConstraint(
            "length(trim(focus)) > 0 AND length(focus) <= 1000",
            name="ck_practice_follow_up_questions_focus",
        ),
        UniqueConstraint(
            "attempt_id",
            "order",
            name="uq_practice_follow_up_questions_attempt_order",
        ),
        UniqueConstraint(
            "source_agent_run_id",
            name="uq_practice_follow_up_questions_source_run",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    attempt_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("practice_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_agent_run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    order: Mapped[int] = mapped_column(nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    focus: Mapped[str] = mapped_column(Text, nullable=False)
    answer_hints: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    answer_framework: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    attempt: Mapped[PracticeAttempt] = relationship(
        back_populates="follow_up_questions",
        passive_deletes=True,
    )
    source_agent_run: Mapped[AgentRun] = relationship(
        foreign_keys=[source_agent_run_id],
        passive_deletes=True,
    )
    answer: Mapped[PracticeAnswer | None] = relationship(
        back_populates="follow_up_question",
        foreign_keys="PracticeAnswer.follow_up_question_id",
        uselist=False,
        passive_deletes=True,
    )


__all__ = ["PracticeAnswer", "PracticeFollowUpQuestion"]
