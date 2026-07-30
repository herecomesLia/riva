import asyncio

import pytest
from pydantic import BaseModel

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
)
from tests.helpers.llm import FakeLLMProvider


class ExampleOutput(BaseModel):
    name: str
    score: int


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
    provider = FakeLLMProvider(
        [{"name": "private resume content", "score": "invalid"}]
    )

    with pytest.raises(InvalidStructuredOutputError) as exc_info:
        asyncio.run(provider.generate_structured(structured_request()))

    assert "private resume content" not in str(exc_info.value)
    assert exc_info.value.__context__ is None


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
