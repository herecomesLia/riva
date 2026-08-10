import asyncio
import json

import pytest

from riva.agents import QuestionGenerationAgent
from riva.integrations import (
    GenerationParameters,
    InvalidStructuredOutputError,
    LLMUsage,
    MessageRole,
    ProviderUnavailableError,
)
from riva.prompts import QUESTION_GENERATION_PROMPT
from riva.schemas.question_generation import QuestionGenerationOutput
from tests.helpers.llm import FakeLLMProvider
from tests.helpers.question_generation import (
    valid_question_generation_input,
    valid_question_generation_output,
)


def test_agent_uses_fixed_identity_prompt_schema_and_parameters() -> None:
    input = valid_question_generation_input()
    provider = FakeLLMProvider([valid_question_generation_output(input)])
    parameters = GenerationParameters(temperature=0, max_output_tokens=2_000)
    agent = QuestionGenerationAgent(
        provider,
        model="test-question-model",
        parameters=parameters,
    )

    result = asyncio.run(agent.run(input))

    assert agent.agent_id == "question-generator"
    assert agent.prompt_id == "question-generator"
    assert agent.prompt_version == "1"
    assert result.agent_id == "question-generator"
    assert result.prompt_id == "question-generator"
    assert result.prompt_version == "1"

    request = provider.calls[0]
    assert request.output_schema is QuestionGenerationOutput
    assert request.model == "test-question-model"
    assert request.parameters is parameters
    assert [message.role for message in request.messages] == [
        MessageRole.SYSTEM,
        MessageRole.USER,
    ]


def test_agent_renders_selected_controls_and_stable_utf8_context_without_mutation() -> None:
    input = valid_question_generation_input()
    before = input.model_dump(mode="json")
    agent = QuestionGenerationAgent(
        FakeLLMProvider([valid_question_generation_output(input)]),
        model="test-model",
    )

    values = agent.prompt_values(input)

    assert set(values) == {
        "interaction_language",
        "question_type",
        "difficulty",
        "target_role",
        "career_profile",
        "job_description_analysis",
        "matching_analysis",
    }
    assert values["interaction_language"] == "zh-CN"
    assert values["question_type"] == "projectDeepDive"
    assert values["difficulty"] == "basic"
    assert values["career_profile"] == json.dumps(
        input.career_profile.model_dump(mode="json"),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    assert "Python" in values["career_profile"]
    assert "\\u4e2d" not in values["career_profile"]

    rendered = agent.prompt.render(values)
    assert "Requested question type: projectDeepDive" in rendered.user
    assert "Requested difficulty: basic" in rendered.user
    assert "Payment API" in rendered.user
    assert input.model_dump(mode="json") == before


def test_agent_returns_output_and_canonicalizes_material_label() -> None:
    input = valid_question_generation_input()
    provider = FakeLLMProvider([valid_question_generation_output(input)])
    agent = QuestionGenerationAgent(provider, model="test-model")

    result = asyncio.run(agent.run(input))

    assert isinstance(result.output, QuestionGenerationOutput)
    assert result.output.recommended_materials[0].label == "Payment API"
    assert result.output.recommended_materials[0].reason == (
        "Shows a relevant service design decision."
    )


def test_agent_accepts_valid_work_material_and_canonicalizes_company_title_label() -> None:
    input = valid_question_generation_input()
    payload = valid_question_generation_output(input)
    payload["recommended_materials"][0] = {
        "type": "workExperience",
        "id": str(input.career_profile.work_experiences[0].id),
        "label": "Wrong label",
        "reason": "Relevant work evidence.",
    }
    agent = QuestionGenerationAgent(
        FakeLLMProvider([payload]),
        model="test-model",
    )

    result = asyncio.run(agent.run(input))

    assert result.output.recommended_materials[0].label == "Riva / Backend Engineer"


@pytest.mark.parametrize(
    ("field", "value", "location"),
    [
        ("question_type", "behavioral", "question_type"),
        ("difficulty", "pressure", "difficulty"),
    ],
)
def test_agent_rejects_output_that_changes_requested_controls(
    field: str,
    value: str,
    location: str,
) -> None:
    input = valid_question_generation_input()
    payload = valid_question_generation_output(input)
    payload[field] = value
    agent = QuestionGenerationAgent(FakeLLMProvider([payload]), model="test-model")

    with pytest.raises(InvalidStructuredOutputError) as error:
        asyncio.run(agent.run(input))

    assert error.value.diagnostics is not None
    assert error.value.diagnostics.validation_errors[0].location == location


def test_agent_rejects_nonexistent_material_id() -> None:
    input = valid_question_generation_input()
    payload = valid_question_generation_output(input)
    payload["recommended_materials"][0]["id"] = str(__import__("uuid").uuid4())
    agent = QuestionGenerationAgent(FakeLLMProvider([payload]), model="test-model")

    with pytest.raises(InvalidStructuredOutputError) as error:
        asyncio.run(agent.run(input))

    assert error.value.diagnostics is not None
    assert error.value.diagnostics.validation_errors[0].type == (
        "material_reference_not_in_profile"
    )


def test_agent_rejects_material_id_from_wrong_experience_section() -> None:
    input = valid_question_generation_input()
    payload = valid_question_generation_output(input)
    payload["recommended_materials"][0] = {
        "type": "workExperience",
        "id": str(input.career_profile.project_experiences[0].id),
        "label": "Wrong type",
        "reason": "Should not be accepted.",
    }
    agent = QuestionGenerationAgent(FakeLLMProvider([payload]), model="test-model")

    with pytest.raises(InvalidStructuredOutputError) as error:
        asyncio.run(agent.run(input))

    assert error.value.diagnostics is not None
    assert error.value.diagnostics.validation_errors[0].type == (
        "material_reference_type_mismatch"
    )


def test_agent_keeps_technical_entities_when_interaction_language_changes() -> None:
    input = valid_question_generation_input("en")
    agent = QuestionGenerationAgent(
        FakeLLMProvider([valid_question_generation_output(input)]),
        model="test-model",
    )

    values = agent.prompt_values(input)
    rendered = agent.prompt.render(values)

    assert values["interaction_language"] == "en"
    assert "Python" in rendered.user
    assert "FastAPI" in rendered.user
    assert "PostgreSQL" in rendered.user
    assert "Interaction language: {interaction_language}" in (
        QUESTION_GENERATION_PROMPT.system_template
    )


def test_agent_preserves_provider_metadata_usage_and_errors() -> None:
    input = valid_question_generation_input()
    usage = LLMUsage(input_tokens=321, output_tokens=123)
    provider = FakeLLMProvider(
        [valid_question_generation_output(input)],
        provider="fake-question",
        usage=usage,
    )
    agent = QuestionGenerationAgent(provider, model="test-model")

    result = asyncio.run(agent.run(input))

    assert result.provider == "fake-question"
    assert result.model == "test-model"
    assert result.usage == usage
    assert result.usage.total_tokens == 444

    failing_agent = QuestionGenerationAgent(
        FakeLLMProvider([ProviderUnavailableError()]),
        model="test-model",
    )
    with pytest.raises(ProviderUnavailableError):
        asyncio.run(failing_agent.run(input))
