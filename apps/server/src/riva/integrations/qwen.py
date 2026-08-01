import json
from collections.abc import Mapping
from typing import Protocol, TypeVar, cast

import httpx
from pydantic import BaseModel, SecretStr, ValidationError

from riva.integrations.llm import (
    InvalidStructuredOutputError,
    LLMMessage,
    LLMProvider,
    LLMProviderConfigurationError,
    LLMResponse,
    LLMUsage,
    ProviderRateLimitedError,
    ProviderUnavailableError,
    StructuredGenerationRequest,
    TextGenerationRequest,
    validate_structured_output,
)


StructuredOutputT = TypeVar("StructuredOutputT", bound=BaseModel)


class LLMSettings(Protocol):
    llm_provider: str | None
    llm_model: str | None
    llm_api_key: SecretStr | None
    llm_base_url: str | None
    llm_timeout_seconds: float
    llm_enable_thinking: bool


class QwenProvider:
    provider_name = "qwen"

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        timeout: float = 60,
        enable_thinking: bool = False,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        api_key = api_key.strip()
        if not api_key or timeout <= 0:
            raise LLMProviderConfigurationError from None
        self._api_key = api_key
        self._endpoint = _chat_completions_endpoint(base_url)
        self._timeout = timeout
        self._enable_thinking = enable_thinking
        self._transport = transport

    async def generate_text(
        self,
        request: TextGenerationRequest,
    ) -> LLMResponse[str]:
        body: dict[str, object] = {
            "model": request.model,
            "messages": _messages(request.messages),
            "stream": False,
            "enable_thinking": self._enable_thinking,
        }
        _apply_parameters(body, request, include_max_tokens=True)
        response = await self._post(body)
        try:
            data = _response_object(response)
            content = _message_content(data)
            usage = _usage(data)
        except (TypeError, ValueError, ValidationError):
            raise ProviderUnavailableError from None
        return LLMResponse(
            content=content,
            usage=usage,
            provider=self.provider_name,
            model=request.model,
        )

    async def generate_structured(
        self,
        request: StructuredGenerationRequest[StructuredOutputT],
    ) -> LLMResponse[StructuredOutputT]:
        schema = request.output_schema.model_json_schema()
        messages = _messages(request.messages)
        messages.append(
            {
                "role": "system",
                "content": _structured_output_instruction(schema),
            }
        )
        body: dict[str, object] = {
            "model": request.model,
            "messages": messages,
            "stream": False,
            "enable_thinking": False,
            "response_format": {"type": "json_object"},
        }
        _apply_parameters(body, request, include_max_tokens=False)
        response = await self._post(body)
        try:
            data = _response_object(response)
            content = _message_content(data)
            parsed = json.loads(content)
            usage = _usage(data)
        except (json.JSONDecodeError, TypeError, ValueError, ValidationError):
            raise InvalidStructuredOutputError from None
        return LLMResponse(
            content=validate_structured_output(request.output_schema, parsed),
            usage=usage,
            provider=self.provider_name,
            model=request.model,
        )

    async def _post(self, body: Mapping[str, object]) -> httpx.Response:
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout,
                transport=self._transport,
            ) as client:
                response = await client.post(
                    self._endpoint,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
        except httpx.RequestError:
            raise ProviderUnavailableError from None

        if response.is_success:
            return response
        if response.status_code in (400, 401, 403, 404):
            raise LLMProviderConfigurationError from None
        if response.status_code == 429:
            raise ProviderRateLimitedError from None
        raise ProviderUnavailableError from None


def build_llm_provider(settings: LLMSettings) -> LLMProvider | None:
    provider_name = (settings.llm_provider or "").strip().lower()
    if not provider_name:
        return None
    if provider_name != QwenProvider.provider_name:
        raise LLMProviderConfigurationError from None

    api_key = (
        settings.llm_api_key.get_secret_value()
        if settings.llm_api_key is not None
        else ""
    )
    if (
        not api_key.strip()
        or not (settings.llm_model or "").strip()
        or not (settings.llm_base_url or "").strip()
        or settings.llm_timeout_seconds <= 0
    ):
        raise LLMProviderConfigurationError from None

    return QwenProvider(
        api_key=api_key,
        base_url=cast(str, settings.llm_base_url),
        timeout=settings.llm_timeout_seconds,
        enable_thinking=settings.llm_enable_thinking,
    )


def _chat_completions_endpoint(base_url: str) -> str:
    value = base_url.strip()
    try:
        url = httpx.URL(value)
    except httpx.InvalidURL:
        raise LLMProviderConfigurationError from None
    if url.scheme not in ("http", "https") or not url.host:
        raise LLMProviderConfigurationError from None

    path = url.path.rstrip("/")
    if not path.endswith("/chat/completions"):
        path = f"{path}/chat/completions"
    return str(url.copy_with(path=path))


def _messages(messages: tuple[LLMMessage, ...]) -> list[dict[str, str]]:
    return [
        {"role": message.role.value, "content": message.content}
        for message in messages
    ]


def _apply_parameters(
    body: dict[str, object],
    request: TextGenerationRequest | StructuredGenerationRequest[BaseModel],
    *,
    include_max_tokens: bool,
) -> None:
    parameters = request.parameters
    if parameters is None:
        return
    if parameters.temperature is not None:
        body["temperature"] = parameters.temperature
    if parameters.top_p is not None:
        body["top_p"] = parameters.top_p
    if include_max_tokens and parameters.max_output_tokens is not None:
        body["max_completion_tokens"] = parameters.max_output_tokens


def _structured_output_instruction(schema: object) -> str:
    serialized_schema = json.dumps(
        schema,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return (
        "Return only valid JSON that conforms exactly to the following JSON "
        "Schema. Do not return Markdown or explanatory text. JSON Schema: "
        f"{serialized_schema}"
    )


def _response_object(response: httpx.Response) -> dict[str, object]:
    value = response.json()
    if not isinstance(value, dict):
        raise TypeError
    return cast(dict[str, object], value)


def _message_content(data: Mapping[str, object]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise TypeError
    choice = choices[0]
    if not isinstance(choice, dict):
        raise TypeError
    message = choice.get("message")
    if not isinstance(message, dict):
        raise TypeError
    content = message.get("content")
    if not isinstance(content, str) or not content:
        raise TypeError
    return content


def _usage(data: Mapping[str, object]) -> LLMUsage:
    raw_usage = data.get("usage")
    if raw_usage is None:
        return LLMUsage()
    if not isinstance(raw_usage, dict):
        raise TypeError
    return LLMUsage(
        input_tokens=raw_usage.get("prompt_tokens", 0),
        output_tokens=raw_usage.get("completion_tokens", 0),
    )
