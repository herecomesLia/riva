import asyncio
import json
from collections.abc import Callable

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError
import pytest

from riva.core.config import Settings
from riva.integrations import (
    GenerationParameters,
    InvalidStructuredOutputError,
    LLMMessage,
    LLMProviderConfigurationError,
    MessageRole,
    ProviderRateLimitedError,
    ProviderUnavailableError,
    QwenProvider,
    StructuredGenerationRequest,
    TextGenerationRequest,
    build_llm_provider,
)


TEST_API_KEY = "test-qwen-key"
BASE_URL = "https://dashscope.example/compatible-mode/v1/"


class ExampleOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    score: int


def settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "database_url": "postgresql+asyncpg://user:pass@localhost/db",
        "session_digest_key": "test-session-digest-key",
        "llm_provider": "qwen",
        "llm_model": "qwen3.7-plus",
        "llm_api_key": TEST_API_KEY,
        "llm_base_url": BASE_URL,
    }
    values.update(overrides)
    return Settings(**values)


def response(
    *,
    content: str = "complete",
    usage: dict[str, int] | None = None,
) -> dict[str, object]:
    value: dict[str, object] = {
        "choices": [{"message": {"content": content}}],
    }
    if usage is not None:
        value["usage"] = usage
    return value


def provider(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    enable_thinking: bool = False,
) -> QwenProvider:
    return QwenProvider(
        api_key=TEST_API_KEY,
        base_url=BASE_URL,
        timeout=12,
        enable_thinking=enable_thinking,
        transport=httpx.MockTransport(handler),
    )


def text_request() -> TextGenerationRequest:
    return TextGenerationRequest(
        model="qwen-test-model",
        messages=(
            LLMMessage(role=MessageRole.SYSTEM, content="Be concise."),
            LLMMessage(role=MessageRole.USER, content="Hello"),
        ),
        parameters=GenerationParameters(
            temperature=0.2,
            top_p=0.8,
            max_output_tokens=256,
        ),
    )


def structured_request() -> StructuredGenerationRequest[ExampleOutput]:
    return StructuredGenerationRequest(
        model="qwen-test-model",
        messages=(
            LLMMessage(role=MessageRole.SYSTEM, content="Business prompt v1."),
            LLMMessage(role=MessageRole.USER, content="Private JD data."),
        ),
        output_schema=ExampleOutput,
        parameters=GenerationParameters(
            temperature=0,
            top_p=0.9,
            max_output_tokens=1,
        ),
    )


def test_build_provider_allows_unconfigured_settings() -> None:
    unconfigured = settings(
        llm_provider=None,
        llm_model=None,
        llm_api_key=None,
        llm_base_url=None,
    )

    assert build_llm_provider(unconfigured) is None


def test_build_provider_accepts_complete_qwen_settings() -> None:
    built = build_llm_provider(settings(llm_enable_thinking=True))

    assert isinstance(built, QwenProvider)


@pytest.mark.parametrize(
    "overrides",
    [
        {"llm_api_key": None},
        {"llm_api_key": "   "},
        {"llm_model": None},
        {"llm_model": "   "},
        {"llm_base_url": None},
        {"llm_base_url": "   "},
        {"llm_provider": "unsupported"},
    ],
)
def test_build_provider_rejects_incomplete_or_unknown_configuration(
    overrides: dict[str, object],
) -> None:
    with pytest.raises(LLMProviderConfigurationError):
        build_llm_provider(settings(**overrides))


@pytest.mark.parametrize("base_url", ["", "ftp://example.com/v1", "not-a-url"])
def test_provider_rejects_invalid_base_url(base_url: str) -> None:
    with pytest.raises(LLMProviderConfigurationError):
        QwenProvider(api_key=TEST_API_KEY, base_url=base_url)


def test_text_request_maps_endpoint_headers_parameters_usage_and_metadata() -> None:
    captured: list[tuple[httpx.Request, dict[str, object]]] = []

    def handle(request: httpx.Request) -> httpx.Response:
        captured.append((request, json.loads(request.content)))
        return httpx.Response(
            200,
            json=response(
                content="Hello back",
                usage={"prompt_tokens": 11, "completion_tokens": 7},
            ),
        )

    qwen = provider(handle, enable_thinking=True)

    result = asyncio.run(qwen.generate_text(text_request()))

    request, body = captured[0]
    assert str(request.url) == (
        "https://dashscope.example/compatible-mode/v1/chat/completions"
    )
    assert request.headers["Authorization"] == f"Bearer {TEST_API_KEY}"
    assert body == {
        "model": "qwen-test-model",
        "messages": [
            {"role": "system", "content": "Be concise."},
            {"role": "user", "content": "Hello"},
        ],
        "stream": False,
        "enable_thinking": True,
        "temperature": 0.2,
        "top_p": 0.8,
        "max_completion_tokens": 256,
    }
    assert result.content == "Hello back"
    assert result.provider == "qwen"
    assert result.model == "qwen-test-model"
    assert result.usage.input_tokens == 11
    assert result.usage.output_tokens == 7


