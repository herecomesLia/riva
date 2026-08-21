from abc import ABC, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Generic, TypeVar

from pydantic import BaseModel

from riva.integrations import (
    GenerationParameters,
    LLMMessage,
    LLMProvider,
    LLMUsage,
    MessageRole,
    StructuredGenerationRequest,
)
from riva.prompts import PromptDefinition

AgentInputT = TypeVar("AgentInputT")
AgentOutputT = TypeVar("AgentOutputT", bound=BaseModel)
AgentResultT = TypeVar("AgentResultT", bound=BaseModel, covariant=True)


@dataclass(frozen=True)
class AgentResult(Generic[AgentResultT]):
    output: AgentResultT
    agent_id: str
    prompt_id: str
    prompt_version: str
    provider: str
    model: str
    usage: LLMUsage


class Agent(ABC, Generic[AgentInputT, AgentOutputT]):
    def __init__(
        self,
        provider: LLMProvider,
        prompt: PromptDefinition[AgentOutputT],
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        self.provider = provider
        self.prompt = prompt
        self.model = model
        self.parameters = parameters

    @property
    @abstractmethod
    def agent_id(self) -> str: ...

    @abstractmethod
    def prompt_values(self, input: AgentInputT) -> Mapping[str, object]: ...

    @property
    def prompt_id(self) -> str:
        return self.prompt.prompt_id

    @property
    def prompt_version(self) -> str:
        return self.prompt.version

    async def run(self, input: AgentInputT) -> AgentResult[AgentOutputT]:
        rendered = self.prompt.render(self.prompt_values(input))
        response = await self.provider.generate_structured(
            StructuredGenerationRequest(
                model=self.model,
                messages=(
                    LLMMessage(role=MessageRole.SYSTEM, content=rendered.system),
                    LLMMessage(role=MessageRole.USER, content=rendered.user),
                ),
                output_schema=self.prompt.output_schema,
                parameters=self.parameters,
            )
        )
        return AgentResult(
            output=response.content,
            agent_id=self.agent_id,
            prompt_id=rendered.prompt_id,
            prompt_version=rendered.version,
            provider=response.provider,
            model=response.model,
            usage=response.usage,
        )
