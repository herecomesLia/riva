from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Annotated, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field
from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.db.types import PydanticJSONB
from riva.models.career_profile import CareerProfileContent
from riva.models.mixins import TaskStateMixin
from riva.models.role import RoleContent
from riva.models.types import NonBlankStr
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.role import Role


class PracticeQuestionType(StrEnum):
    PROJECT = "project"
    BEHAVIORAL = "behavioral"
    BUSINESS_UNDERSTANDING = "business_understanding"
    MOTIVATION = "motivation"
    TECHNICAL_BASICS = "technical_basics"


class PracticeDifficulty(StrEnum):
    BASIC = "basic"
    HARD = "hard"


class PracticeGuidance(BaseModel):
    hints: list[NonBlankStr] = Field(
        description="Concrete points to help the candidate address this question."
    )
    framework: list[NonBlankStr] = Field(
        description="Ordered steps for organizing an answer to this question."
    )


class PracticeCriterion(BaseModel):
    dimension: NonBlankStr = Field(
        description="Question-specific assessment area, not a fixed scoring dimension."
    )
    expectation: NonBlankStr = Field(
        description="What a satisfactory answer should demonstrate in this assessment area."
    )


class PracticeQuestionTurn(BaseModel):
    id: UUID
    role: Literal["assistant"] = "assistant"
    content: NonBlankStr
    guidance: PracticeGuidance
    criteria: list[PracticeCriterion]
    reference_answer: NonBlankStr


class PracticeAnswerTurn(BaseModel):
    id: UUID
    role: Literal["user"] = "user"
    content: NonBlankStr


type PracticeTurnContent = Annotated[
    PracticeQuestionTurn | PracticeAnswerTurn,
    Field(discriminator="role"),
]


class PracticeDimensionScore(BaseModel):
    score: int = Field(
        strict=True,
        ge=0,
        le=100,
        description=(
            "90-100: complete, clear and concretely supported; "
            "70-89: basically meets requirements with minor gaps; "
            "50-69: partially meets requirements but lacks key information; "
            "1-49: severely insufficient with limited relevant evidence; "
            "0: entirely fails requirements or provides no relevant evidence."
        ),
    )
    explanation: NonBlankStr = Field(
        description="Specific reasons for the score, grounded in the candidate's actual answers and remaining gaps."
    )


class PracticeDimensionScores(BaseModel):
    relevance: PracticeDimensionScore = Field(
        description="addresses the question's core requirements."
    )
    structure: PracticeDimensionScore = Field(
        description="connects context, actions, decisions and outcomes coherently."
    )
    specificity: PracticeDimensionScore = Field(
        description="provides concrete scenarios, technical details and precise descriptions."
    )
    contribution: PracticeDimensionScore = Field(
        description="distinguishes personal responsibility and actions from team work."
    )
    evidence: PracticeDimensionScore = Field(
        description="supports outcomes with facts, measurements, business value or verification."
    )
    role_alignment: PracticeDimensionScore = Field(
        description="demonstrates abilities relevant to the target role and JD."
    )
    communication: PracticeDimensionScore = Field(
        description="uses clear, natural language with useful information density (written answers only, not unobserved vocal delivery)."
    )
    risk_awareness: PracticeDimensionScore = Field(
        description="considers relevant risks, failure cases and boundaries."
    )


class PracticeResult(BaseModel):
    score: float = Field(ge=0, le=100, allow_inf_nan=False)
    dimension_scores: PracticeDimensionScores
    summary: NonBlankStr = Field(
        description="Overall assessment grounded in dimension scores, their explanations, actual answers and question criteria."
    )
    strengths: list[NonBlankStr] = Field(
        description="Strengths from dimensions scoring above 70 and their explanations, supported by actual answers; empty if none."
    )
    issues: list[NonBlankStr] = Field(
        description="Issues from dimensions scoring below 70 and their explanations, supported by actual answers; empty if none."
    )
    suggestions: list[NonBlankStr] = Field(
        description="Specific actionable improvements for the identified issues, grounded in question criteria and actual answers."
    )


class PracticeSession(Base):
    __tablename__ = "practice_sessions"

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("roles.id", ondelete="SET NULL"), index=True
    )
    # Captured at practice creation and refreshed immediately before role deletion.
    role_title_snapshot: Mapped[str] = mapped_column(String)
    role_company_snapshot: Mapped[str | None] = mapped_column(String)
    role: Mapped[Role | None] = relationship(lazy="selectin")
    # Immutable AI context, independent of the live role and display snapshots.
    profile_snapshot: Mapped[CareerProfileContent] = mapped_column(
        PydanticJSONB(CareerProfileContent)
    )
    role_snapshot: Mapped[RoleContent] = mapped_column(PydanticJSONB(RoleContent))
    question_type: Mapped[PracticeQuestionType] = mapped_column(
        Enum(
            PracticeQuestionType,
            values_callable=lambda enum: [member.value for member in enum],
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            name="practice_question_type",
        )
    )
    difficulty: Mapped[PracticeDifficulty] = mapped_column(
        Enum(
            PracticeDifficulty,
            values_callable=lambda enum: [member.value for member in enum],
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            name="practice_difficulty",
        )
    )
    max_follow_ups: Mapped[int]
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    rounds: Mapped[list[PracticeRound]] = relationship(
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="PracticeRound.sequence",
    )


class PracticeRound(TaskStateMixin, Base):
    __tablename__ = "practice_rounds"
    __table_args__ = (
        # Replacement rounds briefly share a sequence while the main turn is moved.
        UniqueConstraint(
            "practice_id",
            "sequence",
            name="practice_round_sequence_unique",
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    practice_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("practice_sessions.id", ondelete="CASCADE")
    )
    sequence: Mapped[int]
    result: Mapped[PracticeResult | None] = mapped_column(PydanticJSONB(PracticeResult))
    turns: Mapped[list[PracticeTurn]] = relationship(
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="PracticeTurn.sequence",
    )


class PracticeTurn(Base):
    __tablename__ = "practice_turns"
    __table_args__ = (
        UniqueConstraint("round_id", "sequence", name="practice_turn_sequence_unique"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    round_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("practice_rounds.id", ondelete="CASCADE")
    )
    sequence: Mapped[int]
    role: Mapped[str] = mapped_column(
        Enum(
            "assistant",
            "user",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            name="practice_turn_role",
        )
    )
    content: Mapped[str] = mapped_column(String)
    guidance: Mapped[PracticeGuidance | None] = mapped_column(
        PydanticJSONB(PracticeGuidance)
    )
    criteria: Mapped[list[PracticeCriterion]] = mapped_column(
        PydanticJSONB(list[PracticeCriterion]),
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    reference_answer: Mapped[str | None] = mapped_column(String)
