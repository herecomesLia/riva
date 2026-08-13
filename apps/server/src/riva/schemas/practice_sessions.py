from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, field_validator

from riva.core.language import InteractionLanguage
from riva.schemas.base import APIModel
from riva.schemas.evaluation import (
    MAX_PRACTICE_EVALUATION_DIMENSIONS,
    PracticeDimensionScore,
    PracticeEvaluationScore,
)
from riva.schemas.practice_interactions import (
    MAX_PRACTICE_FOLLOW_UPS,
    PracticeAnswerContent,
)
from riva.schemas.practice_recommendation import PracticeRecommendationOutput
from riva.schemas.practice_review import (
    MAX_PRACTICE_REVIEW_ITEMS,
    ReviewItem,
    ReviewOverallPerformance,
    ReviewWeakness,
)
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


class ContinuePracticeQuestionRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]
    question_id: StandardUUID


class RetryPracticeQuestionRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]
    question_id: StandardUUID


class RefreshPracticeQuestionGenerationRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]


class SubmitPrimaryAnswerRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]
    question_id: StandardUUID
    content: PracticeAnswerContent


class SubmitFollowUpAnswerRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]
    question_id: StandardUUID
    follow_up_question_id: StandardUUID
    content: PracticeAnswerContent


class RefreshPracticeFollowUpGenerationRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]


class RefreshPracticeEvaluationRequest(APIModel):
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


def _validate_aware_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamps must be timezone-aware")
    return value


class PracticeAnswerResponse(PracticeAPIModel):
    id: StandardUUID
    content: PracticeAnswerContent
    created_at: datetime
    order: Annotated[int, Field(ge=1)]

    _validate_created_at = field_validator("created_at")(_validate_aware_timestamp)


class PracticeFollowUpQuestionResponse(PracticeAPIModel):
    id: StandardUUID
    prompt: QuestionCardPrompt
    created_at: datetime
    order: Annotated[
        int,
        Field(ge=1, le=MAX_PRACTICE_FOLLOW_UPS),
    ]
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

    _validate_created_at = field_validator("created_at")(_validate_aware_timestamp)


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


class PracticeAwaitingFollowUpExchangeResponse(PracticeAPIModel):
    status: Literal["awaitingAnswer"]
    question: PracticeFollowUpQuestionResponse
    answer: None = None


class PracticeAnsweredFollowUpExchangeResponse(PracticeAPIModel):
    status: Literal["answered"]
    question: PracticeFollowUpQuestionResponse
    answer: PracticeAnswerResponse

    @field_validator("answer")
    @classmethod
    def validate_answer_order(
        cls,
        answer: PracticeAnswerResponse,
        info,
    ) -> PracticeAnswerResponse:
        question = info.data.get("question")
        if question is not None and answer.order != question.order + 1:
            raise ValueError("answered follow-up exchange order is invalid")
        return answer


def _validate_answered_exchange_orders(
    exchanges: list[PracticeAnsweredFollowUpExchangeResponse],
) -> None:
    if [exchange.question.order for exchange in exchanges] != list(
        range(1, len(exchanges) + 1)
    ) or len({exchange.question.id for exchange in exchanges}) != len(
        exchanges
    ) or len({exchange.answer.id for exchange in exchanges}) != len(exchanges):
        raise ValueError("follow-up exchanges must be ordered and contiguous")


class PracticeGeneratingFollowUpResponse(PracticeActiveSessionBase):
    status: Literal["generatingFollowUp"]
    question: PracticeQuestionResponse
    main_answer: PracticeAnswerResponse
    follow_up_exchanges: list[PracticeAnsweredFollowUpExchangeResponse] = Field(
        default_factory=list,
        max_length=MAX_PRACTICE_FOLLOW_UPS,
    )

    @field_validator("follow_up_exchanges")
    @classmethod
    def validate_follow_up_exchanges(
        cls,
        exchanges: list[PracticeAnsweredFollowUpExchangeResponse],
    ) -> list[PracticeAnsweredFollowUpExchangeResponse]:
        _validate_answered_exchange_orders(exchanges)
        if len(exchanges) > 1:
            raise ValueError(
                "generating follow-up may only contain the first exchange"
            )
        return exchanges


