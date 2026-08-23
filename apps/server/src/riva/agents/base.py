from abc import ABC, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass
from string import Formatter
from typing import ClassVar, Generic, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from riva.integrations.llm import (
    GenerationParameters,
    LLMMessage,
    LLMProvider,
    LLMUsage,
    MessageRole,
    StructuredGenerationRequest,
)

AgentInputT = TypeVar("AgentInputT")
AgentOutputT = TypeVar("AgentOutputT", bound=BaseModel)
AgentResultT = TypeVar("AgentResultT", bound=BaseModel, covariant=True)


class AgentModel(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )


@dataclass(frozen=True)
class AgentResult(Generic[AgentResultT]):
    output: AgentResultT
    agent_id: str
    prompt_id: str
    prompt_version: str
    provider: str
    model: str
    usage: LLMUsage


class AgentPromptError(RuntimeError):
    pass


class Agent(ABC, Generic[AgentInputT, AgentOutputT]):
    agent_id: ClassVar[str]
    agent_version: ClassVar[str]
    system_prompt: ClassVar[str]
    user_prompt: ClassVar[str]
    output_schema: ClassVar[type[BaseModel]]
    output_schema_id: ClassVar[str]

    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        self.provider = provider
        self.model = model
        self.parameters = parameters

    @abstractmethod
    def prompt_values(self, input: AgentInputT) -> Mapping[str, object]: ...

    @property
    def prompt_id(self) -> str:
        return self.agent_id

    @property
    def prompt_version(self) -> str:
        return self.agent_version

    def render_prompt(self, values: Mapping[str, object]) -> tuple[str, str]:
        required = _template_fields(self.system_prompt) | _template_fields(
            self.user_prompt
        )
        missing = sorted(required - values.keys())
        if missing:
            names = ", ".join(missing)
            raise AgentPromptError(f"Missing prompt template variables: {names}")

        try:
            system = self.system_prompt.format_map(values)
            user = self.user_prompt.format_map(values)
        except (AttributeError, IndexError, KeyError, ValueError) as exc:
            raise AgentPromptError("Prompt template rendering failed.") from exc

        return system, user

    async def run(self, input: AgentInputT) -> AgentResult[AgentOutputT]:
        system, user = self.render_prompt(self.prompt_values(input))
        response = await self.provider.generate_structured(
            StructuredGenerationRequest(
                model=self.model,
                messages=(
                    LLMMessage(role=MessageRole.SYSTEM, content=system),
                    LLMMessage(role=MessageRole.USER, content=user),
                ),
                output_schema=self.output_schema,
                parameters=self.parameters,
            )
        )
        return AgentResult(
            output=response.content,
            agent_id=self.agent_id,
            prompt_id=self.agent_id,
            prompt_version=self.agent_version,
            provider=response.provider,
            model=response.model,
            usage=response.usage,
        )


def _template_fields(template: str) -> set[str]:
    return {
        field_name.split(".", 1)[0].split("[", 1)[0]
        for _, field_name, _, _ in Formatter().parse(template)
        if field_name
    }
