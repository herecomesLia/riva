from copy import deepcopy

import pytest
from pydantic import TypeAdapter, ValidationError

from riva.schemas.practice_recommendation import (
    PracticeNextQuestionPlan,
    PracticeRecommendationInput,
    PracticeRecommendationOutput,
    PracticeRetryCurrentRecommendation,
)


CORE_DIMENSIONS = [
    "relevance",
    "structure",
    "specificity",
    "communication",
]


def output_adapter() -> TypeAdapter:
    return TypeAdapter(PracticeRecommendationOutput)


def retry_payload(*, reason: str = "  Continue practicing the same gap.  "):
    return {
        "action": "retryCurrent",
        "reason": reason,
    }


def next_payload(
    *,
    question_type: str = "projectDeepDive",
    difficulty: str = "basic",
    focus_areas: list[object] | None = None,
    reason: str = "The core gap is sufficiently exposed for another question.",
):
    return {
        "action": "nextQuestion",
        "reason": reason,
        "nextQuestion": {
            "questionType": question_type,
            "difficulty": difficulty,
            "focusAreas": [] if focus_areas is None else focus_areas,
        },
    }


def evaluation_payload(*, focus_count: int = 1) -> dict[str, object]:
    return {
        "overallScore": 80,
        "dimensionScores": [
            {
                "dimension": dimension,
                "score": 80,
                "explanation": "The answer provides relevant evidence.",
            }
            for dimension in CORE_DIMENSIONS
        ],
        "focusAssessments": [
            {
                "focusIndex": index,
                "status": "demonstrated",
                "explanation": "The answer addresses this focus.",
            }
            for index in range(focus_count)
        ],
    }


def review_payload(
    *,
    exposed_weaknesses: list[str] | None = None,
) -> dict[str, object]:
    return {
        "overallPerformance": "The answer is relevant with a clear evidence gap.",
        "highlights": ["Ownership is clear."],
        "mainIssues": ["Attribution is incomplete."],
        "improvementSuggestions": ["Add the validation window."],
        "reusableAnswerStructure": ["Context", "Decision", "Evidence"],
        "exposedWeaknesses": (
            ["Result attribution evidence"]
            if exposed_weaknesses is None
            else exposed_weaknesses
        ),
    }


def input_payload(
    *,
    language: str = "en",
    question_type: str = "projectDeepDive",
    difficulty: str = "basic",
    completion_reason: str = "noFollowUpRequired",
    scoring_focus: list[str] | None = None,
    evaluation: dict[str, object] | None = None,
    review: dict[str, object] | None = None,
) -> dict[str, object]:
    scoring_focus = ["result evidence"] if scoring_focus is None else scoring_focus
    return {
        "interactionLanguage": language,
        "question": {
            "prompt": "Explain how you improved reliability.",
            "questionType": question_type,
            "difficulty": difficulty,
            "assessedCapabilities": ["ownership"],
            "scoringFocus": scoring_focus,
        },
        "followUpCompletionReason": completion_reason,
        "evaluation": evaluation or evaluation_payload(focus_count=len(scoring_focus)),
        "review": review or review_payload(),
    }


def test_retry_current_output_is_strict_and_trims_reason() -> None:
    parsed = output_adapter().validate_python(retry_payload())

    assert isinstance(parsed, PracticeRetryCurrentRecommendation)
    assert parsed.reason == "Continue practicing the same gap."
    assert parsed.model_dump(mode="json") == {
        "action": "retryCurrent",
        "reason": "Continue practicing the same gap.",
    }


def test_next_question_output_normalizes_focus_areas() -> None:
    parsed = output_adapter().validate_python(
        next_payload(
            focus_areas=[
                "  Result attribution evidence  ",
                "",
                "Result attribution evidence",
                "Risk control",
            ]
        )
    )

    assert parsed.next_question.question_type.value == "projectDeepDive"
    assert parsed.next_question.difficulty.value == "basic"
    assert parsed.next_question.focus_areas == [
        "Result attribution evidence",
        "Risk control",
    ]
    assert parsed.model_dump(mode="json", by_alias=True)["nextQuestion"][
        "focusAreas"
    ] == ["Result attribution evidence", "Risk control"]


