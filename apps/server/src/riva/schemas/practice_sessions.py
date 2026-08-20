from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, field_validator, model_validator

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
from riva.schemas.practice_recommendation import (
    PracticeRecommendationOutput,
    RecommendationReason,
)
from riva.schemas.practice_reference_answer import (
    PracticeReferenceAnswerCommonMistakes,
    PracticeReferenceAnswerKeyPoints,
    PracticeReferenceAnswerKind,
    ReferenceAnswer,
    ReferenceAnswerAddressedGap,
)
from riva.schemas.practice_review import (
    MAX_PRACTICE_REVIEW_ITEMS,
    ReviewItem,
    ReviewOverallPerformance,
    ReviewWeakness,
)
from riva.schemas.profile import StandardUUID
from riva.schemas.question_cards import (
    MAX_QUESTION_CARD_LIST_ITEMS,
    QuestionCardDifficulty,
    QuestionCardMaterialList,
    QuestionCardPrompt,
    QuestionCardQuestionType,
    QuestionCardTextItem,
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


class PracticeQuestionSourceAvailability(APIModel):
    model_config = ConfigDict(extra="forbid")

    target_role_id: StandardUUID
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty
    saved_question_count: Annotated[int, Field(ge=0)]
    history_question_count: Annotated[int, Field(ge=0)]


class PracticeSetupCapabilitiesResponse(APIModel):
    model_config = ConfigDict(extra="forbid")

    saved_question_count: Annotated[int, Field(ge=0)]
    history_question_count: Annotated[int, Field(ge=0)]
    question_source_availability: list[PracticeQuestionSourceAvailability]
    can_prioritize_weaknesses: bool


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


class SkipPracticeQuestionRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]
    question_id: StandardUUID


class SetPracticeQuestionSavedRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]
    question_id: StandardUUID
    is_saved: Annotated[bool, Field(strict=True)]


class SetPracticeQuestionWeakRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]
    question_id: StandardUUID
    is_marked_weak: Annotated[bool, Field(strict=True)]


class RefreshPracticeQuestionGenerationRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]


class PracticeQuestionReferenceAnswerRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]
    question_id: StandardUUID


class PracticeFollowUpReferenceAnswerRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]
    question_id: StandardUUID
    follow_up_question_id: StandardUUID


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


class EndPracticeFollowUpsRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]
    question_id: StandardUUID
    follow_up_question_id: StandardUUID


class RefreshPracticeEvaluationRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]


class CompletePracticeSessionRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]


class EndPracticeSessionEarlyRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]
    question_id: StandardUUID


class RevealPracticeQuestionGuidanceRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]
    question_id: StandardUUID


class RevealPracticeFollowUpGuidanceRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(ge=1)]
    question_id: StandardUUID
    follow_up_question_id: StandardUUID


class PracticeAPIModel(APIModel):
    model_config = ConfigDict(extra="forbid")


def _validate_aware_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamps must be timezone-aware")
    return value


class PracticeGuidanceNotRequestedResponse(PracticeAPIModel):
    status: Literal["notRequested"]
    content: None = None


class PracticeGuidanceRevealedResponse(PracticeAPIModel):
    status: Literal["revealed"]
    content: Annotated[
        list[QuestionCardTextItem],
        Field(min_length=1, max_length=MAX_QUESTION_CARD_LIST_ITEMS),
    ]


class PracticeGuidanceUnavailableResponse(PracticeAPIModel):
    status: Literal["unavailable"]
    content: None = None


PracticeGuidanceResponse = Annotated[
    PracticeGuidanceNotRequestedResponse
    | PracticeGuidanceRevealedResponse
    | PracticeGuidanceUnavailableResponse,
    Field(discriminator="status"),
]


class PracticeReferenceAnswerNotRequestedResponse(PracticeAPIModel):
    status: Literal["notRequested"]
    content: None = None
    viewed_before_submission: Literal[False] = False


