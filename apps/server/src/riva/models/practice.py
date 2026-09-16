from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Annotated, Literal, Self
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, model_validator
from sqlalchemy import (
    CheckConstraint,
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
from riva.models.mixins import TaskStateMixin
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


class PracticeDimension(StrEnum):
    RELEVANCE = "relevance"
    STRUCTURE = "structure"
    SPECIFICITY = "specificity"
    CONTRIBUTION = "contribution"
    EVIDENCE = "evidence"
    ROLE_ALIGNMENT = "role_alignment"
    COMMUNICATION = "communication"
    RISK_AWARENESS = "risk_awareness"


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
    dimension: PracticeDimension = Field(
        description="""Scoring dimension:
- relevance: addresses the question's core requirements.
- structure: connects context, actions, decisions and outcomes coherently.
- specificity: provides concrete scenarios, technical details and precise descriptions.
- contribution: distinguishes personal responsibility and actions from team work.
- evidence: supports outcomes with facts, measurements, business value or verification.
- role_alignment: demonstrates abilities relevant to the target role and JD.
- communication: uses clear, natural language with useful information density (written answers only, not unobserved vocal delivery).
- risk_awareness: considers relevant risks, failure cases and boundaries."""
    )
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
    explanation: list[NonBlankStr] = Field(
        description="Specific reasons for the score, grounded in the candidate's actual answers and remaining gaps."
    )


class PracticeEvaluation(BaseModel):
    score: float = Field(ge=0, le=100, allow_inf_nan=False)
    dimensions: list[PracticeDimensionScore]

    @model_validator(mode="after")
    def validate_dimensions(self) -> Self:
        dimensions = [item.dimension for item in self.dimensions]
        if len(dimensions) != len(PracticeDimension) or set(dimensions) != set(
            PracticeDimension
        ):
            raise ValueError(
                "Evaluation must contain each scoring dimension exactly once"
            )
        return self


class PracticeReview(BaseModel):
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


class PracticeResult(BaseModel):
    evaluation: PracticeEvaluation
    review: PracticeReview


class PracticeSession(TaskStateMixin, Base):
    __tablename__ = "practice_sessions"
    __table_args__ = (
        CheckConstraint(
            "max_follow_ups >= 0", name="practice_max_follow_ups_nonnegative"
        ),
    )

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
    result: Mapped[PracticeResult | None] = mapped_column(PydanticJSONB(PracticeResult))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    turns: Mapped[list[PracticeTurn]] = relationship(
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="PracticeTurn.sequence",
    )


class PracticeTurn(Base):
    __tablename__ = "practice_turns"
    __table_args__ = (
        UniqueConstraint(
            "practice_id", "sequence", name="practice_turn_sequence_unique"
        ),
        CheckConstraint("sequence >= 0", name="practice_turn_sequence_nonnegative"),
        CheckConstraint(
            "length(btrim(content)) > 0", name="practice_turn_content_nonblank"
        ),
        CheckConstraint(
            "jsonb_typeof(criteria) = 'array'", name="practice_turn_criteria_array"
        ),
        # PydanticJSONB encodes Python None as JSON null, while SQL writers may use NULL.
        CheckConstraint(
            "(role = 'user' AND (guidance IS NULL OR guidance = 'null'::jsonb) "
            "AND criteria = '[]'::jsonb AND reference_answer IS NULL) OR "
            "(role = 'assistant' AND guidance IS NOT NULL AND guidance <> 'null'::jsonb "
            "AND reference_answer IS NOT NULL AND length(btrim(reference_answer)) > 0)",
            name="practice_turn_question_metadata",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    practice_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("practice_sessions.id", ondelete="CASCADE")
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
