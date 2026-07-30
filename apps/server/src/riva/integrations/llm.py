from dataclasses import dataclass
from enum import StrEnum
from typing import Generic, Protocol, TypeVar

from pydantic import BaseModel, ConfigDict, Field, ValidationError


StructuredOutputT = TypeVar("StructuredOutputT", bound=BaseModel)
ResponseT = TypeVar("ResponseT")


class MessageRole(StrEnum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


class LLMMessage(BaseModel):
    model_config = ConfigDict(frozen=True)

    role: MessageRole
    content: str = Field(min_length=1)


class GenerationParameters(BaseModel):
    model_config = ConfigDict(frozen=True)

    temperature: float | None = Field(default=None, ge=0, le=2)
    max_output_tokens: int | None = Field(default=None, gt=0)
    top_p: float | None = Field(default=None, gt=0, le=1)


class LLMUsage(BaseModel):
    model_config = ConfigDict(frozen=True)

    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


@dataclass(frozen=True)
class TextGenerationRequest:
    model: str
    messages: tuple[LLMMessage, ...]
    parameters: GenerationParameters | None = None

    def __post_init__(self) -> None:
        if not self.model.strip():
            raise ValueError("model must not be empty")
        if not self.messages:
            raise ValueError("messages must not be empty")


@dataclass(frozen=True)
class StructuredGenerationRequest(Generic[StructuredOutputT]):
    model: str
    messages: tuple[LLMMessage, ...]
    output_schema: type[StructuredOutputT]
    parameters: GenerationParameters | None = None

    def __post_init__(self) -> None:
        if not self.model.strip():
            raise ValueError("model must not be empty")
        if not self.messages:
            raise ValueError("messages must not be empty")


@dataclass(frozen=True)
class LLMResponse(Generic[ResponseT]):
    content: ResponseT
    usage: LLMUsage
    provider: str
    model: str


class LLMProvider(Protocol):
    async def generate_text(
        self,
        request: TextGenerationRequest,
    ) -> LLMResponse[str]: ...

    async def generate_structured(
        self,
        request: StructuredGenerationRequest[StructuredOutputT],
    ) -> LLMResponse[StructuredOutputT]: ...


class LLMProviderError(RuntimeError):
    code = "llm_provider_error"
    safe_message = "The LLM provider request failed."

    def __init__(self) -> None:
        super().__init__(self.safe_message)


class ProviderUnavailableError(LLMProviderError):
    code = "provider_unavailable"
    safe_message = "The LLM provider is unavailable."


class ProviderRateLimitedError(LLMProviderError):
    code = "provider_rate_limited"
    safe_message = "The LLM provider rate limit was reached."


class InvalidStructuredOutputError(LLMProviderError):
    code = "invalid_structured_output"
    safe_message = "The LLM provider returned invalid structured output."


class LLMProviderConfigurationError(LLMProviderError):
    code = "provider_configuration_error"
    safe_message = "The LLM provider authentication or configuration is invalid."


def validate_structured_output(
    output_schema: type[StructuredOutputT],
    value: object,
) -> StructuredOutputT:
    try:
        return output_schema.model_validate(value)
    except ValidationError:
        pass
    raise InvalidStructuredOutputError
