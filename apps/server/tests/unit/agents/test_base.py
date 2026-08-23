import asyncio
from collections.abc import Mapping
from dataclasses import dataclass

from pydantic import BaseModel

from riva.agents import Agent
from riva.agents.base import AgentPromptError
from riva.integrations import LLMUsage, MessageRole
from tests.helpers.llm import FakeLLMProvider


@dataclass(frozen=True)
class ExampleInput:
    subject: str


class ExampleOutput(BaseModel):
    result: str


class ExampleAgent(Agent[ExampleInput, ExampleOutput]):
    agent_id = "example-agent"
    agent_version = "2026-07-30"
    system_prompt = "Return a structured decision."
    user_prompt = "Review {subject}."
    output_schema = ExampleOutput
    output_schema_id = "example-output-v1"

    def prompt_values(self, input: ExampleInput) -> Mapping[str, object]:
        return {"subject": input.subject}


def test_agent_executes_typed_prompt_through_injected_provider() -> None:
    provider = FakeLLMProvider(
        [{"result": "accepted"}],
        provider="test-provider",
        usage=LLMUsage(input_tokens=10, output_tokens=3),
    )
    agent = ExampleAgent(provider, model="test-model")

    result = asyncio.run(agent.run(ExampleInput(subject="candidate")))

    assert result.output == ExampleOutput(result="accepted")
    assert result.agent_id == "example-agent"
    assert result.prompt_id == "example-agent"
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


def test_agent_rendering_reports_missing_template_variables() -> None:
    agent = ExampleAgent(FakeLLMProvider([]), model="test-model")

    try:
        agent.render_prompt({})
    except AgentPromptError as error:
        assert str(error) == "Missing prompt template variables: subject"
    else:
        raise AssertionError("rendering should reject missing template variables")