class PracticeAnsweringFollowUpResponse(PracticeActiveSessionBase):
    status: Literal["answeringFollowUp"]
    question: PracticeQuestionResponse
    main_answer: PracticeAnswerResponse
    follow_up_exchanges: list[PracticeAnsweredFollowUpExchangeResponse] = Field(
        default_factory=list,
        max_length=MAX_PRACTICE_FOLLOW_UPS,
    )
    current_follow_up: PracticeAwaitingFollowUpExchangeResponse

    @field_validator("follow_up_exchanges")
    @classmethod
    def validate_follow_up_exchanges(
        cls,
        exchanges: list[PracticeAnsweredFollowUpExchangeResponse],
    ) -> list[PracticeAnsweredFollowUpExchangeResponse]:
        _validate_answered_exchange_orders(exchanges)
        if len(exchanges) > 1:
            raise ValueError(
                "answering follow-up may only contain the first exchange"
            )
        return exchanges

    @field_validator("current_follow_up")
    @classmethod
    def validate_current_follow_up_order(
        cls,
        current_follow_up: PracticeAwaitingFollowUpExchangeResponse,
        info,
    ) -> PracticeAwaitingFollowUpExchangeResponse:
        exchanges = info.data.get("follow_up_exchanges", [])
        if current_follow_up.question.order != len(exchanges) + 1:
            raise ValueError("current follow-up order is invalid")
        return current_follow_up


class PracticeNoFollowUpRequiredCompletionResponse(PracticeAPIModel):
    status: Literal["completed"]
    reason: Literal["noFollowUpRequired"]


class PracticeAllAnsweredCompletionResponse(PracticeAPIModel):
    status: Literal["completed"]
    reason: Literal["allAnswered"]


PracticeCompletedFollowUpCompletionResponse = Annotated[
    PracticeNoFollowUpRequiredCompletionResponse
    | PracticeAllAnsweredCompletionResponse,
    Field(discriminator="reason"),
]


class PracticeEvaluatingResponse(PracticeActiveSessionBase):
    status: Literal["evaluating"]
    question: PracticeQuestionResponse
    main_answer: PracticeAnswerResponse
    follow_up_exchanges: list[PracticeAnsweredFollowUpExchangeResponse] = Field(
        default_factory=list,
        max_length=MAX_PRACTICE_FOLLOW_UPS,
    )
    follow_up_completion: PracticeCompletedFollowUpCompletionResponse
    submitted_at: datetime

    _validate_submitted_at = field_validator("submitted_at")(
        _validate_aware_timestamp
    )

    @field_validator("follow_up_exchanges")
    @classmethod
    def validate_follow_up_exchanges(
        cls,
        exchanges: list[PracticeAnsweredFollowUpExchangeResponse],
    ) -> list[PracticeAnsweredFollowUpExchangeResponse]:
        _validate_answered_exchange_orders(exchanges)
        return exchanges

    @field_validator("follow_up_completion")
    @classmethod
    def validate_follow_up_completion(
        cls,
        completion: PracticeCompletedFollowUpCompletionResponse,
        info,
    ) -> PracticeCompletedFollowUpCompletionResponse:
        exchanges = info.data.get("follow_up_exchanges", [])
        if completion.reason == "noFollowUpRequired" and exchanges:
            raise ValueError("no-follow-up completion must have no exchanges")
        if completion.reason == "allAnswered" and len(exchanges) not in (1, 2):
            raise ValueError("all-answered completion must have one or two exchanges")
        return completion


class PracticeEvaluationResponse(PracticeAPIModel):
    overall_score: PracticeEvaluationScore
    dimension_scores: Annotated[
        list[PracticeDimensionScore],
        Field(min_length=4, max_length=MAX_PRACTICE_EVALUATION_DIMENSIONS),
    ]
    evaluated_at: datetime

    _validate_evaluated_at = field_validator("evaluated_at")(
        _validate_aware_timestamp
    )