def test_base_url_does_not_duplicate_chat_completions_path() -> None:
    captured_urls: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        captured_urls.append(str(request.url))
        return httpx.Response(200, json=response())

    qwen = QwenProvider(
        api_key=TEST_API_KEY,
        base_url=(
            "https://dashscope.example/compatible-mode/v1/chat/completions/"
        ),
        transport=httpx.MockTransport(handle),
    )

    asyncio.run(qwen.generate_text(text_request()))

    assert captured_urls == [
        "https://dashscope.example/compatible-mode/v1/chat/completions"
    ]


def test_structured_request_adds_schema_without_mutating_business_messages() -> None:
    captured_bodies: list[dict[str, object]] = []

    def handle(request: httpx.Request) -> httpx.Response:
        captured_bodies.append(json.loads(request.content))
        return httpx.Response(
            200,
            json=response(content='{"name":"Python","score":95}'),
        )

    qwen = provider(handle, enable_thinking=True)
    request = structured_request()
    original_messages = request.messages

    result = asyncio.run(qwen.generate_structured(request))

    body = captured_bodies[0]
    assert request.messages is original_messages
    assert request.messages == original_messages
    assert body["response_format"] == {"type": "json_object"}
    assert body["enable_thinking"] is False
    assert body["stream"] is False
    assert "max_completion_tokens" not in body
    assert body["temperature"] == 0
    assert body["top_p"] == 0.9
    messages = body["messages"]
    assert isinstance(messages, list)
    assert messages[:2] == [
        {"role": "system", "content": "Business prompt v1."},
        {"role": "user", "content": "Private JD data."},
    ]
    provider_message = messages[2]
    assert provider_message["role"] == "system"
    assert "valid JSON" in provider_message["content"]
    assert "JSON Schema" in provider_message["content"]
    assert '"score"' in provider_message["content"]
    assert result.content == ExampleOutput(name="Python", score=95)
    assert result.usage.input_tokens == 0
    assert result.usage.output_tokens == 0


@pytest.mark.parametrize(
    "payload",
    [
        response(content="not json"),
        response(content='{"name":"Python","score":"invalid"}'),
        {"usage": {"prompt_tokens": 1, "completion_tokens": 1}},
        {"choices": [{"message": {}}]},
    ],
)
def test_structured_response_rejects_invalid_json_schema_or_shape(
    payload: dict[str, object],
) -> None:
    qwen = provider(lambda _request: httpx.Response(200, json=payload))

    with pytest.raises(InvalidStructuredOutputError):
        asyncio.run(qwen.generate_structured(structured_request()))


def test_text_response_rejects_incomplete_success_response() -> None:
    qwen = provider(lambda _request: httpx.Response(200, json={"choices": []}))

    with pytest.raises(ProviderUnavailableError):
        asyncio.run(qwen.generate_text(text_request()))


@pytest.mark.parametrize(
    ("status_code", "error_type"),
    [
        (400, LLMProviderConfigurationError),
        (401, LLMProviderConfigurationError),
        (403, LLMProviderConfigurationError),
        (404, LLMProviderConfigurationError),
        (408, ProviderUnavailableError),
        (429, ProviderRateLimitedError),
        (500, ProviderUnavailableError),
    ],
)
def test_http_errors_are_safely_mapped(status_code: int, error_type: type) -> None:
    qwen = provider(
        lambda _request: httpx.Response(
            status_code,
            text="provider raw error containing private JD data",
        )
    )

    with pytest.raises(error_type) as exc_info:
        asyncio.run(qwen.generate_text(text_request()))

    assert "private JD data" not in str(exc_info.value)
    assert exc_info.value.__cause__ is None
    assert exc_info.value.__suppress_context__ is True


@pytest.mark.parametrize("error_type", [httpx.ConnectError, httpx.ReadTimeout])
def test_network_errors_are_safely_mapped(error_type: type[httpx.RequestError]) -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        raise error_type(
            "network error with private prompt and test-qwen-key",
            request=request,
        )

    qwen = provider(handle)

    with pytest.raises(ProviderUnavailableError) as exc_info:
        asyncio.run(qwen.generate_text(text_request()))

    error_text = f"{exc_info.value!s} {exc_info.value!r}"
    assert TEST_API_KEY not in error_text
    assert "private prompt" not in error_text
    assert exc_info.value.__cause__ is None
    assert exc_info.value.__suppress_context__ is True


def test_secret_is_not_exposed_by_settings_provider_or_errors() -> None:
    secret = "sensitive-qwen-test-key"
    configured = settings(llm_api_key=secret)
    qwen = QwenProvider(
        api_key=secret,
        base_url=BASE_URL,
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(
                500,
                text="private provider response body",
            )
        ),
    )

    with pytest.raises(ProviderUnavailableError) as exc_info:
        asyncio.run(qwen.generate_text(text_request()))

    visible_text = " ".join(
        (repr(configured), repr(qwen), str(exc_info.value), repr(exc_info.value))
    )
    assert secret not in visible_text
    assert "private provider response body" not in visible_text


def test_settings_rejects_non_positive_llm_timeout() -> None:
    with pytest.raises(ValidationError, match="llm_timeout_seconds"):
        settings(llm_timeout_seconds=0)
