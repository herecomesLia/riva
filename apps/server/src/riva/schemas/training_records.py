from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, field_validator, model_validator

from riva.core.language import InteractionLanguage
from riva.schemas.base import APIModel
from riva.schemas.evaluation import (
    MAX_PRACTICE_EVALUATION_DIMENSIONS,
    PracticeDimensionScore,
    PracticeEvaluationScore,
)
from riva.schemas.job_description_parsing import Company, RoleTitle
from riva.schemas.practice_recommendation import PracticeRecommendationOutput
from riva.schemas.practice_sessions import (
    MAX_PRACTICE_FOLLOW_UPS,
    PracticeAnswerResponse,
    PracticeFollowUpReferenceAnswerResponse,
    PracticeMainReferenceAnswerResponse,
    PracticeQuestionSource,
)
from riva.schemas.practice_review import (
    MAX_PRACTICE_REVIEW_ITEMS,
    ReviewItem,
    ReviewOverallPerformance,
    ReviewWeakness,
)
from riva.schemas.profile import StandardUUID
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardPrompt,
    QuestionCardQuestionType,
    QuestionCardTextList,
)


def _validate_aware_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamps must be timezone-aware")
    return value


class TrainingRecordAPIModel(APIModel):
    model_config = ConfigDict(extra="forbid")


class TrainingRecordKind(StrEnum):
    TARGETED_PRACTICE = "targetedPractice"
    MOCK_INTERVIEW = "mockInterview"


class TrainingRecordStatus(StrEnum):
    COMPLETED = "completed"
    ENDED_EARLY = "endedEarly"
    PARTIALLY_COMPLETED = "partiallyCompleted"


class TrainingRecordTargetRoleResponse(TrainingRecordAPIModel):
    id: StandardUUID
    title: RoleTitle
    company: Company


class TargetedPracticeTrainingRecordSummaryResponse(TrainingRecordAPIModel):
    record_id: StandardUUID
    kind: Literal[TrainingRecordKind.TARGETED_PRACTICE]
    language: InteractionLanguage
    status: TrainingRecordStatus
    started_at: datetime
    ended_at: datetime
    duration_seconds: Annotated[int, Field(ge=0)]
    target_role: TrainingRecordTargetRoleResponse
    answered_question_count: Annotated[int, Field(ge=0)]
    total_question_count: Annotated[int, Field(ge=0)]
    overall_score: float | None = Field(default=None, ge=0, le=100)
    review_summary: str | None
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty

    _validate_started_at = field_validator("started_at")(_validate_aware_timestamp)
    _validate_ended_at = field_validator("ended_at")(_validate_aware_timestamp)


class TrainingRecordsPaginationResponse(TrainingRecordAPIModel):
    page: Annotated[int, Field(ge=1)]
    page_size: Annotated[int, Field(ge=1, le=100)]
    total_items: Annotated[int, Field(ge=0)]
    total_pages: Annotated[int, Field(ge=0)]


class TrainingRecordsPageResponse(TrainingRecordAPIModel):
    items: list[TargetedPracticeTrainingRecordSummaryResponse]
    pagination: TrainingRecordsPaginationResponse


class TargetedPracticeSetupResponse(TrainingRecordAPIModel):
    source: PracticeQuestionSource
    prioritize_weaknesses: bool


class TargetedPracticeQuestionRecordResponse(TrainingRecordAPIModel):
    question_card_id: StandardUUID
    prompt: QuestionCardPrompt
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty
    assessed_capabilities: QuestionCardTextList
    is_saved: bool
    is_marked_weak: bool
    reference_answer: PracticeMainReferenceAnswerResponse


class TrainingRecordFollowUpResponse(TrainingRecordAPIModel):
    question_id: StandardUUID
    prompt: QuestionCardPrompt
    order: Annotated[int, Field(ge=1, le=MAX_PRACTICE_FOLLOW_UPS)]
    asked_at: datetime
    answer: PracticeAnswerResponse | None
    reference_answer: PracticeFollowUpReferenceAnswerResponse

    _validate_asked_at = field_validator("asked_at")(_validate_aware_timestamp)


class TrainingRecordEvaluationResponse(TrainingRecordAPIModel):
    overall_score: PracticeEvaluationScore
    dimension_scores: Annotated[
        list[PracticeDimensionScore],
        Field(
            min_length=4,
            max_length=MAX_PRACTICE_EVALUATION_DIMENSIONS,
        ),
    ]
    evaluated_at: datetime

    _validate_evaluated_at = field_validator("evaluated_at")(
        _validate_aware_timestamp
    )