class PracticeReviewContentResponse(PracticeAPIModel):
    overall_performance: ReviewOverallPerformance
    highlights: Annotated[
        list[ReviewItem],
        Field(max_length=MAX_PRACTICE_REVIEW_ITEMS),
    ] = Field(default_factory=list)
    main_issues: Annotated[
        list[ReviewItem],
        Field(max_length=MAX_PRACTICE_REVIEW_ITEMS),
    ] = Field(default_factory=list)
    improvement_suggestions: Annotated[
        list[ReviewItem],
        Field(max_length=MAX_PRACTICE_REVIEW_ITEMS),
    ] = Field(default_factory=list)
    reusable_answer_structure: Annotated[
        list[ReviewItem],
        Field(max_length=MAX_PRACTICE_REVIEW_ITEMS),
    ] = Field(default_factory=list)
    exposed_weaknesses: Annotated[
        list[ReviewWeakness],
        Field(max_length=MAX_PRACTICE_REVIEW_ITEMS),
    ] = Field(default_factory=list)
    recommendation: PracticeRecommendationOutput


class PracticeReviewResponse(PracticeActiveSessionBase):
    status: Literal["review"]
    question: PracticeQuestionResponse
    main_answer: PracticeAnswerResponse
    follow_up_exchanges: list[PracticeAnsweredFollowUpExchangeResponse] = Field(
        default_factory=list,
        max_length=MAX_PRACTICE_FOLLOW_UPS,
    )
    follow_up_completion: PracticeCompletedFollowUpCompletionResponse
    evaluation: PracticeEvaluationResponse
    review: PracticeReviewContentResponse

    @field_validator("follow_up_exchanges")
    @classmethod
    def validate_follow_up_exchanges(
        cls,
        exchanges: list[PracticeAnsweredFollowUpExchangeResponse],
    ) -> list[PracticeAnsweredFollowUpExchangeResponse]:
        _validate_answered_exchange_orders(exchanges)
        return exchanges

    @field_validator("follow_up_completion")
    @classmethod
    def validate_follow_up_completion(
        cls,
        completion: PracticeCompletedFollowUpCompletionResponse,
        info,
    ) -> PracticeCompletedFollowUpCompletionResponse:
        exchanges = info.data.get("follow_up_exchanges", [])
        if completion.reason == "noFollowUpRequired" and exchanges:
            raise ValueError("no-follow-up completion must have no exchanges")
        if completion.reason == "allAnswered" and len(exchanges) not in (1, 2):
            raise ValueError("all-answered completion must have one or two exchanges")
        return completion


PracticeActiveSessionResponse = Annotated[
    PracticeGeneratingQuestionResponse
    | PracticeAnsweringResponse
    | PracticeGeneratingFollowUpResponse
    | PracticeAnsweringFollowUpResponse
    | PracticeEvaluatingResponse
    | PracticeReviewResponse,
    Field(discriminator="status"),
]


class CurrentPracticeSessionResponse(PracticeAPIModel):
    session: PracticeActiveSessionResponse | None


__all__ = [
    "PracticeAttemptStatus",
    "PracticeActiveSessionBase",
    "PracticeActiveSessionResponse",
    "PracticeAnswerResponse",
    "PracticeAnsweredFollowUpExchangeResponse",
    "PracticeAnsweringFollowUpResponse",
    "PracticeAnsweringResponse",
    "PracticeAwaitingFollowUpExchangeResponse",
    "PracticeEvaluatingResponse",
    "PracticeEvaluationResponse",
    "PracticeFollowUpQuestionResponse",
    "PracticeGeneratingFollowUpResponse",
    "PracticeGeneratingQuestionResponse",
    "PracticeGuidanceNotRequestedResponse",
    "PracticeQuestionSource",
    "PracticeQuestionResponse",
    "PracticeReferenceAnswerNotRequestedResponse",
    "PracticeNoFollowUpRequiredCompletionResponse",
    "PracticeAllAnsweredCompletionResponse",
    "PracticeCompletedFollowUpCompletionResponse",
    "PracticeReviewContentResponse",
    "PracticeReviewResponse",
    "CurrentPracticeSessionResponse",
    "PracticeSessionCompletionReason",
    "PracticeSessionSelection",
    "PracticeSessionStatus",
    "RetryPracticeQuestionRequest",
    "RefreshPracticeFollowUpGenerationRequest",
    "RefreshPracticeEvaluationRequest",
    "RefreshPracticeQuestionGenerationRequest",
    "SubmitPrimaryAnswerRequest",
    "SubmitFollowUpAnswerRequest",
    "StartPracticeSessionRequest",
]
