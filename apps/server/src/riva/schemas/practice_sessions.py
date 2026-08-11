from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, field_validator

from riva.core.language import InteractionLanguage
from riva.schemas.base import APIModel
from riva.schemas.profile import StandardUUID
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardMaterialList,
    QuestionCardPrompt,
    QuestionCardQuestionType,
    QuestionCardTextList,
)


class PracticeQuestionSource(StrEnum):
    PERSONALIZED = "personalized"
    SAVED = "saved"
    HISTORY = "history"


class PracticeSessionStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"


class PracticeSessionCompletionReason(StrEnum):
    REVIEW_COMPLETED = "reviewCompleted"
    USER_ENDED_EARLY = "userEndedEarly"


class PracticeAttemptStatus(StrEnum):
    GENERATING_QUESTION = "generatingQuestion"
    ANSWERING = "answering"
    ANSWERING_FOLLOW_UP = "answeringFollowUp"
    EVALUATING = "evaluating"
    REVIEW = "review"
    COMPLETED = "completed"
    ENDED_EARLY = "endedEarly"


class PracticeSessionSelection(APIModel):
    model_config = ConfigDict(extra="forbid")

    target_role_id: StandardUUID
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty
    source: PracticeQuestionSource
    prioritize_weaknesses: bool


class StartPracticeSessionRequest(PracticeSessionSelection):
    """The client-controlled selection for a new practice session."""

    model_config = ConfigDict(extra="forbid")


class RefreshPracticeQuestionGenerationRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]


class PracticeAPIModel(APIModel):
    model_config = ConfigDict(extra="forbid")


class PracticeGuidanceNotRequestedResponse(PracticeAPIModel):
    status: Literal["notRequested"]
    content: None = None


class PracticeReferenceAnswerNotRequestedResponse(PracticeAPIModel):
    status: Literal["notRequested"]
    content: None = None
    viewed_before_submission: Literal[False] = False


class PracticeQuestionResponse(PracticeAPIModel):
    id: StandardUUID
    prompt: QuestionCardPrompt
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty
    assessed_capabilities: QuestionCardTextList
    recommended_materials: QuestionCardMaterialList
    answer_hints: PracticeGuidanceNotRequestedResponse = Field(
        default_factory=lambda: PracticeGuidanceNotRequestedResponse(
            status="notRequested"
        )
    )
    answer_framework: PracticeGuidanceNotRequestedResponse = Field(
        default_factory=lambda: PracticeGuidanceNotRequestedResponse(
            status="notRequested"
        )
    )
    reference_answer: PracticeReferenceAnswerNotRequestedResponse = Field(
        default_factory=lambda: PracticeReferenceAnswerNotRequestedResponse(
            status="notRequested"
        )
    )
    is_saved: bool
    is_marked_weak: bool


class PracticeActiveSessionBase(PracticeAPIModel):
    session_id: StandardUUID
    language: InteractionLanguage
    version: Annotated[int, Field(ge=1)]
    selection: PracticeSessionSelection
    started_at: datetime
    attempt_id: StandardUUID
    attempt_number: Annotated[int, Field(ge=1)]

    @field_validator("started_at")
    @classmethod
    def validate_aware_started_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamps must be timezone-aware")
        return value


class PracticeGeneratingQuestionResponse(PracticeActiveSessionBase):
    status: Literal["generatingQuestion"]


class PracticeAnsweringResponse(PracticeActiveSessionBase):
    status: Literal["answering"]
    question: PracticeQuestionResponse


PracticeActiveSessionResponse = Annotated[
    PracticeGeneratingQuestionResponse | PracticeAnsweringResponse,
    Field(discriminator="status"),
]


__all__ = [
    "PracticeAttemptStatus",
    "PracticeActiveSessionBase",
    "PracticeActiveSessionResponse",
    "PracticeAnsweringResponse",
    "PracticeGeneratingQuestionResponse",
    "PracticeGuidanceNotRequestedResponse",
    "PracticeQuestionSource",
    "PracticeQuestionResponse",
    "PracticeReferenceAnswerNotRequestedResponse",
    "PracticeSessionCompletionReason",
    "PracticeSessionSelection",
    "PracticeSessionStatus",
    "RefreshPracticeQuestionGenerationRequest",
    "StartPracticeSessionRequest",
]
