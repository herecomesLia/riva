from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from riva.schemas.question_cards import (
    MAX_QUESTION_CARD_LIST_ITEM_LENGTH,
    MAX_QUESTION_CARD_LIST_ITEMS,
    MAX_QUESTION_CARD_MATERIAL_LABEL_LENGTH,
    MAX_QUESTION_CARD_MATERIAL_REASON_LENGTH,
    MAX_QUESTION_CARD_PROMPT_LENGTH,
    MAX_QUESTION_CARD_RECOMMENDED_MATERIALS,
    QuestionCardDifficulty,
    QuestionCardMaterialReference,
    QuestionCardMaterialType,
    QuestionCardQuestionType,
    QuestionCardResponse,
    QuestionGenerationStatusResponse,
    StartQuestionGenerationRequest,
)


def material_payload(
    *,
    material_type: str = "projectExperience",
    material_id: str | None = None,
    label: str = "Payment API",
    reason: str = "Shows ownership of a reliable service.",
) -> dict[str, str]:
    return {
        "type": material_type,
        "id": material_id or str(uuid4()),
        "label": label,
        "reason": reason,
    }


def valid_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "id": str(uuid4()),
        "targetRoleId": str(uuid4()),
        "language": "zh-CN",
        "questionType": "projectDeepDive",
        "difficulty": "basic",
        "prompt": "  Tell me about the payment API project.  ",
        "assessedCapabilities": ["  Ownership ", "", "Ownership", "System design"],
        "recommendedMaterials": [material_payload()],
        "answerHints": ["  State the context. ", "State the context."],
        "answerFramework": ["Context", "Action", "Result"],
        "isSaved": False,
        "isMarkedWeak": False,
        "createdAt": datetime(2026, 1, 1, tzinfo=UTC).isoformat(),
        "updatedAt": datetime(2026, 1, 2, tzinfo=UTC).isoformat(),
    }
    payload.update(overrides)
    return payload


def test_question_card_enums_cover_the_public_contract() -> None:
    assert {item.value for item in QuestionCardQuestionType} == {
        "projectDeepDive",
        "behavioral",
        "businessUnderstanding",
        "motivation",
        "technicalFoundation",
    }
    assert {item.value for item in QuestionCardDifficulty} == {"basic", "pressure"}
    assert {item.value for item in QuestionCardMaterialType} == {
        "workExperience",
        "projectExperience",
    }


@pytest.mark.parametrize("language", ["zh-CN", "en"])
@pytest.mark.parametrize(
    "question_type", [item.value for item in QuestionCardQuestionType]
)
@pytest.mark.parametrize("difficulty", [item.value for item in QuestionCardDifficulty])
def test_question_card_response_accepts_all_language_type_and_difficulty_values(
    language: str,
    question_type: str,
    difficulty: str,
) -> None:
    response = QuestionCardResponse.model_validate(
        valid_payload(
            language=language,
            questionType=question_type,
            difficulty=difficulty,
        )
    )

    assert response.language == language
    assert response.question_type == question_type
    assert response.difficulty == difficulty


def test_material_reference_normalizes_text_and_rejects_unknown_type() -> None:
    reference = QuestionCardMaterialReference.model_validate(
        material_payload(
            label="  Payment API  ",
            reason="  Demonstrates ownership.  ",
        )
    )

    assert reference.label == "Payment API"
    assert reference.reason == "Demonstrates ownership."

    with pytest.raises(ValidationError):
        QuestionCardMaterialReference.model_validate(
            material_payload(material_type="resume")
        )


def test_question_card_response_normalizes_whitespace_and_duplicate_lists() -> None:
    response = QuestionCardResponse.model_validate(valid_payload())

    assert response.prompt == "Tell me about the payment API project."
    assert response.assessed_capabilities == ["Ownership", "System design"]
    assert response.answer_hints == ["State the context."]


def test_question_card_response_deduplicates_material_references_by_profile_item() -> (
    None
):
    material_id = str(uuid4())
    response = QuestionCardResponse.model_validate(
        valid_payload(
            recommendedMaterials=[
                material_payload(material_id=material_id, reason="First reason"),
                material_payload(material_id=material_id, reason="Second reason"),
            ]
        )
    )

    assert len(response.recommended_materials) == 1
    assert response.recommended_materials[0].reason == "First reason"


@pytest.mark.parametrize(
    "field",
    ["assessedCapabilities", "answerHints", "answerFramework"],
)
def test_question_card_text_lists_are_bounded(field: str) -> None:
    with pytest.raises(ValidationError):
        QuestionCardResponse.model_validate(
            valid_payload(
                **{
                    field: [
                        f"Item {index}"
                        for index in range(MAX_QUESTION_CARD_LIST_ITEMS + 1)
                    ]
                }
            )
        )


