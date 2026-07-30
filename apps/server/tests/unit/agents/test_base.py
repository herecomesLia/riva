import asyncio
from collections.abc import Mapping
from dataclasses import dataclass

from pydantic import BaseModel

from riva.agents import Agent
from riva.integrations import LLMUsage, MessageRole
from riva.prompts import PromptDefinition
from tests.helpers.llm import FakeLLMProvider


@dataclass(frozen=True)
class ExampleInput:
    subject: str


class ExampleOutput(BaseModel):
    result: str


class ExampleAgent(Agent[ExampleInput, ExampleOutput]):
    @property
    def agent_id(self) -> str:
        return "example-agent"

    def prompt_values(self, input: ExampleInput) -> Mapping[str, object]:
        return {"subject": input.subject}


def test_agent_executes_typed_prompt_through_injected_provider() -> None:
    provider = FakeLLMProvider(
        [{"result": "accepted"}],
        provider="test-provider",
        usage=LLMUsage(input_tokens=10, output_tokens=3),
    )
    prompt = PromptDefinition(
        prompt_id="example",
        version="2026-07-30",
        system_template="Return a structured decision.",
        user_template="Review {subject}.",
        output_schema_id="example-output-v1",
        output_schema=ExampleOutput,
    )
    agent = ExampleAgent(provider, prompt, model="test-model")

    result = asyncio.run(agent.run(ExampleInput(subject="candidate")))

    assert result.output == ExampleOutput(result="accepted")
    assert result.agent_id == "example-agent"
    assert result.prompt_id == "example"
    assert result.prompt_version == "2026-07-30"
    assert result.provider == "test-provider"
    assert result.model == "test-model"
    assert result.usage.total_tokens == 13
    request = provider.calls[0]
    assert [message.role for message in request.messages] == [
        MessageRole.SYSTEM,
        MessageRole.USER,
    ]
    assert request.messages[1].content == "Review candidate."
