from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Generic, Literal, Protocol, TypeVar

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError


StructuredOutputT = TypeVar("StructuredOutputT", bound=BaseModel)
ResponseT = TypeVar("ResponseT")
StructuredOutputStage = Literal[
    "json_decode",
    "provider_response",
    "schema_validation",
]


@dataclass(frozen=True)
class StructuredOutputValidationError:
    location: str
    type: str


@dataclass(frozen=True)
class StructuredOutputDiagnostics:
    stage: StructuredOutputStage
    output_schema: str
    validation_errors: tuple[StructuredOutputValidationError, ...] = ()

    @property
    def error_count(self) -> int:
        return len(self.validation_errors)

    def as_log_fields(self) -> dict[str, object]:
        return {
            "structured_output_stage": self.stage,
            "output_schema": self.output_schema,
            "validation_error_count": self.error_count,
            "validation_errors": [
                {
                    "location": error.location,
                    "type": error.type,
                }
                for error in self.validation_errors
            ],
        }


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
    output_schema: object
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
    retryable = True

    def __init__(
        self,
        diagnostics: StructuredOutputDiagnostics | None = None,
    ) -> None:
        self.diagnostics = diagnostics
        super().__init__()


class LLMProviderConfigurationError(LLMProviderError):
    code = "provider_configuration_error"
    safe_message = "The LLM provider authentication or configuration is invalid."


def validate_structured_output(
    output_schema: object,
    value: object,
) -> Any:
    try:
        if isinstance(output_schema, TypeAdapter):
            validated = output_schema.validate_python(value)
        elif isinstance(output_schema, type) and issubclass(output_schema, BaseModel):
            validated = output_schema.model_validate(value)
        else:
            validated = TypeAdapter(output_schema).validate_python(value)
    except ValidationError as error:
        diagnostics = StructuredOutputDiagnostics(
            stage="schema_validation",
            output_schema=_structured_output_schema_name(output_schema),
            validation_errors=_safe_validation_errors(error),
        )
    else:
        return validated
    raise InvalidStructuredOutputError(diagnostics)


def _structured_output_json_schema(output_schema: object) -> dict[str, object]:
    if isinstance(output_schema, TypeAdapter):
        schema = output_schema.json_schema()
    else:
        model_json_schema = getattr(output_schema, "model_json_schema", None)
        if callable(model_json_schema):
            schema = model_json_schema()
        else:
            schema = TypeAdapter(output_schema).json_schema()
    if not isinstance(schema, dict):
        raise TypeError("structured output schema must be a JSON object")
    return schema


def _structured_output_schema_name(output_schema: object) -> str:
    name = getattr(output_schema, "__name__", None)
    if isinstance(name, str) and name:
        return name
    return str(output_schema)


def _safe_validation_errors(
    error: ValidationError,
) -> tuple[StructuredOutputValidationError, ...]:
    safe_errors: list[StructuredOutputValidationError] = []
    for item in error.errors():
        location = ".".join(str(part) for part in item.get("loc", ()))
        safe_errors.append(
            StructuredOutputValidationError(
                location=location or "<root>",
                type=str(item.get("type", "unknown")),
            )
        )
    return tuple(safe_errors)