class PracticeReferenceAnswerGeneratingResponse(PracticeAPIModel):
    status: Literal["generating"]
    content: None = None
    viewed_before_submission: Literal[False] = False


class PracticeReferenceAnswerUnavailableResponse(PracticeAPIModel):
    status: Literal["unavailable"]
    content: None = None
    viewed_before_submission: Literal[False] = False


class PracticeMainReferenceAnswerContentResponse(PracticeAPIModel):
    kind: Literal[
        PracticeReferenceAnswerKind.PERSONALIZED_EXAMPLE,
        PracticeReferenceAnswerKind.TECHNICAL_REFERENCE,
    ]
    answer: ReferenceAnswer
    key_points: PracticeReferenceAnswerKeyPoints
    common_mistakes: PracticeReferenceAnswerCommonMistakes
    generated_at: datetime

    _validate_generated_at = field_validator("generated_at")(
        _validate_aware_timestamp
    )


class PracticeFollowUpReferenceAnswerContentResponse(PracticeAPIModel):
    kind: Literal[
        PracticeReferenceAnswerKind.PERSONALIZED_SUPPLEMENT,
        PracticeReferenceAnswerKind.TECHNICAL_REFERENCE,
    ]
    addressed_gap: ReferenceAnswerAddressedGap
    answer: ReferenceAnswer
    key_points: PracticeReferenceAnswerKeyPoints
    common_mistakes: PracticeReferenceAnswerCommonMistakes
    generated_at: datetime

    _validate_generated_at = field_validator("generated_at")(
        _validate_aware_timestamp
    )


class PracticeMainReferenceAnswerRevealedResponse(PracticeAPIModel):
    status: Literal["revealed"]
    content: PracticeMainReferenceAnswerContentResponse
    viewed_before_submission: bool


class PracticeFollowUpReferenceAnswerRevealedResponse(PracticeAPIModel):
    status: Literal["revealed"]
    content: PracticeFollowUpReferenceAnswerContentResponse
    viewed_before_submission: bool


PracticeMainReferenceAnswerResponse = Annotated[
    PracticeReferenceAnswerNotRequestedResponse
    | PracticeReferenceAnswerGeneratingResponse
    | PracticeMainReferenceAnswerRevealedResponse
    | PracticeReferenceAnswerUnavailableResponse,
    Field(discriminator="status"),
]

PracticeFollowUpReferenceAnswerResponse = Annotated[
    PracticeReferenceAnswerNotRequestedResponse
    | PracticeReferenceAnswerGeneratingResponse
    | PracticeFollowUpReferenceAnswerRevealedResponse
    | PracticeReferenceAnswerUnavailableResponse,
    Field(discriminator="status"),
]


