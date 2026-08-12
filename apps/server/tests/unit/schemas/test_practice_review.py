from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError

from riva.schemas.practice_review import (
    PracticeReviewInput,
    PracticeReviewOutput,
    ReviewRunPayload,
)


CORE_DIMENSIONS = [
    "relevance",
    "structure",
    "specificity",
    "communication",
]


def review_output_payload(
    *,
    highlights: list[object] | None = None,
    main_issues: list[object] | None = None,
    improvement_suggestions: list[object] | None = None,
    reusable_answer_structure: list[object] | None = None,
    exposed_weaknesses: list[object] | None = None,
) -> dict[str, object]:
    return {
        "overallPerformance": "  The answer was relevant and mostly clear.  ",
        "highlights": [] if highlights is None else highlights,
        "mainIssues": [] if main_issues is None else main_issues,
        "improvementSuggestions": (
            []
            if improvement_suggestions is None
            else improvement_suggestions
        ),
        "reusableAnswerStructure": (
            []
            if reusable_answer_structure is None
            else reusable_answer_structure
        ),
        "exposedWeaknesses": (
            [] if exposed_weaknesses is None else exposed_weaknesses
        ),
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


def review_input_payload(
    *,
    language: str = "en",
    scoring_focus: list[str] | None = None,
    exchanges: list[dict[str, object]] | None = None,
    completion_reason: str = "noFollowUpRequired",
    evaluation: dict[str, object] | None = None,
) -> dict[str, object]:
    scoring_focus = ["result evidence"] if scoring_focus is None else scoring_focus
    return {
        "interactionLanguage": language,
        "question": {
            "prompt": "Explain how you improved reliability.",
            "questionType": "projectDeepDive",
            "difficulty": "basic",
            "assessedCapabilities": ["ownership"],
            "scoringFocus": scoring_focus,
        },
        "mainAnswer": {"content": "I reduced failures and explained the result."},
        "followUpExchanges": [] if exchanges is None else exchanges,
        "followUpCompletionReason": completion_reason,
        "evaluation": evaluation or evaluation_payload(focus_count=len(scoring_focus)),
    }


def follow_up_exchange(order: int) -> dict[str, object]:
    return {
        "order": order,
        "prompt": "What changed after the rollout?",
        "focus": "result evidence",
        "answer": "The failure rate fell during the following week.",
    }


def test_review_output_normalizes_lists_and_accepts_empty_lists() -> None:
    parsed = PracticeReviewOutput.model_validate(
        review_output_payload(
            highlights=["  Clear ownership  ", "", "Clear ownership", "Evidence"],
            main_issues=[],
            improvement_suggestions=[" Add a baseline ", "Add a baseline"],
            reusable_answer_structure=["Context", " Context "],
            exposed_weaknesses=["  Attribution  "],
        )
    )

    assert parsed.overall_performance == (
        "The answer was relevant and mostly clear."
    )
    assert parsed.highlights == ["Clear ownership", "Evidence"]
    assert parsed.main_issues == []
    assert parsed.improvement_suggestions == ["Add a baseline"]
    assert parsed.reusable_answer_structure == ["Context"]
    assert parsed.exposed_weaknesses == ["Attribution"]
    assert parsed.model_dump(mode="json", by_alias=True)["mainIssues"] == []


@pytest.mark.parametrize(
    "payload",
    [
        {**review_output_payload(), "overallPerformance": "   "},
        {
            **review_output_payload(),
            "overallPerformance": "x" * 4001,
        },
        {
            **review_output_payload(),
            "highlights": ["x" * 1501],
        },
        {
            **review_output_payload(),
            "exposedWeaknesses": ["x" * 256],
        },
        {
            **review_output_payload(),
            "highlights": [str(index) for index in range(11)],
        },
    ],
)
def test_review_output_enforces_text_and_list_limits(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        PracticeReviewOutput.model_validate(payload)


@pytest.mark.parametrize(
    "field",
    [
        "recommendation",
        "overallScore",
        "dimensionScores",
        "nextQuestion",
        "reasoning",
    ],
)
def test_review_output_rejects_evaluation_and_recommendation_fields(
    field: str,
) -> None:
    payload = review_output_payload()
    payload[field] = "not allowed"

    with pytest.raises(ValidationError):
        PracticeReviewOutput.model_validate(payload)


def test_review_output_validation_does_not_mutate_payload() -> None:
    payload = review_output_payload(highlights=["  Evidence  ", "Evidence"])
    before = deepcopy(payload)

    PracticeReviewOutput.model_validate(payload)

    assert payload == before


def test_review_input_accepts_no_follow_up_with_canonical_evaluation() -> None:
    parsed = PracticeReviewInput.model_validate(review_input_payload())

    assert parsed.follow_up_exchanges == []
    assert parsed.evaluation.overall_score == 80
    assert parsed.evaluation.focus_assessments[0].focus_index == 0


@pytest.mark.parametrize("exchange_count", [1, 2])
def test_review_input_accepts_continuous_all_answered_chain(
    exchange_count: int,
) -> None:
    parsed = PracticeReviewInput.model_validate(
        review_input_payload(
            scoring_focus=["result evidence"],
            exchanges=[follow_up_exchange(index) for index in range(1, exchange_count + 1)],
            completion_reason="allAnswered",
            evaluation=evaluation_payload(focus_count=1),
        )
    )

    assert [exchange.order for exchange in parsed.follow_up_exchanges] == list(
        range(1, exchange_count + 1)
    )


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload["evaluation"].update(
            {
                "focusAssessments": [
                    {
                        "focusIndex": 1,
                        "status": "missing",
                        "explanation": "Missing.",
                    }
                ]
            }
        ),
        lambda payload: payload["evaluation"].update(
            {
                "focusAssessments": [
                    {
                        "focusIndex": 0,
                        "status": "partial",
                        "explanation": "Partial.",
                    },
                    {
                        "focusIndex": 0,
                        "status": "missing",
                        "explanation": "Duplicate.",
                    },
                ]
            }
        ),
        lambda payload: payload["question"].update(
            {"scoringFocus": ["one", "two"]}
        ),
    ],
)
def test_review_input_rejects_focus_index_mismatch(mutate) -> None:
    payload = review_input_payload()
    mutate(payload)

    with pytest.raises(ValidationError):
        PracticeReviewInput.model_validate(payload)