@pytest.mark.parametrize(
    "payload",
    [
        {**retry_payload(), "nextQuestion": next_payload()["nextQuestion"]},
        {"action": "nextQuestion", "reason": "missing plan"},
        {**next_payload(), "recommendation": "nested"},
        {**retry_payload(), "overallScore": 80},
        {**next_payload(), "score": 80},
    ],
)
def test_recommendation_output_rejects_wrong_shape_and_extra_fields(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        output_adapter().validate_python(payload)


@pytest.mark.parametrize(
    "payload",
    [
        {"action": "complete", "reason": "invalid action"},
        next_payload(question_type="not-a-question-type"),
        next_payload(difficulty="extreme"),
        {**retry_payload(reason="   ")},
        {**retry_payload(reason="x" * 2001)},
        next_payload(focus_areas=["x" * 256]),
        next_payload(focus_areas=[str(index) for index in range(4)]),
    ],
)
def test_recommendation_output_enforces_values_and_limits(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        output_adapter().validate_python(payload)


def test_recommendation_output_validation_does_not_mutate_payload() -> None:
    payload = next_payload(focus_areas=["  Evidence  ", "Evidence"])
    before = deepcopy(payload)

    output_adapter().validate_python(payload)

    assert payload == before


def test_next_question_plan_has_no_extra_fields() -> None:
    with pytest.raises(ValidationError):
        PracticeNextQuestionPlan.model_validate(
            {
                "questionType": "projectDeepDive",
                "difficulty": "basic",
                "focusAreas": [],
                "prompt": "must not be present",
            }
        )


@pytest.mark.parametrize("question_type", [
    "projectDeepDive",
    "behavioral",
    "businessUnderstanding",
    "motivation",
    "technicalFoundation",
])
@pytest.mark.parametrize("difficulty", ["basic", "pressure"])
def test_recommendation_input_accepts_question_contract(
    question_type: str,
    difficulty: str,
) -> None:
    parsed = PracticeRecommendationInput.model_validate(
        input_payload(question_type=question_type, difficulty=difficulty)
    )

    assert parsed.question.question_type.value == question_type
    assert parsed.question.difficulty.value == difficulty


def test_recommendation_input_has_no_raw_answer_chain_fields() -> None:
    parsed = PracticeRecommendationInput.model_validate(input_payload())
    assert not hasattr(parsed, "main_answer")
    assert not hasattr(parsed, "follow_up_exchanges")

    for extra_field in ("mainAnswer", "followUpExchanges", "profile", "jobDescription"):
        payload = input_payload()
        payload[extra_field] = {}
        with pytest.raises(ValidationError):
            PracticeRecommendationInput.model_validate(payload)


def test_recommendation_input_validates_language_completion_and_focus_indices() -> None:
    for language in ("zh-CN", "en"):
        for reason in ("noFollowUpRequired", "allAnswered"):
            parsed = PracticeRecommendationInput.model_validate(
                input_payload(language=language, completion_reason=reason)
            )
            assert parsed.interaction_language == language
            assert parsed.follow_up_completion_reason.value == reason

    missing_language = input_payload()
    missing_language.pop("interactionLanguage")
    with pytest.raises(ValidationError):
        PracticeRecommendationInput.model_validate(missing_language)

    invalid_language = input_payload(language="fr")
    with pytest.raises(ValidationError):
        PracticeRecommendationInput.model_validate(invalid_language)

    malformed_focus = input_payload(
        scoring_focus=["one", "two"],
        evaluation=evaluation_payload(focus_count=1),
    )
    with pytest.raises(ValidationError):
        PracticeRecommendationInput.model_validate(malformed_focus)


def test_recommendation_input_rejects_review_recommendation_and_extra_fields() -> None:
    review_with_recommendation = input_payload(
        review={**review_payload(), "recommendation": {"action": "retryCurrent"}}
    )
    with pytest.raises(ValidationError):
        PracticeRecommendationInput.model_validate(review_with_recommendation)

    extra = input_payload()
    extra["recommendation"] = {"action": "retryCurrent"}
    with pytest.raises(ValidationError):
        PracticeRecommendationInput.model_validate(extra)
