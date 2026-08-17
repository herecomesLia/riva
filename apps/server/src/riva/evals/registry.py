from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from riva.agents.base import Agent
from riva.agents.interview_turn import InterviewTurnAgent
from riva.agents.question_generation import QuestionGenerationAgent
from riva.integrations import LLMProvider
from riva.prompts import INTERVIEW_TURN_PROMPT, QUESTION_GENERATION_PROMPT
from riva.schemas.interview_turn import InterviewTurnInput
from riva.schemas.question_generation import QuestionGenerationInput


AgentFactory = Callable[[LLMProvider, str], Agent[Any, Any]]


class UnknownAgentError(ValueError):
    """Raised when an eval references an agent absent from the registry."""


@dataclass(frozen=True, slots=True)
class AgentEvalRegistration:
    agent_id: str
    input_schema: type[BaseModel]
    agent_factory: AgentFactory
    prompt_id: str
    prompt_version: str

    def __post_init__(self) -> None:
        for field_name in (
            "agent_id",
            "prompt_id",
            "prompt_version",
        ):
            value = getattr(self, field_name)
            if not value.strip():
                raise ValueError(f"{field_name} must not be empty")

    @property
    def agent(self) -> AgentFactory:
        """The registered Agent constructor exposed for registry inspection."""

        return self.agent_factory


class AgentEvalRegistry:
    """Explicit, in-memory registry of agents that can run offline evals."""

    def __init__(
        self,
        registrations: Iterable[AgentEvalRegistration] | None = None,
    ) -> None:
        self._registrations: dict[str, AgentEvalRegistration] = {}
        for registration in (
            _canonical_registrations() if registrations is None else registrations
        ):
            self.register(registration)

    def register(self, registration: AgentEvalRegistration) -> None:
        if registration.agent_id in self._registrations:
            raise ValueError(
                f"Agent eval registration already exists: {registration.agent_id}"
            )
        self._registrations[registration.agent_id] = registration

    def get(self, agent_id: str) -> AgentEvalRegistration:
        try:
            return self._registrations[agent_id]
        except KeyError:
            raise UnknownAgentError(
                f"Unknown eval agent: {agent_id}"
            ) from None

    def __contains__(self, agent_id: str) -> bool:
        return agent_id in self._registrations

    @property
    def agent_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self._registrations))


def build_default_registry() -> AgentEvalRegistry:
    """Build the canonical registry without touching application state."""

    return AgentEvalRegistry(_canonical_registrations())


def _canonical_registrations() -> tuple[AgentEvalRegistration, ...]:
    return (
        AgentEvalRegistration(
            agent_id="question-generator",
            input_schema=QuestionGenerationInput,
            agent_factory=QuestionGenerationAgent,
            prompt_id=QUESTION_GENERATION_PROMPT.prompt_id,
            prompt_version=QUESTION_GENERATION_PROMPT.version,
        ),
        AgentEvalRegistration(
            agent_id="interview-turn",
            input_schema=InterviewTurnInput,
            agent_factory=InterviewTurnAgent,
            prompt_id=INTERVIEW_TURN_PROMPT.prompt_id,
            prompt_version=INTERVIEW_TURN_PROMPT.version,
        ),
    )


DEFAULT_AGENT_EVAL_REGISTRY = build_default_registry()


__all__ = [
    "AgentEvalRegistration",
    "AgentEvalRegistry",
    "DEFAULT_AGENT_EVAL_REGISTRY",
    "UnknownAgentError",
    "build_default_registry",
]