def test_question_card_material_list_is_bounded() -> None:
    with pytest.raises(ValidationError):
        QuestionCardResponse.model_validate(
            valid_payload(
                recommendedMaterials=[
                    material_payload()
                    for _ in range(MAX_QUESTION_CARD_RECOMMENDED_MATERIALS + 1)
                ]
            )
        )


def test_question_card_prompt_and_text_items_are_bounded() -> None:
    with pytest.raises(ValidationError):
        QuestionCardResponse.model_validate(
            valid_payload(prompt="x" * (MAX_QUESTION_CARD_PROMPT_LENGTH + 1))
        )

    with pytest.raises(ValidationError):
        QuestionCardResponse.model_validate(
            valid_payload(
                assessedCapabilities=["x" * (MAX_QUESTION_CARD_LIST_ITEM_LENGTH + 1)]
            )
        )


def test_question_card_material_label_and_reason_are_bounded() -> None:
    with pytest.raises(ValidationError):
        QuestionCardMaterialReference.model_validate(
            material_payload(label="x" * (MAX_QUESTION_CARD_MATERIAL_LABEL_LENGTH + 1))
        )

    with pytest.raises(ValidationError):
        QuestionCardMaterialReference.model_validate(
            material_payload(
                reason="x" * (MAX_QUESTION_CARD_MATERIAL_REASON_LENGTH + 1)
            )
        )


def test_question_card_response_rejects_blank_prompt_and_unknown_values() -> None:
    with pytest.raises(ValidationError):
        QuestionCardResponse.model_validate(valid_payload(prompt="   "))
    with pytest.raises(ValidationError):
        QuestionCardResponse.model_validate(valid_payload(language="fr"))
    with pytest.raises(ValidationError):
        QuestionCardResponse.model_validate(valid_payload(questionType="other"))
    with pytest.raises(ValidationError):
        QuestionCardResponse.model_validate(valid_payload(difficulty="advanced"))


def test_question_card_response_serializes_camel_case_and_hides_internal_fields() -> (
    None
):
    response = QuestionCardResponse.model_validate(valid_payload())
    dumped = response.model_dump(mode="json")

    assert dumped["targetRoleId"] == str(response.target_role_id)
    assert "assessedCapabilities" in dumped
    assert "recommendedMaterials" in dumped
    assert "answerHints" in dumped
    assert "answerFramework" in dumped
    assert all(
        field not in dumped
        for field in (
            "sourceAgentRunId",
            "matchingAnalysisRunId",
            "profileVersion",
            "jobDescriptionVersion",
            "jobDescriptionAnalysisVersion",
            "followUpDirections",
            "scoringFocus",
        )
    )

    assert set(QuestionCardResponse.model_fields) == {
        "id",
        "target_role_id",
        "language",
        "question_type",
        "difficulty",
        "prompt",
        "assessed_capabilities",
        "recommended_materials",
        "answer_hints",
        "answer_framework",
        "is_saved",
        "is_marked_weak",
        "created_at",
        "updated_at",
    }


def test_start_question_generation_request_is_camel_case_and_strict() -> None:
    request = StartQuestionGenerationRequest.model_validate(
        {
            "requestId": str(uuid4()),
            "targetRoleId": str(uuid4()),
            "questionType": "projectDeepDive",
            "difficulty": "basic",
        }
    )

    assert set(request.model_dump(mode="json")) == {
        "requestId",
        "targetRoleId",
        "questionType",
        "difficulty",
    }
    with pytest.raises(ValidationError):
        StartQuestionGenerationRequest.model_validate(
            {
                **request.model_dump(mode="json"),
                "interactionLanguage": "en",
            }
        )


def test_question_generation_status_response_enforces_lifecycle_states() -> None:
    common = {
        "runId": str(uuid4()),
        "questionType": "projectDeepDive",
        "difficulty": "basic",
        "language": "en",
        "attemptCount": 0,
        "maxAttempts": 3,
        "errorCode": None,
        "failureReason": None,
        "createdAt": datetime(2026, 1, 1, tzinfo=UTC).isoformat(),
        "startedAt": None,
        "finishedAt": None,
        "questionCard": None,
    }
    queued = QuestionGenerationStatusResponse.model_validate(
        {**common, "status": "queued"}
    )
    assert queued.status == "queued"

    with pytest.raises(ValidationError):
        QuestionGenerationStatusResponse.model_validate(
            {
                **common,
                "status": "succeeded",
            }
        )
    with pytest.raises(ValidationError):
        QuestionGenerationStatusResponse.model_validate(
            {**common, "status": "queued", "createdAt": "2026-01-01T00:00:00"}
        )
