from enum import StrEnum
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from riva.models.types import NonBlankStr


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


type PracticeTurn = Annotated[
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
