from collections.abc import Iterable
from typing import TypeVar

from pydantic import BaseModel

from riva.integrations import (
    InvalidStructuredOutputError,
    LLMResponse,
    LLMUsage,
    StructuredGenerationRequest,
    TextGenerationRequest,
    validate_structured_output,
)

StructuredOutputT = TypeVar("StructuredOutputT", bound=BaseModel)
LLMCall = TextGenerationRequest | StructuredGenerationRequest[BaseModel]


class FakeLLMProvider:
    def __init__(
        self,
        responses: Iterable[object],
        *,
        provider: str = "fake",
        usage: LLMUsage | None = None,
    ) -> None:
        self.responses = list(responses)
        self.provider = provider
        self.usage = usage or LLMUsage()
        self.calls: list[LLMCall] = []

    async def generate_text(
        self,
        request: TextGenerationRequest,
    ) -> LLMResponse[str]:
        self.calls.append(request)
        result = self._next_response()
        if not isinstance(result, str):
            raise InvalidStructuredOutputError
        return LLMResponse(
            content=result,
            usage=self.usage,
            provider=self.provider,
            model=request.model,
        )

    async def generate_structured(
        self,
        request: StructuredGenerationRequest[StructuredOutputT],
    ) -> LLMResponse[StructuredOutputT]:
        self.calls.append(request)
        result = self._next_response()
        content = validate_structured_output(request.output_schema, result)
        return LLMResponse(
            content=content,
            usage=self.usage,
            provider=self.provider,
            model=request.model,
        )

    def _next_response(self) -> object:
        if not self.responses:
            raise AssertionError("No fake LLM response configured.")
        result = self.responses.pop(0)
        if isinstance(result, BaseException):
            raise result
        return result
