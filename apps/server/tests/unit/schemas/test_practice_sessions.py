from uuid import UUID, uuid4

from pydantic import ValidationError
import pytest

from riva.schemas.practice_sessions import (
    PracticeAttemptStatus,
    PracticeQuestionSource,
    PracticeSessionCompletionReason,
    PracticeSessionSelection,
    PracticeSessionStatus,
)
from riva.schemas.question_cards import QuestionCardDifficulty, QuestionCardQuestionType


def selection_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "targetRoleId": str(uuid4()),
        "questionType": "projectDeepDive",
        "difficulty": "basic",
        "source": "personalized",
        "prioritizeWeaknesses": False,
    }
    payload.update(overrides)
    return payload


def test_practice_selection_enums_cover_the_public_contract() -> None:
    assert {item.value for item in PracticeQuestionSource} == {
        "personalized",
        "saved",
        "history",
    }
    assert {item.value for item in QuestionCardQuestionType} == {
        "projectDeepDive",
        "behavioral",
        "businessUnderstanding",
        "motivation",
        "technicalFoundation",
    }
    assert {item.value for item in QuestionCardDifficulty} == {"basic", "pressure"}


def test_practice_lifecycle_enums_are_exact() -> None:
    assert {item.value for item in PracticeSessionStatus} == {
        "active",
        "completed",
    }
    assert {item.value for item in PracticeSessionCompletionReason} == {
        "reviewCompleted",
        "userEndedEarly",
    }
    assert {item.value for item in PracticeAttemptStatus} == {
        "generatingQuestion",
        "answering",
        "answeringFollowUp",
        "evaluating",
        "review",
        "completed",
        "endedEarly",
    }


@pytest.mark.parametrize(
    "question_type",
    [item.value for item in QuestionCardQuestionType],
)
@pytest.mark.parametrize("difficulty", [item.value for item in QuestionCardDifficulty])
@pytest.mark.parametrize(
    "source",
    [item.value for item in PracticeQuestionSource],
)
def test_practice_session_selection_accepts_all_selection_values(
    question_type: str,
    difficulty: str,
    source: str,
) -> None:
    selection = PracticeSessionSelection.model_validate(
        selection_payload(
            questionType=question_type,
            difficulty=difficulty,
            source=source,
        )
    )

    assert selection.question_type == question_type
    assert selection.difficulty == difficulty
    assert selection.source == source


def test_practice_session_selection_uses_camel_case_and_standard_uuid() -> None:
    role_id = uuid4()
    selection = PracticeSessionSelection.model_validate(
        selection_payload(targetRoleId=str(role_id))
    )

    assert selection.target_role_id == role_id
    assert set(selection.model_dump()) == {
        "targetRoleId",
        "questionType",
        "difficulty",
        "source",
        "prioritizeWeaknesses",
    }
    assert selection.model_dump(mode="json")["targetRoleId"] == str(role_id)


def test_practice_session_selection_rejects_invalid_uuid_and_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        PracticeSessionSelection.model_validate(
            selection_payload(targetRoleId="not-a-uuid")
        )

    with pytest.raises(ValidationError):
        PracticeSessionSelection.model_validate(
            selection_payload(unexpectedField=True)
        )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("questionType", "other"),
        ("difficulty", "advanced"),
        ("source", "template"),
    ],
)
def test_practice_session_selection_rejects_invalid_enum_values(
    field: str,
    value: str,
) -> None:
    with pytest.raises(ValidationError):
        PracticeSessionSelection.model_validate(selection_payload(**{field: value}))


def test_practice_session_selection_round_trips_through_json() -> None:
    selection = PracticeSessionSelection.model_validate(selection_payload())
    serialized = selection.model_dump(mode="json")
    restored = PracticeSessionSelection.model_validate(serialized)

    assert serialized == selection_payload(
        targetRoleId=str(selection.target_role_id)
    )
    assert restored == selection
    assert isinstance(restored.target_role_id, UUID)
