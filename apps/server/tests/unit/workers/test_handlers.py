import pytest
from pydantic import BaseModel

from riva.agents import AgentResult
from riva.integrations import LLMUsage
from riva.models import AgentRun
from riva.workers import (
    AgentHandlerNotFoundError,
    AgentHandlerRegistry,
    DuplicateAgentHandlerError,
)


class Output(BaseModel):
    value: str


class Handler:
    def __init__(self, agent_id: str) -> None:
        self.agent_id = agent_id

    async def execute(self, run: AgentRun) -> AgentResult[Output]:
        return AgentResult(
            output=Output(value=str(run.id)),
            agent_id=self.agent_id,
            prompt_id=run.prompt_id,
            prompt_version=run.prompt_version,
            provider="fake",
            model=run.model,
            usage=LLMUsage(),
        )


def test_registry_registers_and_returns_handler() -> None:
    registry = AgentHandlerRegistry()
    handler = Handler("example-agent")

    registry.register(handler)

    assert registry.get("example-agent") is handler


def test_registry_rejects_duplicate_agent_id() -> None:
    registry = AgentHandlerRegistry()
    registry.register(Handler("example-agent"))

    with pytest.raises(DuplicateAgentHandlerError):
        registry.register(Handler("example-agent"))


def test_registry_raises_safe_error_for_missing_handler() -> None:
    registry = AgentHandlerRegistry()

    with pytest.raises(AgentHandlerNotFoundError) as exc_info:
        registry.get("missing-agent")

    assert exc_info.value.code == "agent_handler_not_found"
    assert exc_info.value.retryable is False
