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
    Index,
    Integer,
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
    from riva.models.roles import TargetRole
    from riva.models.user import User


class InterviewSession(Base):
    __tablename__ = "interview_sessions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "target_role_id"],
            ["target_roles.user_id", "target_roles.id"],
            ondelete="CASCADE",
            name="fk_interview_sessions_target_role_owner",
        ),
        CheckConstraint(
            "language IN ('zh-CN', 'en')",
            name="ck_interview_sessions_language",
        ),
        CheckConstraint(
            "version >= 1",
            name="ck_interview_sessions_version",
        ),
        CheckConstraint(
            "status IN ('opening', 'question', 'followUp', 'candidateQuestions', 'completed')",
            name="ck_interview_sessions_status",
        ),
        CheckConstraint(
            "round IN ('hr', 'firstBusiness', 'technical', 'manager', 'final', 'comprehensive')",
            name="ck_interview_sessions_round",
        ),
        CheckConstraint(
            "difficulty IN ('basic', 'pressure')",
            name="ck_interview_sessions_difficulty",
        ),
        CheckConstraint(
            "duration_minutes IN (15, 30, 45)",
            name="ck_interview_sessions_duration_minutes",
        ),
        CheckConstraint(
            "plan_revision >= 0",
            name="ck_interview_sessions_plan_revision",
        ),
        CheckConstraint(
            "total_main_questions IS NULL OR total_main_questions >= 1",
            name="ck_interview_sessions_total_main_questions",
        ),
        CheckConstraint(
            "(status = 'completed' AND completed_at IS NOT NULL "
            "AND completion_reason IS NOT NULL) OR "
            "(status <> 'completed' AND completed_at IS NULL "
            "AND completion_reason IS NULL)",
            name="ck_interview_sessions_completion_state",
        ),
        Index(
            "uq_interview_sessions_active_user",
            "user_id",
            unique=True,
            postgresql_where=text("status <> 'completed'"),
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
    language: Mapped[str] = mapped_column(String(16), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="opening",
    )
    round: Mapped[str] = mapped_column(String(32), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(32), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completion_reason: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    plan_revision: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    total_main_questions: Mapped[int | None] = mapped_column(
        Integer,
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
        back_populates="interview_sessions",
        foreign_keys=[user_id],
        passive_deletes=True,
    )
    target_role: Mapped[TargetRole] = relationship(
        back_populates="interview_sessions",
        foreign_keys=[user_id, target_role_id],
        passive_deletes=True,
        overlaps="user,interview_sessions",
    )
    plans: Mapped[list[InterviewPlan]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewPlan.revision",
    )
    questions: Mapped[list[InterviewQuestion]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewQuestion.order",
    )
    answers: Mapped[list[InterviewAnswer]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewAnswer.submitted_at",
    )
    follow_up_questions: Mapped[list[InterviewFollowUpQuestion]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewFollowUpQuestion.created_at",
    )
    follow_up_answers: Mapped[list[InterviewFollowUpAnswer]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewFollowUpAnswer.submitted_at",
    )
    turn_assessments: Mapped[list[InterviewTurnAssessment]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewTurnAssessment.created_at",
    )
    candidate_questions: Mapped[list[InterviewCandidateQuestion]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewCandidateQuestion.order",
    )
    candidate_question_exchanges: Mapped[list[InterviewCandidateQuestionExchange]] = (
        relationship(
            back_populates="session",
            cascade="all, delete-orphan",
            passive_deletes=True,
            order_by="InterviewCandidateQuestionExchange.created_at",
        )
    )
    review: Mapped[InterviewReview | None] = relationship(
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class InterviewPlan(Base):
    __tablename__ = "interview_plans"
    __table_args__ = (
        CheckConstraint(
            "revision >= 1",
            name="ck_interview_plans_revision",
        ),
        CheckConstraint(
            "total_main_questions >= 1",
            name="ck_interview_plans_total_main_questions",
        ),
        UniqueConstraint(
            "session_id",
            "revision",
            name="uq_interview_plans_session_revision",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    total_main_questions: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    questions: Mapped[list[dict[str, object]]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    session: Mapped[InterviewSession] = relationship(
        back_populates="plans",
    )
    questions_records: Mapped[list[InterviewQuestion]] = relationship(
        back_populates="source_plan",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewQuestion.order",
    )


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"
    __table_args__ = (
        CheckConstraint(
            "plan_revision >= 1",
            name="ck_interview_questions_plan_revision",
        ),
        CheckConstraint(
            '"order" >= 1',
            name="ck_interview_questions_order",
        ),
        CheckConstraint(
            "length(trim(prompt)) > 0",
            name="ck_interview_questions_prompt_not_blank",
        ),
        CheckConstraint(
            "question_type IN ("
            "'selfIntroduction', 'projectDeepDive', 'roleCapability', "
            "'behavioral', 'technicalOrBusiness', 'resumeRisk', 'motivation'"
            ")",
            name="ck_interview_questions_type",
        ),
        UniqueConstraint(
            "session_id",
            "order",
            name="uq_interview_questions_session_order",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_plan_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    order: Mapped[int] = mapped_column("order", Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(String(64), nullable=False)
    assessed_capabilities: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    session: Mapped[InterviewSession] = relationship(
        back_populates="questions",
    )
    source_plan: Mapped[InterviewPlan] = relationship(
        back_populates="questions_records",
    )
    answer: Mapped[InterviewAnswer | None] = relationship(
        back_populates="question",
        uselist=False,
        passive_deletes=True,
    )
    follow_up_questions: Mapped[list[InterviewFollowUpQuestion]] = relationship(
        back_populates="parent_question",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewFollowUpQuestion.order",
    )
    turn_assessments: Mapped[list[InterviewTurnAssessment]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="InterviewTurnAssessment.created_at",
    )


class InterviewAnswer(Base):
    __tablename__ = "interview_answers"
    __table_args__ = (
        CheckConstraint(
            "length(trim(content)) > 0 AND length(content) <= 20000",
            name="ck_interview_answers_content",
        ),
        UniqueConstraint(
            "question_id",
            name="uq_interview_answers_question",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_questions.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    session: Mapped[InterviewSession] = relationship(
        back_populates="answers",
    )
    question: Mapped[InterviewQuestion] = relationship(
        back_populates="answer",
        uselist=False,
    )
    assessments: Mapped[list[InterviewTurnAssessment]] = relationship(
        back_populates="main_answer",
        foreign_keys="InterviewTurnAssessment.main_answer_id",
        passive_deletes=True,
    )


class InterviewFollowUpQuestion(Base):
    __tablename__ = "interview_follow_up_questions"
    __table_args__ = (
        CheckConstraint(
            '"order" >= 1',
            name="ck_interview_follow_up_questions_order",
        ),
        CheckConstraint(
            "length(trim(prompt)) > 0 AND length(prompt) <= 4000",
            name="ck_interview_follow_up_questions_prompt",
        ),
        UniqueConstraint(
            "parent_question_id",
            "order",
            name="uq_interview_follow_up_questions_parent_order",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_question_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order: Mapped[int] = mapped_column("order", Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    session: Mapped[InterviewSession] = relationship(
        back_populates="follow_up_questions",
    )
    parent_question: Mapped[InterviewQuestion] = relationship(
        back_populates="follow_up_questions",
    )
    answer: Mapped[InterviewFollowUpAnswer | None] = relationship(
        back_populates="follow_up_question",
        uselist=False,
        passive_deletes=True,
    )


class InterviewFollowUpAnswer(Base):
    __tablename__ = "interview_follow_up_answers"
    __table_args__ = (
        CheckConstraint(
            "length(trim(content)) > 0 AND length(content) <= 20000",
            name="ck_interview_follow_up_answers_content",
        ),
        UniqueConstraint(
            "follow_up_question_id",
            name="uq_interview_follow_up_answers_question",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    follow_up_question_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_follow_up_questions.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    session: Mapped[InterviewSession] = relationship(
        back_populates="follow_up_answers",
    )
    follow_up_question: Mapped[InterviewFollowUpQuestion] = relationship(
        back_populates="answer",
        uselist=False,
    )
    assessments: Mapped[list[InterviewTurnAssessment]] = relationship(
        back_populates="follow_up_answer",
        foreign_keys="InterviewTurnAssessment.follow_up_answer_id",
        passive_deletes=True,
    )


class InterviewTurnAssessment(Base):
    __tablename__ = "interview_turn_assessments"
    __table_args__ = (
        CheckConstraint(
            "score >= 0 AND score <= 100",
            name="ck_interview_turn_assessments_score",
        ),
        CheckConstraint(
            "decision IN ('followUp', 'completeQuestion')",
            name="ck_interview_turn_assessments_decision",
        ),
        CheckConstraint(
            "((main_answer_id IS NOT NULL AND follow_up_answer_id IS NULL) OR "
            "(main_answer_id IS NULL AND follow_up_answer_id IS NOT NULL))",
            name="ck_interview_turn_assessments_exactly_one_answer",
        ),
        UniqueConstraint(
            "main_answer_id",
            name="uq_interview_turn_assessments_main_answer",
        ),
        UniqueConstraint(
            "follow_up_answer_id",
            name="uq_interview_turn_assessments_follow_up_answer",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    main_answer_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_answers.id", ondelete="CASCADE"),
        nullable=True,
    )
    follow_up_answer_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_follow_up_answers.id", ondelete="CASCADE"),
        nullable=True,
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    strengths: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    issues: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    session: Mapped[InterviewSession] = relationship(
        back_populates="turn_assessments",
    )
    question: Mapped[InterviewQuestion] = relationship(
        back_populates="turn_assessments",
    )
    main_answer: Mapped[InterviewAnswer | None] = relationship(
        back_populates="assessments",
        foreign_keys=[main_answer_id],
        uselist=False,
        passive_deletes=True,
    )
    follow_up_answer: Mapped[InterviewFollowUpAnswer | None] = relationship(
        back_populates="assessments",
        foreign_keys=[follow_up_answer_id],
        uselist=False,
        passive_deletes=True,
    )


class InterviewCandidateQuestion(Base):
    __tablename__ = "interview_candidate_questions"
    __table_args__ = (
        CheckConstraint(
            "length(trim(content)) > 0 AND length(content) <= 4000",
            name="ck_interview_candidate_questions_content",
        ),
        CheckConstraint(
            '"order" >= 1',
            name="ck_interview_candidate_questions_order",
        ),
        UniqueConstraint(
            "session_id",
            "order",
            name="uq_interview_candidate_questions_session_order",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    order: Mapped[int] = mapped_column("order", Integer, nullable=False)

    session: Mapped[InterviewSession] = relationship(
        back_populates="candidate_questions",
    )
    exchange: Mapped[InterviewCandidateQuestionExchange | None] = relationship(
        back_populates="question",
        uselist=False,
        cascade="all, delete-orphan",
        single_parent=True,
        passive_deletes=True,
    )


class InterviewCandidateQuestionExchange(Base):
    __tablename__ = "interview_candidate_question_exchanges"
    __table_args__ = (
        CheckConstraint(
            "length(trim(interviewer_answer)) > 0",
            name="ck_interview_candidate_question_exchanges_answer",
        ),
        CheckConstraint(
            "length(trim(feedback_summary)) > 0",
            name="ck_interview_candidate_question_exchanges_feedback",
        ),
        UniqueConstraint(
            "question_id",
            name="uq_interview_candidate_question_exchanges_question",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_candidate_questions.id", ondelete="CASCADE"),
        nullable=False,
    )
    interviewer_answer: Mapped[str] = mapped_column(Text, nullable=False)
    feedback_summary: Mapped[str] = mapped_column(Text, nullable=False)
    strengths: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    improvement_suggestions: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    suggested_alternatives: Mapped[list[str]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    session: Mapped[InterviewSession] = relationship(
        back_populates="candidate_question_exchanges",
    )
    question: Mapped[InterviewCandidateQuestion] = relationship(
        back_populates="exchange",
        uselist=False,
    )


class InterviewReview(Base):
    __tablename__ = "interview_reviews"
    __table_args__ = (
        CheckConstraint(
            "status IN ('unavailable', 'partial', 'complete')",
            name="ck_interview_reviews_status",
        ),
        UniqueConstraint(
            "session_id",
            name="uq_interview_reviews_session",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    review: Mapped[dict[str, object] | None] = mapped_column(
        JSON(none_as_null=True),
        nullable=True,
    )
    question_details: Mapped[list[dict[str, object]]] = mapped_column(
        JSON(none_as_null=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    session: Mapped[InterviewSession] = relationship(
        back_populates="review",
    )
