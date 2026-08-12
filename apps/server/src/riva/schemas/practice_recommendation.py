from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Any, Literal, Self

from pydantic import (
    AliasChoices,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from riva.core.language import InteractionLanguage
from riva.schemas.evaluation import (
    EvaluationQuestionContext,
    PracticeEvaluationFollowUpCompletionReason,
    PracticeEvaluationOutput,
)
from riva.schemas.practice_review import PracticeReviewOutput
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)


MAX_PRACTICE_RECOMMENDATION_REASON_LENGTH = 2_000
MAX_PRACTICE_RECOMMENDATION_FOCUS_AREAS = 3
MAX_PRACTICE_RECOMMENDATION_FOCUS_AREA_LENGTH = 255


class PracticeRecommendationAction(StrEnum):
    RETRY_CURRENT = "retryCurrent"
    NEXT_QUESTION = "nextQuestion"


RecommendationReason = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_PRACTICE_RECOMMENDATION_REASON_LENGTH,
    ),
]
RecommendationFocusArea = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_PRACTICE_RECOMMENDATION_FOCUS_AREA_LENGTH,
    ),
]


def _alias(snake_case: str, camel_case: str, **kwargs: Any) -> Any:
    return Field(
        validation_alias=AliasChoices(snake_case, camel_case),
        serialization_alias=camel_case,
        **kwargs,
    )


def _normalize_focus_areas(value: object) -> object:
    if not isinstance(value, list):
        return value

    normalized: list[object] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            normalized.append(item)
            continue
        item = item.strip()
        if not item or item in seen:
            continue
        seen.add(item)
        normalized.append(item)
    return normalized


RecommendationFocusAreaList = Annotated[
    list[RecommendationFocusArea],
    BeforeValidator(_normalize_focus_areas),
    Field(max_length=MAX_PRACTICE_RECOMMENDATION_FOCUS_AREAS),
]


class _RecommendationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PracticeRetryCurrentRecommendation(_RecommendationModel):
    action: Literal["retryCurrent"]
    reason: RecommendationReason


class PracticeNextQuestionPlan(_RecommendationModel):
    question_type: QuestionCardQuestionType = _alias(
        "question_type",
        "questionType",
    )
    difficulty: QuestionCardDifficulty
    focus_areas: RecommendationFocusAreaList = _alias(
        "focus_areas",
        "focusAreas",
        default_factory=list,
    )


class PracticeNextQuestionRecommendation(_RecommendationModel):
    action: Literal["nextQuestion"]
    reason: RecommendationReason
    next_question: PracticeNextQuestionPlan = _alias(
        "next_question",
        "nextQuestion",
    )


PracticeRecommendationOutput = Annotated[
    PracticeRetryCurrentRecommendation | PracticeNextQuestionRecommendation,
    Field(discriminator="action"),
]


class PracticeRecommendationQuestionContext(EvaluationQuestionContext):
    pass


class PracticeRecommendationInput(_RecommendationModel):
    interaction_language: InteractionLanguage = _alias(
        "interaction_language",
        "interactionLanguage",
    )
    question: PracticeRecommendationQuestionContext
    follow_up_completion_reason: PracticeEvaluationFollowUpCompletionReason = _alias(
        "follow_up_completion_reason",
        "followUpCompletionReason",
    )
    evaluation: PracticeEvaluationOutput
    review: PracticeReviewOutput

    @model_validator(mode="after")
    def validate_evaluation_focus_indices(self) -> Self:
        actual_indices = [
            assessment.focus_index
            for assessment in self.evaluation.focus_assessments
        ]
        expected_indices = list(range(len(self.question.scoring_focus)))
        if actual_indices != expected_indices:
            raise ValueError(
                "evaluation focus indices must match question scoring focus"
            )
        return self


__all__ = [
    "MAX_PRACTICE_RECOMMENDATION_FOCUS_AREA_LENGTH",
    "MAX_PRACTICE_RECOMMENDATION_FOCUS_AREAS",
    "MAX_PRACTICE_RECOMMENDATION_REASON_LENGTH",
    "PracticeNextQuestionPlan",
    "PracticeNextQuestionRecommendation",
    "PracticeRecommendationAction",
    "PracticeRecommendationInput",
    "PracticeRecommendationOutput",
    "PracticeRecommendationQuestionContext",
    "PracticeRetryCurrentRecommendation",
    "RecommendationFocusArea",
    "RecommendationFocusAreaList",
    "RecommendationReason",
]
