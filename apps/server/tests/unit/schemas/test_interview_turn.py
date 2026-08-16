import pytest
from pydantic import ValidationError

from riva.schemas.interview_turn import (
    InterviewTurnInput,
    InterviewTurnOutput,
    InterviewTurnRunPayload,
)
from tests.unit.agents.test_interview_turn import turn_input


def test_interview_turn_input_and_payload_preserve_lineage_in_camel_case() -> None:
    input = turn_input()
    payload = InterviewTurnRunPayload(
        session_id=input.session.id,
        session_version=input.session.version,
        session_state_version=input.session.version + 1,
        plan_id=input.plan_id,
        plan_revision=input.plan_revision,
        question_id=input.question_id,
        target_type="main",
        submitted_answer_id=input.main_answer.id,
        main_answer_id=input.main_answer.id,
        interaction_language=input.session.language,
        remaining_follow_up_slots=input.remaining_follow_up_slots,
        interview_turn_input=input,
    )

    wire = payload.model_dump(mode="json", by_alias=True)

    assert wire["targetType"] == "main"
    assert wire["interviewTurnInput"]["plannedQuestion"]["questionType"] == (
        "projectDeepDive"
    )
    assert InterviewTurnRunPayload.model_validate(wire) == payload


def test_interview_turn_input_rejects_non_contiguous_follow_ups() -> None:
    value = turn_input().model_dump(mode="json", by_alias=True)
    value["answeredFollowUps"] = [
        {
            "order": 2,
            "questionId": str(value["questionId"]),
            "prompt": "What signal supported that choice?",
            "answer": {
                "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                "content": "The error rate stayed low.",
                "submittedAt": "2026-08-16T10:01:00Z",
            },
        }
    ]
    value["remainingFollowUpSlots"] = 1

    with pytest.raises(ValidationError):
        InterviewTurnInput.model_validate(value)


@pytest.mark.parametrize(
    "output",
    [
        {
            "assessment": {
                "score": 101,
                "summary": "Invalid score",
                "strengths": [],
                "issues": [],
            },
            "nextAction": {"type": "completeQuestion"},
        },
        {
            "assessment": {
                "score": 80,
                "summary": "Valid assessment",
                "strengths": [],
                "issues": [],
            },
            "nextAction": {"type": "unknown"},
        },
    ],
)
def test_interview_turn_output_is_strict(output: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        InterviewTurnOutput.model_validate(output)