class TrainingRecordReviewResponse(TrainingRecordAPIModel):
    overall_performance: ReviewOverallPerformance
    highlights: list[ReviewItem] = Field(
        default_factory=list,
        max_length=MAX_PRACTICE_REVIEW_ITEMS,
    )
    main_issues: list[ReviewItem] = Field(
        default_factory=list,
        max_length=MAX_PRACTICE_REVIEW_ITEMS,
    )
    improvement_suggestions: list[ReviewItem] = Field(
        default_factory=list,
        max_length=MAX_PRACTICE_REVIEW_ITEMS,
    )
    reusable_answer_structure: list[ReviewItem] = Field(
        default_factory=list,
        max_length=MAX_PRACTICE_REVIEW_ITEMS,
    )
    exposed_weaknesses: list[ReviewWeakness] = Field(
        default_factory=list,
        max_length=MAX_PRACTICE_REVIEW_ITEMS,
    )


class TargetedPracticeAttemptRecordResponse(TrainingRecordAPIModel):
    attempt_id: StandardUUID
    attempt_number: Annotated[int, Field(ge=1)]
    retry_of_attempt_id: StandardUUID | None
    completed_at: datetime | None
    question: TargetedPracticeQuestionRecordResponse
    main_answer: PracticeAnswerResponse | None
    follow_ups: list[TrainingRecordFollowUpResponse] = Field(default_factory=list)
    evaluation: TrainingRecordEvaluationResponse | None
    review: TrainingRecordReviewResponse | None
    recommendation: PracticeRecommendationOutput | None

    _validate_completed_at = field_validator("completed_at")(
        lambda value: _validate_aware_timestamp(value)
        if value is not None
        else value
    )


class TargetedPracticeTrainingRecordDetailResponse(TrainingRecordAPIModel):
    record_id: StandardUUID
    kind: TrainingRecordKind
    status: TrainingRecordStatus
    language: InteractionLanguage
    started_at: datetime
    ended_at: datetime
    duration_seconds: Annotated[int, Field(ge=0)]
    target_role: TrainingRecordTargetRoleResponse
    setup: TargetedPracticeSetupResponse
    attempts: list[TargetedPracticeAttemptRecordResponse] = Field(
        min_length=1
    )
    exposed_weaknesses: list[ReviewWeakness] = Field(default_factory=list)
    recommendation: PracticeRecommendationOutput | None

    _validate_started_at = field_validator("started_at")(_validate_aware_timestamp)
    _validate_ended_at = field_validator("ended_at")(_validate_aware_timestamp)

    @model_validator(mode="after")
    def validate_timeline_and_attempts(
        self,
    ) -> "TargetedPracticeTrainingRecordDetailResponse":
        if self.ended_at < self.started_at:
            raise ValueError("ended_at cannot be before started_at")
        attempt_numbers = [attempt.attempt_number for attempt in self.attempts]
        if attempt_numbers != list(range(1, len(attempt_numbers) + 1)):
            raise ValueError("attempt numbers must be contiguous and ordered")
        return self


# These aliases make the record-specific names discoverable without creating
# a second wire contract for the same projections.
TrainingRecordQuestionResponse = TargetedPracticeQuestionRecordResponse
TrainingRecordAttemptResponse = TargetedPracticeAttemptRecordResponse
TrainingRecordSummaryResponse = TargetedPracticeTrainingRecordSummaryResponse

__all__ = [
    "TargetedPracticeAttemptRecordResponse",
    "TargetedPracticeQuestionRecordResponse",
    "TargetedPracticeTrainingRecordSummaryResponse",
    "TargetedPracticeSetupResponse",
    "TargetedPracticeTrainingRecordDetailResponse",
    "TrainingRecordAPIModel",
    "TrainingRecordAttemptResponse",
    "TrainingRecordEvaluationResponse",
    "TrainingRecordFollowUpResponse",
    "TrainingRecordKind",
    "TrainingRecordQuestionResponse",
    "TrainingRecordReviewResponse",
    "TrainingRecordSummaryResponse",
    "TrainingRecordStatus",
    "TrainingRecordTargetRoleResponse",
    "TrainingRecordsPageResponse",
    "TrainingRecordsPaginationResponse",
]
