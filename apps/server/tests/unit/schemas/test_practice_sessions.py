from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import TypeAdapter, ValidationError
import pytest

from riva.schemas.practice_sessions import (
    PracticeAttemptStatus,
    PracticeActiveSessionResponse,
    PracticeAnsweringResponse,
    PracticeGeneratingQuestionResponse,
    PracticeQuestionResponse,
    RefreshPracticeQuestionGenerationRequest,
    StartPracticeSessionRequest,
    PracticeQuestionSource,
    PracticeSessionCompletionReason,
    PracticeSessionSelection,
    PracticeSessionStatus,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)


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


def test_start_request_has_explicit_name_and_rejects_language() -> None:
    payload = selection_payload()
    request = StartPracticeSessionRequest.model_validate(payload)

    assert request.model_dump() == PracticeSessionSelection.model_validate(
        payload
    ).model_dump()
    with pytest.raises(ValidationError):
        StartPracticeSessionRequest.model_validate(
            {**payload, "language": "en"}
        )


def test_refresh_request_requires_positive_version_and_rejects_run_id() -> None:
    assert RefreshPracticeQuestionGenerationRequest.model_validate(
        {"version": 1}
    ).version == 1
    with pytest.raises(ValidationError):
        RefreshPracticeQuestionGenerationRequest.model_validate({"version": 0})
    with pytest.raises(ValidationError):
        RefreshPracticeQuestionGenerationRequest.model_validate(
            {"version": 1, "runId": str(uuid4())}
        )


def public_session_payload(status: str = "generatingQuestion") -> dict[str, object]:
    payload: dict[str, object] = {
        "status": status,
        "sessionId": str(uuid4()),
        "language": "en",
        "version": 1,
        "selection": selection_payload(),
        "startedAt": datetime(2026, 8, 11, 12, 0, tzinfo=UTC).isoformat(),
        "attemptId": str(uuid4()),
        "attemptNumber": 1,
    }
    if status == "answering":
        payload["question"] = {
            "id": str(uuid4()),
            "prompt": "Tell me about a project.",
            "questionType": "projectDeepDive",
            "difficulty": "basic",
            "assessedCapabilities": ["Ownership"],
            "recommendedMaterials": [
                {
                    "type": "projectExperience",
                    "id": str(uuid4()),
                    "label": "Migration project",
                    "reason": "Relevant evidence",
                }
            ],
            "isSaved": False,
            "isMarkedWeak": True,
        }
    return payload


def test_active_response_union_exposes_only_supported_states() -> None:
    adapter = TypeAdapter(PracticeActiveSessionResponse)
    generating = adapter.validate_python(public_session_payload())
    answering = adapter.validate_python(public_session_payload("answering"))

    assert isinstance(generating, PracticeGeneratingQuestionResponse)
    assert isinstance(answering, PracticeAnsweringResponse)
    assert isinstance(answering.question, PracticeQuestionResponse)
    with pytest.raises(ValidationError):
        adapter.validate_python(public_session_payload("review"))


def test_question_projection_hides_internal_fields_and_defaults_guidance() -> None:
    payload = public_session_payload("answering")["question"]
    assert isinstance(payload, dict)
    payload["sourceAgentRunId"] = str(uuid4())
    with pytest.raises(ValidationError):
        PracticeQuestionResponse.model_validate(payload)

    payload.pop("sourceAgentRunId")
    question = PracticeQuestionResponse.model_validate(payload)
    serialized = question.model_dump(mode="json")
    assert serialized["recommendedMaterials"][0]["type"] == "projectExperience"
    assert serialized["answerHints"] == {
        "status": "notRequested",
        "content": None,
    }
    assert serialized["answerFramework"] == {
        "status": "notRequested",
        "content": None,
    }
    assert serialized["referenceAnswer"] == {
        "status": "notRequested",
        "content": None,
        "viewedBeforeSubmission": False,
    }
    assert "templateId" not in serialized
    assert "followUpDirections" not in serialized
    assert "scoringFocus" not in serialized


def test_active_response_rejects_naive_timestamp_and_unknown_fields() -> None:
    payload = public_session_payload()
    payload["startedAt"] = "2026-08-11T12:00:00"
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)

    payload = public_session_payload()
    payload["unexpected"] = True
    with pytest.raises(ValidationError):
        TypeAdapter(PracticeActiveSessionResponse).validate_python(payload)
