from copy import deepcopy

import pytest
from pydantic import ValidationError

from riva.schemas.evaluation import (
    EvaluationInput,
    EvaluationRunPayload,
    PracticeEvaluationDimension,
    PracticeEvaluationFollowUpCompletionReason,
    PracticeEvaluationOutput,
    PracticeFocusAssessmentStatus,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)


CORE_DIMENSIONS = [
    "relevance",
    "structure",
    "specificity",
    "communication",
]


def dimension_score(dimension: str, *, score: object = 80) -> dict[str, object]:
    return {
        "dimension": dimension,
        "score": score,
        "explanation": "  The answer addresses the question with a clear basis.  ",
    }


def output_payload(
    *,
    dimensions: list[dict[str, object]] | None = None,
    focus_assessments: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return {
        "overallScore": 80,
        "dimensionScores": dimensions
        or [dimension_score(dimension) for dimension in CORE_DIMENSIONS],
        "focusAssessments": focus_assessments or [],
    }


def question_payload(
    *,
    question_type: str = "projectDeepDive",
    difficulty: str = "basic",
    scoring_focus: list[str] | None = None,
) -> dict[str, object]:
    return {
        "prompt": "Explain how you designed the payment boundary.",
        "questionType": question_type,
        "difficulty": difficulty,
        "assessedCapabilities": ["service design"],
        "scoringFocus": scoring_focus or ["personal contribution"],
    }


def input_payload(
    *,
    language: str = "zh-CN",
    question_type: str = "projectDeepDive",
    difficulty: str = "basic",
    exchanges: list[dict[str, object]] | None = None,
    completion_reason: str = "noFollowUpRequired",
) -> dict[str, object]:
    return {
        "interactionLanguage": language,
        "question": question_payload(
            question_type=question_type,
            difficulty=difficulty,
        ),
        "mainAnswer": {"content": "I owned the service boundary."},
        "followUpExchanges": exchanges or [],
        "followUpCompletionReason": completion_reason,
    }


def follow_up_exchange(order: int) -> dict[str, object]:
    return {
        "order": order,
        "prompt": "What result did you observe?",
        "focus": "result evidence",
        "answer": "The failure rate fell after the rollout.",
    }


def test_dimension_enum_has_exactly_the_eight_contract_values() -> None:
    assert [item.value for item in PracticeEvaluationDimension] == [
        "relevance",
        "structure",
        "specificity",
        "personalContribution",
        "resultsAndEvidence",
        "roleAlignment",
        "communication",
        "riskControl",
    ]


def test_output_requires_four_core_dimensions_and_accepts_optional_dimensions() -> None:
    parsed = PracticeEvaluationOutput.model_validate(
        output_payload(
            dimensions=[
                *[dimension_score(dimension) for dimension in CORE_DIMENSIONS],
                dimension_score("resultsAndEvidence", score=70),
            ]
        )
    )

    assert [item.dimension.value for item in parsed.dimension_scores] == [
        *CORE_DIMENSIONS[:3],
        "communication",
        "resultsAndEvidence",
    ]
    assert parsed.model_dump(mode="json", by_alias=True)["overallScore"] == 80


@pytest.mark.parametrize(
    "dimensions",
    [
        [dimension_score(dimension) for dimension in CORE_DIMENSIONS[:3]]
        + [dimension_score("relevance")],
        [dimension_score(dimension) for dimension in CORE_DIMENSIONS[:3]],
    ],
)
def test_output_rejects_duplicate_or_missing_core_dimensions(
    dimensions: list[dict[str, object]],
) -> None:
    with pytest.raises(ValidationError):
        PracticeEvaluationOutput.model_validate(output_payload(dimensions=dimensions))


@pytest.mark.parametrize("score", [0, 100])
def test_output_accepts_score_boundaries(score: int) -> None:
    parsed = PracticeEvaluationOutput.model_validate(
        {
            **output_payload(),
            "overallScore": score,
            "dimensionScores": [
                dimension_score(dimension, score=score)
                for dimension in CORE_DIMENSIONS
            ],
        }
    )

    assert parsed.overall_score == score


@pytest.mark.parametrize("score", [87.5, "87", True])
def test_output_rejects_non_strict_scores(score: object) -> None:
    payload = output_payload()
    payload["overallScore"] = score
    with pytest.raises(ValidationError):
        PracticeEvaluationOutput.model_validate(payload)

    payload = output_payload()
    payload["dimensionScores"] = [
        dimension_score(dimension, score=score) for dimension in CORE_DIMENSIONS
    ]
    with pytest.raises(ValidationError):
        PracticeEvaluationOutput.model_validate(payload)


def test_output_trims_explanations_and_rejects_blank_or_extra_fields() -> None:
    payload = output_payload()
    payload["dimensionScores"][0]["explanation"] = "  Specific explanation.  "
    parsed = PracticeEvaluationOutput.model_validate(payload)
    assert parsed.dimension_scores[0].explanation == "Specific explanation."

    blank = output_payload()
    blank["dimensionScores"][0]["explanation"] = "   "
    with pytest.raises(ValidationError):
        PracticeEvaluationOutput.model_validate(blank)

    extra = output_payload()
    extra["review"] = "not allowed"
    with pytest.raises(ValidationError):
        PracticeEvaluationOutput.model_validate(extra)

    nested_extra = output_payload()
    nested_extra["dimensionScores"][0]["reasoning"] = "hidden"
    with pytest.raises(ValidationError):
        PracticeEvaluationOutput.model_validate(nested_extra)


def test_input_requires_language_and_covers_question_types_and_difficulties() -> None:
    payload = input_payload()
    payload.pop("interactionLanguage")
    with pytest.raises(ValidationError):
        EvaluationInput.model_validate(payload)

    for question_type in QuestionCardQuestionType:
        for difficulty in QuestionCardDifficulty:
            parsed = EvaluationInput.model_validate(
                input_payload(
                    question_type=question_type.value,
                    difficulty=difficulty.value,
                )
            )
            assert parsed.question.question_type == question_type
            assert parsed.question.difficulty == difficulty


def test_input_validates_completion_reason_and_continuous_follow_up_orders() -> None:
    no_follow_up = EvaluationInput.model_validate(input_payload())
    assert no_follow_up.follow_up_exchanges == []
    assert (
        no_follow_up.follow_up_completion_reason
        == PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
    )

    one = EvaluationInput.model_validate(
        input_payload(
            exchanges=[follow_up_exchange(1)],
            completion_reason="allAnswered",
        )
    )
    assert [item.order for item in one.follow_up_exchanges] == [1]

    two = EvaluationInput.model_validate(
        input_payload(
            exchanges=[follow_up_exchange(1), follow_up_exchange(2)],
            completion_reason="allAnswered",
        )
    )
    assert [item.order for item in two.follow_up_exchanges] == [1, 2]

    invalid_reason = input_payload(
        exchanges=[follow_up_exchange(1)],
        completion_reason="noFollowUpRequired",
    )
    with pytest.raises(ValidationError):
        EvaluationInput.model_validate(invalid_reason)

    invalid_empty = input_payload(completion_reason="allAnswered")
    with pytest.raises(ValidationError):
        EvaluationInput.model_validate(invalid_empty)


@pytest.mark.parametrize(
    "exchanges",
    [
        [follow_up_exchange(2)],
        [follow_up_exchange(1), follow_up_exchange(1)],
        [follow_up_exchange(2), follow_up_exchange(1)],
    ],
)
def test_input_rejects_duplicate_or_skipped_follow_up_order(
    exchanges: list[dict[str, object]],
) -> None:
    with pytest.raises(ValidationError):
        EvaluationInput.model_validate(
            input_payload(exchanges=exchanges, completion_reason="allAnswered")
        )


def test_input_rejects_unknown_fields_and_focus_status_or_index_contract() -> None:
    extra = input_payload()
    extra["profile"] = {"secret": True}
    with pytest.raises(ValidationError):
        EvaluationInput.model_validate(extra)

    for status in ("demonstrated", "partial", "missing"):
        parsed = PracticeEvaluationOutput.model_validate(
            output_payload(
                focus_assessments=[
                    {
                        "focusIndex": 0,
                        "status": status,
                        "explanation": "The answer provides relevant evidence.",
                    }
                ]
            )
        )
        assert parsed.focus_assessments[0].status == PracticeFocusAssessmentStatus(
            status
        )

    for invalid_index in [True, "0", -1]:
        with pytest.raises(ValidationError):
            PracticeEvaluationOutput.model_validate(
                output_payload(
                    focus_assessments=[
                        {
                            "focusIndex": invalid_index,
                            "status": "missing",
                            "explanation": "The answer does not provide evidence.",
                        }
                    ]
                )
            )

    focus_extra = output_payload(
        focus_assessments=[
            {
                "focusIndex": 0,
                "status": "demonstrated",
                "explanation": "Evidence is present.",
                "suggestion": "Add more.",
            }
        ]
    )
    with pytest.raises(ValidationError):
        PracticeEvaluationOutput.model_validate(focus_extra)


def test_input_validation_does_not_mutate_payload() -> None:
    payload = input_payload()
    before = deepcopy(payload)

    EvaluationInput.model_validate(payload)

    assert payload == before


def evaluation_run_payload(
    *,
    reason: str = "noFollowUpRequired",
    include_first: bool = False,
    include_second: bool = False,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "attemptId": "00000000-0000-4000-8000-000000000001",
        "questionCardId": "00000000-0000-4000-8000-000000000002",
        "mainAnswerId": "00000000-0000-4000-8000-000000000003",
        "interactionLanguage": "en",
        "followUpCompletionReason": reason,
        "terminalFollowUpDecisionId": "00000000-0000-4000-8000-000000000004",
    }
    if include_first:
        payload.update(
            {
                "followUpQuestion1Id": "00000000-0000-4000-8000-000000000011",
                "followUpAnswer1Id": "00000000-0000-4000-8000-000000000012",
            }
        )
    if include_second:
        payload.update(
            {
                "followUpQuestion2Id": "00000000-0000-4000-8000-000000000021",
                "followUpAnswer2Id": "00000000-0000-4000-8000-000000000022",
            }
        )
    return payload


def test_evaluation_run_payload_is_camel_case_and_excludes_absent_follow_ups() -> None:
    parsed = EvaluationRunPayload.model_validate(evaluation_run_payload())

    assert parsed.model_dump(
        mode="json",
        by_alias=True,
        exclude_none=True,
    ) == evaluation_run_payload()


@pytest.mark.parametrize(
    ("reason", "include_first", "include_second"),
    [
        ("noFollowUpRequired", False, False),
        ("allAnswered", True, False),
        ("allAnswered", True, True),
    ],
)
def test_evaluation_run_payload_accepts_frozen_completion_shapes(
    reason: str,
    include_first: bool,
    include_second: bool,
) -> None:
    parsed = EvaluationRunPayload.model_validate(
        evaluation_run_payload(
            reason=reason,
            include_first=include_first,
            include_second=include_second,
        )
    )

    assert parsed.follow_up_completion_reason.value == reason
    assert (parsed.follow_up_question_1_id is not None) is include_first
    assert (parsed.follow_up_question_2_id is not None) is include_second


@pytest.mark.parametrize(
    "payload",
    [
        evaluation_run_payload(
            reason="noFollowUpRequired",
            include_first=True,
        ),
        {
            **evaluation_run_payload(reason="allAnswered"),
            "followUpQuestion1Id": "00000000-0000-4000-8000-000000000011",
        },
        {
            **evaluation_run_payload(reason="allAnswered", include_first=True),
            "followUpAnswer1Id": None,
        },
        {
            **evaluation_run_payload(reason="allAnswered"),
            "followUpQuestion2Id": "00000000-0000-4000-8000-000000000021",
            "followUpAnswer2Id": "00000000-0000-4000-8000-000000000022",
        },
        {**evaluation_run_payload(), "answerText": "raw answer"},
    ],
)
def test_evaluation_run_payload_rejects_unfrozen_or_content_fields(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        EvaluationRunPayload.model_validate(payload)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("attemptId", "not-a-uuid"),
        ("interactionLanguage", "fr"),
        ("followUpCompletionReason", "complete"),
        ("terminalFollowUpDecisionId", None),
    ],
)
def test_evaluation_run_payload_rejects_invalid_controls(
    field: str,
    value: object,
) -> None:
    payload = evaluation_run_payload()
    payload[field] = value

    with pytest.raises(ValidationError):
        EvaluationRunPayload.model_validate(payload)
