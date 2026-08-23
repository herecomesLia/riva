import asyncio

import pytest
from pydantic import BaseModel

from riva.agents.practice.follow_up_types import (
    FollowUpCompleteOutput,
    FollowUpGenerationOutput,
    FollowUpQuestionOutput,
)
from riva.integrations import (
    InvalidStructuredOutputError,
    LLMMessage,
    LLMProviderConfigurationError,
    LLMProviderError,
    LLMUsage,
    MessageRole,
    ProviderRateLimitedError,
    ProviderUnavailableError,
    StructuredGenerationRequest,
    TextGenerationRequest,
    validate_structured_output,
)
from tests.helpers.llm import FakeLLMProvider


class ExampleOutput(BaseModel):
    name: str
    score: int


class WorkExperienceOutput(BaseModel):
    is_current: bool


class NestedOutput(BaseModel):
    work_experiences: list[WorkExperienceOutput]


def structured_request() -> StructuredGenerationRequest[ExampleOutput]:
    return StructuredGenerationRequest(
        model="test-model",
        messages=(LLMMessage(role=MessageRole.USER, content="Evaluate this."),),
        output_schema=ExampleOutput,
    )


def test_fake_provider_records_calls_and_returns_text() -> None:
    provider = FakeLLMProvider(
        ["complete"],
        usage=LLMUsage(input_tokens=4, output_tokens=2),
    )
    request = TextGenerationRequest(
        model="test-model",
        messages=(LLMMessage(role=MessageRole.USER, content="Hello"),),
    )

    response = asyncio.run(provider.generate_text(request))

    assert provider.calls == [request]
    assert response.content == "complete"
    assert response.provider == "fake"
    assert response.model == "test-model"
    assert response.usage.total_tokens == 6


def test_fake_provider_returns_validated_structured_output() -> None:
    provider = FakeLLMProvider([{"name": "Python", "score": 95}])

    response = asyncio.run(provider.generate_structured(structured_request()))

    assert response.content == ExampleOutput(name="Python", score=95)


def test_fake_provider_rejects_invalid_structured_output() -> None:
    provider = FakeLLMProvider([{"name": "private resume content", "score": "invalid"}])

    with pytest.raises(InvalidStructuredOutputError) as exc_info:
        asyncio.run(provider.generate_structured(structured_request()))

    assert "private resume content" not in str(exc_info.value)
    assert exc_info.value.__context__ is None


def test_schema_validation_error_exposes_only_safe_diagnostics() -> None:
    with pytest.raises(InvalidStructuredOutputError) as exc_info:
        validate_structured_output(
            ExampleOutput,
            {"name": "PRIVATE_RESUME_CONTENT", "score": "not-a-number"},
        )

    error = exc_info.value
    assert error.diagnostics is not None
    assert error.diagnostics.stage == "schema_validation"
    assert error.diagnostics.output_schema == "ExampleOutput"
    assert error.diagnostics.error_count == 1
    assert error.diagnostics.validation_errors[0].location == "score"
    assert error.diagnostics.validation_errors[0].type == "int_parsing"
    assert "PRIVATE_RESUME_CONTENT" not in repr(error)
    assert error.__cause__ is None
    assert error.__context__ is None


def test_schema_validation_diagnostics_preserve_nested_error_path() -> None:
    with pytest.raises(InvalidStructuredOutputError) as exc_info:
        validate_structured_output(
            NestedOutput,
            {"work_experiences": [{"is_current": "PRIVATE_RESUME_CONTENT"}]},
        )

    diagnostics = exc_info.value.diagnostics
    assert diagnostics is not None
    assert diagnostics.stage == "schema_validation"
    assert len(diagnostics.validation_errors) == 1
    assert diagnostics.validation_errors[0].location == (
        "work_experiences.0.is_current"
    )
    assert diagnostics.validation_errors[0].type == "bool_parsing"
    assert "PRIVATE_RESUME_CONTENT" not in repr(diagnostics)


def test_follow_up_union_validation_accepts_both_discriminated_branches() -> None:
    complete = validate_structured_output(
        FollowUpGenerationOutput,
        {"action": "complete"},
    )
    ask = validate_structured_output(
        FollowUpGenerationOutput,
        {
            "action": "askFollowUp",
            "prompt": "Ask about the result.",
            "focus": "Evidence",
            "answer_hints": ["Metric"],
            "answer_framework": ["Context", "Result"],
        },
    )

    assert isinstance(complete, FollowUpCompleteOutput)
    assert isinstance(ask, FollowUpQuestionOutput)


@pytest.mark.parametrize(
    "value",
    [
        {"action": "unknown"},
        {"action": "complete", "prompt": "private prompt"},
        {
            "action": "askFollowUp",
            "prompt": "Question",
            "focus": "Focus",
            "answer_hints": [],
            "answer_framework": [],
            "reasoning": "private reasoning",
        },
    ],
)
def test_follow_up_union_validation_rejects_invalid_or_extra_fields(
    value: dict[str, object],
) -> None:
    with pytest.raises(InvalidStructuredOutputError) as exc_info:
        validate_structured_output(FollowUpGenerationOutput, value)

    diagnostics = exc_info.value.diagnostics
    assert diagnostics is not None
    assert "private" not in repr(diagnostics).lower()


def test_fake_provider_raises_configured_error() -> None:
    provider = FakeLLMProvider([ProviderUnavailableError()])

    with pytest.raises(ProviderUnavailableError):
        asyncio.run(provider.generate_structured(structured_request()))

    assert provider.calls == [structured_request()]


@pytest.mark.parametrize(
    ("error_type", "code"),
    [
        (ProviderUnavailableError, "provider_unavailable"),
        (ProviderRateLimitedError, "provider_rate_limited"),
        (InvalidStructuredOutputError, "invalid_structured_output"),
        (LLMProviderConfigurationError, "provider_configuration_error"),
    ],
)
def test_provider_errors_are_typed_and_safe(error_type, code: str) -> None:
    error = error_type()

    assert isinstance(error, LLMProviderError)
    assert error.code == code
    assert "secret" not in str(error).lower()
