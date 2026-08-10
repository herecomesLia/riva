from copy import deepcopy
from uuid import uuid4

from pydantic import ValidationError
import pytest

from riva.schemas.question_cards import (
    MAX_QUESTION_CARD_LIST_ITEM_LENGTH,
    MAX_QUESTION_CARD_LIST_ITEMS,
    MAX_QUESTION_CARD_PROMPT_LENGTH,
    MAX_QUESTION_CARD_RECOMMENDED_MATERIALS,
    QuestionCardQuestionType,
)
from riva.schemas.question_generation import (
    MAX_QUESTION_GENERATION_PROFILE_SKILLS,
    QuestionGenerationInput,
    QuestionGenerationOutput,
)
from tests.helpers.question_generation import (
    valid_question_generation_input,
    valid_question_generation_output,
)


@pytest.mark.parametrize("language", ["zh-CN", "en"])
def test_question_generation_input_accepts_both_interaction_languages(
    language: str,
) -> None:
    input = valid_question_generation_input(language)

    assert input.interaction_language == language


def test_question_generation_input_requires_interaction_language() -> None:
    payload = valid_question_generation_input().model_dump(mode="json")
    payload.pop("interaction_language")

    with pytest.raises(ValidationError):
        QuestionGenerationInput.model_validate(payload)


def test_question_generation_input_covers_all_question_types_and_difficulties() -> None:
    for question_type in QuestionCardQuestionType:
        payload = valid_question_generation_input().model_dump(mode="json")
        payload["question_type"] = question_type.value
        assert (
            QuestionGenerationInput.model_validate(payload).question_type
            == question_type
        )

    for difficulty in ("basic", "pressure"):
        payload = valid_question_generation_input().model_dump(mode="json")
        payload["difficulty"] = difficulty
        assert QuestionGenerationInput.model_validate(payload).difficulty == difficulty


def test_question_generation_input_is_curated_and_excludes_internal_profile_fields() -> None:
    payload = valid_question_generation_input().model_dump(mode="json")
    payload["career_profile"]["profile_id"] = str(uuid4())
    payload["career_profile"]["work_experiences"][0]["source"] = "userEdited"
    payload["target_role"]["user_id"] = str(uuid4())

    with pytest.raises(ValidationError):
        QuestionGenerationInput.model_validate(payload)


def test_question_generation_input_preserves_real_experience_ids_and_context_shape() -> None:
    input = valid_question_generation_input()
    work = input.career_profile.work_experiences[0]
    project = input.career_profile.project_experiences[0]

    assert work.id is not None
    assert project.id is not None
    assert project.name == "Payment API"
    assert input.job_description_analysis.required_skills.programming_languages == [
        "Python"
    ]
    assert input.matching_analysis.overall_match_score == 78


def test_question_generation_output_normalizes_lists_and_structured_materials() -> None:
    input = valid_question_generation_input()
    payload = valid_question_generation_output(input)
    payload["assessed_capabilities"] = [
        "  Personal contribution ",
        "",
        "Personal contribution",
        "Technical decision-making",
    ]
    payload["answer_hints"] = ["  Recall the context. ", "Recall the context."]

    output = QuestionGenerationOutput.model_validate(payload)

    assert output.assessed_capabilities == [
        "Personal contribution",
        "Technical decision-making",
    ]
    assert output.answer_hints == ["Recall the context."]
    assert output.recommended_materials[0].id == (
        input.career_profile.project_experiences[0].id
    )


def test_question_generation_output_uses_bounded_question_card_contract() -> None:
    input = valid_question_generation_input()
    payload = valid_question_generation_output(input)

    with pytest.raises(ValidationError):
        QuestionGenerationOutput.model_validate(
            {**payload, "prompt": "x" * (MAX_QUESTION_CARD_PROMPT_LENGTH + 1)}
        )
    with pytest.raises(ValidationError):
        QuestionGenerationOutput.model_validate(
            {
                **payload,
                "answer_hints": [
                    f"Item {index}" for index in range(MAX_QUESTION_CARD_LIST_ITEMS + 1)
                ],
            }
        )
    with pytest.raises(ValidationError):
        QuestionGenerationOutput.model_validate(
            {
                **payload,
                "scoring_focus": [
                    "x" * (MAX_QUESTION_CARD_LIST_ITEM_LENGTH + 1)
                ],
            }
        )
    with pytest.raises(ValidationError):
        QuestionGenerationOutput.model_validate(
            {
                **payload,
                "recommended_materials": [
                    *payload["recommended_materials"]
                ]
                * (MAX_QUESTION_CARD_RECOMMENDED_MATERIALS + 1),
            }
        )


def test_question_generation_input_profile_skill_count_is_bounded() -> None:
    payload = valid_question_generation_input().model_dump(mode="json")
    payload["career_profile"]["skills"] = [
        f"Skill {index}" for index in range(MAX_QUESTION_GENERATION_PROFILE_SKILLS + 1)
    ]

    with pytest.raises(ValidationError):
        QuestionGenerationInput.model_validate(payload)


def test_question_generation_schemas_reject_extra_fields() -> None:
    input_payload = valid_question_generation_input().model_dump(mode="json")
    input_payload["matching_analysis"]["provider"] = "hidden"
    with pytest.raises(ValidationError):
        QuestionGenerationInput.model_validate(input_payload)

    input = valid_question_generation_input()
    output_payload = valid_question_generation_output(input)
    output_payload["reference_answer"] = "not part of Step 2"
    with pytest.raises(ValidationError):
        QuestionGenerationOutput.model_validate(output_payload)


def test_question_generation_output_schema_does_not_mutate_input_payload() -> None:
    input = valid_question_generation_input()
    payload = valid_question_generation_output(input)
    before = deepcopy(payload)

    QuestionGenerationOutput.model_validate(payload)

    assert payload == before
