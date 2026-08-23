from enum import StrEnum
from typing import Annotated, Any, Self

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    StringConstraints,
    model_validator,
)

from riva.core.language import InteractionLanguage
from riva.schemas.follow_up import FollowUpFocus
from riva.schemas.practice_interactions import (
    MAX_PRACTICE_FOLLOW_UPS,
    PracticeAnswerContent,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardPrompt,
    QuestionCardQuestionType,
    QuestionCardTextList,
)

MAX_PRACTICE_EVALUATION_DIMENSIONS = 8
MAX_PRACTICE_EVALUATION_EXPLANATION_LENGTH = 2_000
MAX_PRACTICE_FOCUS_EXPLANATION_LENGTH = 1_500


class PracticeEvaluationDimension(StrEnum):
    RELEVANCE = "relevance"
    STRUCTURE = "structure"
    SPECIFICITY = "specificity"
    PERSONAL_CONTRIBUTION = "personalContribution"
    RESULTS_AND_EVIDENCE = "resultsAndEvidence"
    ROLE_ALIGNMENT = "roleAlignment"
    COMMUNICATION = "communication"
    RISK_CONTROL = "riskControl"


class PracticeEvaluationFollowUpCompletionReason(StrEnum):
    NO_FOLLOW_UP_REQUIRED = "noFollowUpRequired"
    ALL_ANSWERED = "allAnswered"
    ENDED_EARLY = "endedEarly"


class PracticeFocusAssessmentStatus(StrEnum):
    DEMONSTRATED = "demonstrated"
    PARTIAL = "partial"
    MISSING = "missing"


PracticeEvaluationScore = Annotated[
    StrictInt,
    Field(ge=0, le=100),
]
PracticeEvaluationExplanation = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_PRACTICE_EVALUATION_EXPLANATION_LENGTH,
    ),
]
PracticeFocusAssessmentExplanation = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_PRACTICE_FOCUS_EXPLANATION_LENGTH,
    ),
]
PracticeFocusIndex = Annotated[
    StrictInt,
    Field(ge=0),
]
PracticeEvaluationFollowUpOrder = Annotated[
    StrictInt,
    Field(ge=1, le=MAX_PRACTICE_FOLLOW_UPS),
]


def _alias(snake_case: str, camel_case: str, **kwargs: Any) -> Any:
    return Field(
        validation_alias=AliasChoices(snake_case, camel_case),
        serialization_alias=camel_case,
        **kwargs,
    )


class _EvaluationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EvaluationQuestionContext(_EvaluationModel):
    prompt: QuestionCardPrompt
    question_type: QuestionCardQuestionType = _alias("question_type", "questionType")
    difficulty: QuestionCardDifficulty
    assessed_capabilities: QuestionCardTextList = _alias(
        "assessed_capabilities", "assessedCapabilities"
    )
    scoring_focus: QuestionCardTextList = _alias("scoring_focus", "scoringFocus")


class EvaluationMainAnswer(_EvaluationModel):
    content: PracticeAnswerContent


class EvaluationFollowUpExchange(_EvaluationModel):
    order: PracticeEvaluationFollowUpOrder
    prompt: QuestionCardPrompt
    focus: FollowUpFocus
    answer: PracticeAnswerContent


class PracticeDimensionScore(_EvaluationModel):
    dimension: PracticeEvaluationDimension
    score: PracticeEvaluationScore
    explanation: PracticeEvaluationExplanation


class PracticeFocusAssessment(_EvaluationModel):
    focus_index: PracticeFocusIndex = _alias("focus_index", "focusIndex")
    status: PracticeFocusAssessmentStatus
    explanation: PracticeFocusAssessmentExplanation


class PracticeEvaluationOutput(_EvaluationModel):
    overall_score: PracticeEvaluationScore = _alias("overall_score", "overallScore")
    dimension_scores: Annotated[
        list[PracticeDimensionScore],
        Field(
            min_length=4,
            max_length=MAX_PRACTICE_EVALUATION_DIMENSIONS,
        ),
    ] = _alias("dimension_scores", "dimensionScores")
    focus_assessments: list[PracticeFocusAssessment] = _alias(
        "focus_assessments", "focusAssessments"
    )

    @model_validator(mode="after")
    def validate_dimensions(self) -> Self:
        dimensions = [item.dimension for item in self.dimension_scores]
        if len(set(dimensions)) != len(dimensions):
            raise ValueError("dimension_scores must contain unique dimensions")

        required = {
            PracticeEvaluationDimension.RELEVANCE,
            PracticeEvaluationDimension.STRUCTURE,
            PracticeEvaluationDimension.SPECIFICITY,
            PracticeEvaluationDimension.COMMUNICATION,
        }
        if not required.issubset(dimensions):
            raise ValueError("dimension_scores must contain all core dimensions")
        return self


class EvaluationInput(_EvaluationModel):
    interaction_language: InteractionLanguage = _alias(
        "interaction_language", "interactionLanguage"
    )
    question: EvaluationQuestionContext
    main_answer: EvaluationMainAnswer = _alias("main_answer", "mainAnswer")
    follow_up_exchanges: list[EvaluationFollowUpExchange] = _alias(
        "follow_up_exchanges",
        "followUpExchanges",
        default_factory=list,
        max_length=MAX_PRACTICE_FOLLOW_UPS,
    )
    follow_up_completion_reason: PracticeEvaluationFollowUpCompletionReason = _alias(
        "follow_up_completion_reason", "followUpCompletionReason"
    )

    @model_validator(mode="after")
    def validate_follow_up_exchanges(self) -> Self:
        actual_orders = [exchange.order for exchange in self.follow_up_exchanges]
        expected_orders = list(range(1, len(actual_orders) + 1))
        if actual_orders != expected_orders:
            raise ValueError(
                "follow_up_exchanges must contain each completed order exactly "
                "once and in sequence"
            )

        if (
            self.follow_up_completion_reason
            == PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
            and self.follow_up_exchanges
        ):
            raise ValueError("noFollowUpRequired requires no follow_up_exchanges")
        if (
            self.follow_up_completion_reason
            == PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
            and not self.follow_up_exchanges
        ):
            raise ValueError("allAnswered requires completed follow-up exchanges")
        if (
            self.follow_up_completion_reason
            == PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
            and len(self.follow_up_exchanges) > 1
        ):
            raise ValueError(
                "endedEarly permits at most one completed follow-up exchange"
            )
        return self


__all__ = [
    "EvaluationFollowUpExchange",
    "EvaluationInput",
    "EvaluationMainAnswer",
    "EvaluationQuestionContext",
    "MAX_PRACTICE_EVALUATION_DIMENSIONS",
    "MAX_PRACTICE_EVALUATION_EXPLANATION_LENGTH",
    "MAX_PRACTICE_FOCUS_EXPLANATION_LENGTH",
    "PracticeDimensionScore",
    "PracticeEvaluationDimension",
    "PracticeEvaluationExplanation",
    "PracticeEvaluationFollowUpCompletionReason",
    "PracticeEvaluationOutput",
    "PracticeEvaluationScore",
    "PracticeEvaluationFollowUpOrder",
    "PracticeFocusAssessment",
    "PracticeFocusAssessmentExplanation",
    "PracticeFocusAssessmentStatus",
    "PracticeFocusIndex",
]