class PracticeQuestionResponse(PracticeAPIModel):
    id: StandardUUID
    prompt: QuestionCardPrompt
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty
    assessed_capabilities: QuestionCardTextList
    recommended_materials: QuestionCardMaterialList
    answer_hints: PracticeGuidanceResponse = Field(
        default_factory=lambda: PracticeGuidanceNotRequestedResponse(
            status="notRequested"
        )
    )
    answer_framework: PracticeGuidanceResponse = Field(
        default_factory=lambda: PracticeGuidanceNotRequestedResponse(
            status="notRequested"
        )
    )
    reference_answer: PracticeMainReferenceAnswerResponse = Field(
        default_factory=lambda: PracticeReferenceAnswerNotRequestedResponse(
            status="notRequested"
        )
    )
    is_saved: bool
    is_marked_weak: bool


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
    answer_hints: PracticeGuidanceResponse = Field(
        default_factory=lambda: PracticeGuidanceNotRequestedResponse(
            status="notRequested"
        )
    )
    answer_framework: PracticeGuidanceResponse = Field(
        default_factory=lambda: PracticeGuidanceNotRequestedResponse(
            status="notRequested"
        )
    )
    reference_answer: PracticeFollowUpReferenceAnswerResponse = Field(
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


class PracticeEndedEarlyFollowUpCompletionResponse(PracticeAPIModel):
    status: Literal["endedEarly"]
    unanswered_question: PracticeFollowUpQuestionResponse


PracticeFollowUpCompletionResponse = (
    PracticeCompletedFollowUpCompletionResponse
    | PracticeEndedEarlyFollowUpCompletionResponse
)


class PracticeEvaluatingResponse(PracticeActiveSessionBase):
    status: Literal["evaluating"]
    question: PracticeQuestionResponse
    main_answer: PracticeAnswerResponse
    follow_up_exchanges: list[PracticeAnsweredFollowUpExchangeResponse] = Field(
        default_factory=list,
        max_length=MAX_PRACTICE_FOLLOW_UPS,
    )
    follow_up_completion: PracticeFollowUpCompletionResponse
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
        completion: PracticeFollowUpCompletionResponse,
        info,
    ) -> PracticeFollowUpCompletionResponse:
        exchanges = info.data.get("follow_up_exchanges", [])
        if completion.status == "endedEarly":
            if len(exchanges) not in (0, 1):
                raise ValueError(
                    "ended-early completion must have zero or one exchange"
                )
            if completion.unanswered_question.order != len(exchanges) + 1:
                raise ValueError("unanswered follow-up question order is invalid")
            if completion.unanswered_question.id in {
                exchange.question.id for exchange in exchanges
            }:
                raise ValueError(
                    "unanswered follow-up question must not be answered"
                )
            return completion
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
    follow_up_completion: PracticeFollowUpCompletionResponse
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
        completion: PracticeFollowUpCompletionResponse,
        info,
    ) -> PracticeFollowUpCompletionResponse:
        exchanges = info.data.get("follow_up_exchanges", [])
        if completion.status == "endedEarly":
            if len(exchanges) not in (0, 1):
                raise ValueError(
                    "ended-early completion must have zero or one exchange"
                )
            if completion.unanswered_question.order != len(exchanges) + 1:
                raise ValueError("unanswered follow-up question order is invalid")
            if completion.unanswered_question.id in {
                exchange.question.id for exchange in exchanges
            }:
                raise ValueError(
                    "unanswered follow-up question must not be answered"
                )
            return completion
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


class PracticeUnfinishedAttemptResponse(PracticeAPIModel):
    attempt_id: StandardUUID
    attempt_number: Annotated[int, Field(ge=1)]
    selection: PracticeSessionSelection
    question: PracticeQuestionResponse


class PracticeCompletedSessionResponse(PracticeAPIModel):
    status: Literal["completed"]
    session_id: StandardUUID
    language: InteractionLanguage
    version: Annotated[int, Field(ge=1)]
    selection: PracticeSessionSelection
    started_at: datetime
    attempt_id: StandardUUID
    attempt_number: Annotated[int, Field(ge=1)]
    completion_reason: Literal["reviewCompleted", "userEndedEarly"]
    completed_at: datetime
    questions_completed: Annotated[int, Field(ge=0)]
    retry_count: Annotated[int, Field(ge=0)]
    saved_question_count: Annotated[int, Field(ge=0)]
    marked_weak_question_count: Annotated[int, Field(ge=0)]
    final_attempt_average_score: Annotated[
        int,
        Field(strict=True, ge=0, le=100),
    ]
    next_step_suggestion: RecommendationReason | None
    unfinished_attempt: PracticeUnfinishedAttemptResponse | None

    _validate_aware_completed_at = field_validator("completed_at")(
        _validate_aware_timestamp
    )

    @model_validator(mode="after")
    def validate_summary_counts(self) -> Self:
        if self.saved_question_count > self.questions_completed:
            raise ValueError("saved question count exceeds completed questions")
        if self.marked_weak_question_count > self.questions_completed:
            raise ValueError(
                "marked-weak question count exceeds completed questions"
            )
        if self.completion_reason == "reviewCompleted":
            if self.questions_completed < 1:
                raise ValueError(
                    "review-completed session must have completed questions"
                )
            if self.unfinished_attempt is not None:
                raise ValueError(
                    "review-completed session cannot have an unfinished attempt"
                )
            if self.next_step_suggestion is None:
                raise ValueError(
                    "review-completed session must have a next-step suggestion"
                )
        else:
            if self.unfinished_attempt is None:
                raise ValueError(
                    "early-completed session must have an unfinished attempt"
                )
            if self.attempt_id != self.unfinished_attempt.attempt_id:
                raise ValueError(
                    "completed attempt identity must match unfinished attempt"
                )
            if self.attempt_number != self.unfinished_attempt.attempt_number:
                raise ValueError(
                    "completed attempt number must match unfinished attempt"
                )
            if self.selection != self.unfinished_attempt.selection:
                raise ValueError(
                    "completed selection must match unfinished attempt selection"
                )
        if self.questions_completed == 0 and self.next_step_suggestion is not None:
            raise ValueError(
                "a session with no completed questions cannot have a suggestion"
            )
        if self.questions_completed > 0 and self.next_step_suggestion is None:
            raise ValueError(
                "a session with completed questions must have a suggestion"
            )
        return self


