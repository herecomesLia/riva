from __future__ import annotations

from collections.abc import Mapping
from typing import Annotated, Any, Self

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from riva.schemas.evaluation import (
    EvaluationInput,
    PracticeEvaluationOutput,
)


MAX_PRACTICE_REVIEW_OVERALL_LENGTH = 4_000
MAX_PRACTICE_REVIEW_ITEM_LENGTH = 1_500
MAX_PRACTICE_REVIEW_ITEMS = 10
MAX_PRACTICE_REVIEW_WEAKNESS_LENGTH = 255


ReviewOverallPerformance = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_PRACTICE_REVIEW_OVERALL_LENGTH,
    ),
]
ReviewItem = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_PRACTICE_REVIEW_ITEM_LENGTH,
    ),
]
ReviewWeakness = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_PRACTICE_REVIEW_WEAKNESS_LENGTH,
    ),
]


def _alias(snake_case: str, camel_case: str, **kwargs: Any) -> Any:
    return Field(
        validation_alias=AliasChoices(snake_case, camel_case),
        serialization_alias=camel_case,
        **kwargs,
    )


_REVIEW_LIST_FIELDS = (
    ("highlights", "highlights"),
    ("main_issues", "mainIssues"),
    ("improvement_suggestions", "improvementSuggestions"),
    ("reusable_answer_structure", "reusableAnswerStructure"),
    ("exposed_weaknesses", "exposedWeaknesses"),
)


def _normalize_review_list(value: list[object]) -> list[object]:
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


def _normalize_review_lists(value: object) -> object:
    if not isinstance(value, Mapping):
        return value
    normalized = dict(value)
    for snake_case, camel_case in _REVIEW_LIST_FIELDS:
        key = (
            snake_case
            if snake_case in normalized
            else camel_case
            if camel_case in normalized
            else None
        )
        if key is not None and isinstance(normalized[key], list):
            normalized[key] = _normalize_review_list(normalized[key])
    return normalized


class PracticeReviewOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overall_performance: ReviewOverallPerformance = _alias(
        "overall_performance",
        "overallPerformance",
    )
    highlights: list[ReviewItem] = _alias(
        "highlights",
        "highlights",
        default_factory=list,
        max_length=MAX_PRACTICE_REVIEW_ITEMS,
    )
    main_issues: list[ReviewItem] = _alias(
        "main_issues",
        "mainIssues",
        default_factory=list,
        max_length=MAX_PRACTICE_REVIEW_ITEMS,
    )
    improvement_suggestions: list[ReviewItem] = _alias(
        "improvement_suggestions",
        "improvementSuggestions",
        default_factory=list,
        max_length=MAX_PRACTICE_REVIEW_ITEMS,
    )
    reusable_answer_structure: list[ReviewItem] = _alias(
        "reusable_answer_structure",
        "reusableAnswerStructure",
        default_factory=list,
        max_length=MAX_PRACTICE_REVIEW_ITEMS,
    )
    exposed_weaknesses: list[ReviewWeakness] = _alias(
        "exposed_weaknesses",
        "exposedWeaknesses",
        default_factory=list,
        max_length=MAX_PRACTICE_REVIEW_ITEMS,
    )

    @model_validator(mode="before")
    @classmethod
    def normalize_lists(cls, value: object) -> object:
        return _normalize_review_lists(value)


class PracticeReviewInput(EvaluationInput):
    evaluation: PracticeEvaluationOutput

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
    "MAX_PRACTICE_REVIEW_ITEM_LENGTH",
    "MAX_PRACTICE_REVIEW_ITEMS",
    "MAX_PRACTICE_REVIEW_OVERALL_LENGTH",
    "MAX_PRACTICE_REVIEW_WEAKNESS_LENGTH",
    "PracticeReviewInput",
    "PracticeReviewOutput",
    "ReviewItem",
    "ReviewOverallPerformance",
    "ReviewWeakness",
]
