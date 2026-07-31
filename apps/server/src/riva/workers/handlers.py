from typing import Protocol

from pydantic import BaseModel

from riva.agents import AgentResult
from riva.models import AgentRun
from riva.workers.errors import (
    AgentHandlerNotFoundError,
    DuplicateAgentHandlerError,
)


class AgentRunHandler(Protocol):
    @property
    def agent_id(self) -> str: ...

    async def execute(self, run: AgentRun) -> AgentResult[BaseModel]: ...


class AgentHandlerRegistry:
    def __init__(self) -> None:
        self._handlers: dict[str, AgentRunHandler] = {}

    def register(self, handler: AgentRunHandler) -> None:
        agent_id = handler.agent_id
        if not agent_id or agent_id != agent_id.strip():
            raise ValueError("handler agent_id must not be empty or padded")
        if agent_id in self._handlers:
            raise DuplicateAgentHandlerError
        self._handlers[agent_id] = handler

    def get(self, agent_id: str) -> AgentRunHandler:
        try:
            return self._handlers[agent_id]
        except KeyError:
            raise AgentHandlerNotFoundError from None

    def __len__(self) -> int:
        return len(self._handlers)

    @property
    def agent_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self._handlers))