PracticeSessionResponse = Annotated[
    PracticeActiveSessionResponse | PracticeCompletedSessionResponse,
    Field(discriminator="status"),
]


class CurrentPracticeSessionResponse(PracticeAPIModel):
    session: PracticeActiveSessionResponse | None


__all__ = [
    "PracticeAttemptStatus",
    "PracticeActiveSessionBase",
    "PracticeActiveSessionResponse",
    "PracticeCompletedSessionResponse",
    "PracticeUnfinishedAttemptResponse",
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
    "PracticeGuidanceRevealedResponse",
    "PracticeGuidanceResponse",
    "PracticeGuidanceUnavailableResponse",
    "PracticeQuestionSource",
    "PracticeQuestionSourceAvailability",
    "PracticeQuestionResponse",
    "PracticeQuestionReferenceAnswerRequest",
    "PracticeFollowUpReferenceAnswerRequest",
    "PracticeReferenceAnswerGeneratingResponse",
    "PracticeReferenceAnswerNotRequestedResponse",
    "PracticeReferenceAnswerUnavailableResponse",
    "PracticeMainReferenceAnswerContentResponse",
    "PracticeMainReferenceAnswerRevealedResponse",
    "PracticeMainReferenceAnswerResponse",
    "PracticeFollowUpReferenceAnswerContentResponse",
    "PracticeFollowUpReferenceAnswerRevealedResponse",
    "PracticeFollowUpReferenceAnswerResponse",
    "PracticeNoFollowUpRequiredCompletionResponse",
    "PracticeAllAnsweredCompletionResponse",
    "PracticeCompletedFollowUpCompletionResponse",
    "PracticeEndedEarlyFollowUpCompletionResponse",
    "PracticeFollowUpCompletionResponse",
    "PracticeReviewContentResponse",
    "PracticeReviewResponse",
    "CurrentPracticeSessionResponse",
    "PracticeSessionResponse",
    "PracticeSessionCompletionReason",
    "PracticeSessionSelection",
    "PracticeSetupCapabilitiesResponse",
    "PracticeSessionStatus",
    "CompletePracticeSessionRequest",
    "EndPracticeSessionEarlyRequest",
    "EndPracticeFollowUpsRequest",
    "RetryPracticeQuestionRequest",
    "SkipPracticeQuestionRequest",
    "RevealPracticeFollowUpGuidanceRequest",
    "RevealPracticeQuestionGuidanceRequest",
    "SetPracticeQuestionSavedRequest",
    "SetPracticeQuestionWeakRequest",
    "RefreshPracticeFollowUpGenerationRequest",
    "RefreshPracticeEvaluationRequest",
    "RefreshPracticeQuestionGenerationRequest",
    "SubmitPrimaryAnswerRequest",
    "SubmitFollowUpAnswerRequest",
    "StartPracticeSessionRequest",
]
