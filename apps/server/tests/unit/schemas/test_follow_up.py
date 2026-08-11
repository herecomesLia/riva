from copy import deepcopy

from pydantic import TypeAdapter, ValidationError
import pytest

from riva.schemas.follow_up import (
    FollowUpCompleteOutput,
    FollowUpGenerationOutput,
    FollowUpInput,
    FollowUpQuestionOutput,
)
from riva.schemas.question_cards import QuestionCardQuestionType


def question_context() -> dict[str, object]:
    return {
        "prompt": "  Explain how you designed the payment boundary.  ",
        "question_type": "projectDeepDive",
        "difficulty": "basic",
        "assessed_capabilities": [" Personal contribution ", "Personal contribution"],
        "follow_up_directions": ["Technical rationale"],
        "scoring_focus": ["Evidence of trade-offs"],
    }


def follow_up_input(
    *,
    language: str = "zh-CN",
    next_order: int = 1,
    previous: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return {
        "interaction_language": language,
        "question": question_context(),
        "main_answer": {
            "content": "  I owned the service boundary and reduced failures.  ",
            "order": 1,
        },
        "previous_follow_ups": previous or [],
        "next_follow_up_order": next_order,
    }


def test_follow_up_input_requires_language_and_accepts_first_exchange() -> None:
    parsed = FollowUpInput.model_validate(follow_up_input())

    assert parsed.interaction_language == "zh-CN"
    assert parsed.main_answer.content == "I owned the service boundary and reduced failures."
    assert parsed.question.prompt == "Explain how you designed the payment boundary."
    assert parsed.question.assessed_capabilities == ["Personal contribution"]
    assert parsed.previous_follow_ups == []

    missing_language = follow_up_input()
    missing_language.pop("interaction_language")
    with pytest.raises(ValidationError):
        FollowUpInput.model_validate(missing_language)


def test_follow_up_input_accepts_second_order_only_with_completed_order_one() -> None:
    payload = follow_up_input(
        next_order=2,
        previous=[
            {
                "order": 1,
                "prompt": "What trade-off did you make?",
                "answer": "I chose the boundary for operational isolation.",
            }
        ],
    )
    parsed = FollowUpInput.model_validate(payload)

    assert parsed.next_follow_up_order == 2
    assert parsed.previous_follow_ups[0].order == 1
    assert parsed.previous_follow_ups[0].answer == (
        "I chose the boundary for operational isolation."
    )


@pytest.mark.parametrize(
    ("next_order", "previous"),
    [
        (1, [{"order": 1, "prompt": "Q", "answer": "A"}]),
        (2, []),
        (
            2,
            [
                {"order": 2, "prompt": "Q", "answer": "A"},
            ],
        ),
        (
            2,
            [
                {"order": 1, "prompt": "Q", "answer": "A"},
                {"order": 1, "prompt": "Q2", "answer": "A2"},
            ],
        ),
    ],
)
def test_follow_up_input_rejects_mismatched_or_invalid_previous_context(
    next_order: int,
    previous: list[dict[str, object]],
) -> None:
    with pytest.raises(ValidationError):
        FollowUpInput.model_validate(
            follow_up_input(next_order=next_order, previous=previous)
        )


def test_follow_up_input_rejects_unknown_fields_and_invalid_main_order() -> None:
    payload = follow_up_input()
    payload["profile"] = {"secret": True}
    with pytest.raises(ValidationError):
        FollowUpInput.model_validate(payload)

    invalid_main = follow_up_input()
    invalid_main["main_answer"] = {"content": "Answer", "order": 2}
    with pytest.raises(ValidationError):
        FollowUpInput.model_validate(invalid_main)


@pytest.mark.parametrize("question_type", [item.value for item in QuestionCardQuestionType])
@pytest.mark.parametrize("difficulty", ["basic", "pressure"])
def test_follow_up_input_covers_all_question_types_and_difficulties(
    question_type: str,
    difficulty: str,
) -> None:
    payload = follow_up_input()
    payload["question"] = {**question_context(), "question_type": question_type, "difficulty": difficulty}

    parsed = FollowUpInput.model_validate(payload)

    assert parsed.question.question_type.value == question_type
    assert parsed.question.difficulty.value == difficulty


def test_follow_up_outputs_are_discriminated_and_normalized() -> None:
    adapter = TypeAdapter(FollowUpGenerationOutput)

    complete = adapter.validate_python({"action": "complete"})
    assert isinstance(complete, FollowUpCompleteOutput)
    assert complete.model_dump() == {"action": "complete"}

    ask = adapter.validate_python(
        {
            "action": "askFollowUp",
            "prompt": "  How did you validate the result?  ",
            "focus": "  Result attribution evidence  ",
            "answer_hints": [" Recall the metric. ", "Recall the metric.", ""],
            "answer_framework": ["Evidence", " Evidence ", "Attribution"],
        }
    )
    assert isinstance(ask, FollowUpQuestionOutput)
    assert ask.prompt == "How did you validate the result?"
    assert ask.focus == "Result attribution evidence"
    assert ask.answer_hints == ["Recall the metric."]
    assert ask.answer_framework == ["Evidence", "Attribution"]


def test_follow_up_outputs_reject_extra_or_cross_variant_fields() -> None:
    adapter = TypeAdapter(FollowUpGenerationOutput)

    for payload in (
        {"action": "complete", "prompt": "extra"},
        {
            "action": "askFollowUp",
            "prompt": "Question?",
            "focus": "Focus",
            "answer_hints": [],
            "answer_framework": [],
            "reasoning": "hidden",
        },
        {
            "action": "askFollowUp",
            "prompt": "Question?",
            "focus": "Focus",
            "answer_hints": [],
        },
    ):
        with pytest.raises(ValidationError):
            adapter.validate_python(payload)


def test_follow_up_validation_does_not_mutate_payload() -> None:
    payload = follow_up_input()
    before = deepcopy(payload)

    FollowUpInput.model_validate(payload)

    assert payload == before