@pytest.mark.parametrize(
    "payload",
    [
        review_input_payload(
            exchanges=[follow_up_exchange(1)],
            completion_reason="noFollowUpRequired",
        ),
        review_input_payload(completion_reason="allAnswered"),
        review_input_payload(
            exchanges=[follow_up_exchange(2)],
            completion_reason="allAnswered",
        ),
    ],
)
def test_review_input_reuses_completion_chain_invariant(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        PracticeReviewInput.model_validate(payload)


def test_review_input_requires_language_and_rejects_extra_fields() -> None:
    missing_language = review_input_payload()
    missing_language.pop("interactionLanguage")
    with pytest.raises(ValidationError):
        PracticeReviewInput.model_validate(missing_language)

    extra = review_input_payload()
    extra["profile"] = {"secret": True}
    with pytest.raises(ValidationError):
        PracticeReviewInput.model_validate(extra)


@pytest.mark.parametrize("language", ["zh-CN", "en"])
def test_review_run_payload_is_small_canonical_camel_case_contract(
    language: str,
) -> None:
    attempt_id = uuid4()
    evaluation_id = uuid4()

    payload = ReviewRunPayload.model_validate(
        {
            "attemptId": str(attempt_id),
            "evaluationId": str(evaluation_id),
            "interactionLanguage": language,
        }
    )

    assert payload.attempt_id == attempt_id
    assert payload.evaluation_id == evaluation_id
    assert payload.interaction_language == language
    assert payload.model_dump(mode="json", by_alias=True) == {
        "attemptId": str(attempt_id),
        "evaluationId": str(evaluation_id),
        "interactionLanguage": language,
    }


@pytest.mark.parametrize(
    "field",
    [
        "questionCardId",
        "mainAnswerId",
        "followUpQuestionIds",
        "followUpAnswerIds",
        "evaluationRunId",
        "rawAnswer",
        "question",
        "reviewInput",
    ],
)
def test_review_run_payload_rejects_answer_chain_and_context_fields(
    field: str,
) -> None:
    payload = {
        "attemptId": str(uuid4()),
        "evaluationId": str(uuid4()),
        "interactionLanguage": "en",
        field: "not allowed",
    }

    with pytest.raises(ValidationError):
        ReviewRunPayload.model_validate(payload)


def test_review_run_payload_rejects_non_standard_ids_and_extra_fields() -> None:
    valid = {
        "attemptId": str(uuid4()),
        "evaluationId": str(uuid4()),
        "interactionLanguage": "en",
    }

    compact_uuid = dict(valid)
    compact_uuid["attemptId"] = str(uuid4()).replace("-", "")
    with pytest.raises(ValidationError):
        ReviewRunPayload.model_validate(compact_uuid)

    extra = dict(valid)
    extra["requestId"] = str(uuid4())
    with pytest.raises(ValidationError):
        ReviewRunPayload.model_validate(extra)
