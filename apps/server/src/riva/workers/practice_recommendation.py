from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import replace

from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult, PracticeRecommendationAgent
from riva.models import AgentRun, AgentRunStatus
from riva.prompts import PRACTICE_RECOMMENDATION_PROMPT
from riva.schemas.practice_recommendation import (
    PracticeNextQuestionRecommendation,
    PracticeRecommendationInput,
    PracticeRetryCurrentRecommendation,
)
from riva.services.practice_recommendation_prompt_versions import (
    get_practice_recommendation_prompt,
)
from riva.services.recommendation_generation import (
    RecommendationGenerationService,
    RecommendationGenerationStateError,
)
from riva.workers.errors import AgentExecutionError
from riva.workers.runtime import SessionFactory

RecommendationGenerationServiceFactory = Callable[
    [AsyncSession], RecommendationGenerationService
]
RecommendationOutput = (
    PracticeRetryCurrentRecommendation | PracticeNextQuestionRecommendation
)


class PracticeRecommendationHandler:
    agent_id = "practice-recommender"

    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        agent: PracticeRecommendationAgent | None = None,
        legacy_agent: PracticeRecommendationAgent | None = None,
        agents: Mapping[str, PracticeRecommendationAgent] | None = None,
        generation_service_factory: RecommendationGenerationServiceFactory = (
            RecommendationGenerationService
        ),
    ) -> None:
        if agent is not None and agent.agent_id != self.agent_id:
            raise ValueError("agent must be the practice recommendation agent")
        self.session_factory = session_factory
        if agents is None:
            if agent is None:
                raise ValueError(
                    "at least one practice recommendation agent is required"
                )
            resolved_agents = {agent.prompt_version: agent}
            if legacy_agent is not None:
                resolved_agents[legacy_agent.prompt_version] = legacy_agent
        else:
            resolved_agents = dict(agents)
            if agent is not None:
                resolved_agents.setdefault(agent.prompt_version, agent)
            if legacy_agent is not None:
                resolved_agents.setdefault(legacy_agent.prompt_version, legacy_agent)
        if not resolved_agents:
            raise ValueError("at least one practice recommendation agent is required")
        for version, current_agent in resolved_agents.items():
            if not hasattr(current_agent, "prompt_version"):
                raise ValueError(
                    "practice recommendation agent mapping must match agent identity and version"
                )
            try:
                prompt = get_practice_recommendation_prompt(version)
            except ValueError:
                raise ValueError(
                    "practice recommendation agent mapping contains an unsupported version"
                ) from None
            if (
                current_agent.agent_id != self.agent_id
                or current_agent.prompt_version != version
                or current_agent.prompt is not prompt
                or current_agent.prompt_id != prompt.prompt_id
            ):
                raise ValueError(
                    "practice recommendation agent mapping must match agent identity and version"
                )
        self._agents = resolved_agents
        self.agents = dict(resolved_agents)
        self.agent = self._agents.get(PRACTICE_RECOMMENDATION_PROMPT.version) or next(
            iter(self._agents.values())
        )
        self.legacy_agent = self._agents.get("1")
        self.generation_service_factory = generation_service_factory

    async def execute(
        self,
        run: AgentRun,
    ) -> AgentResult[RecommendationOutput]:
        if (
            run.status is not AgentRunStatus.RUNNING
            or run.lease_token is None
            or run.agent_id != self.agent_id
        ):
            raise AgentExecutionError(
                "invalid_practice_recommendation_run",
                retryable=False,
            )

        agent = self._agent_for_run(run)

        try:
            async with self.session_factory() as session:
                generation_input = await self.generation_service_factory(
                    session
                ).load_generation_input(run)
        except RecommendationGenerationStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        result = await agent.run(generation_input)
        if (
            result.agent_id != run.agent_id
            or result.prompt_id != run.prompt_id
            or result.prompt_version != run.prompt_version
            or not isinstance(
                result.output,
                (
                    PracticeRetryCurrentRecommendation,
                    PracticeNextQuestionRecommendation,
                ),
            )
        ):
            raise AgentExecutionError(
                "agent_run_result_mismatch",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                canonical_output = await self.generation_service_factory(
                    session
                ).persist_success(
                    run,
                    result.output,
                )
        except RecommendationGenerationStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        if canonical_output == result.output:
            return result
        return replace(result, output=canonical_output)

    def _agent_for_run(self, run: AgentRun) -> PracticeRecommendationAgent:
        try:
            prompt = get_practice_recommendation_prompt(run.prompt_version)
        except ValueError:
            raise AgentExecutionError(
                "invalid_practice_recommendation_run",
                retryable=False,
            ) from None
        agent = self._agents.get(prompt.version)
        if (
            agent is None
            or agent.agent_id != self.agent_id
            or getattr(agent, "prompt", None) is not prompt
            or agent.prompt_id != run.prompt_id
            or agent.prompt_version != run.prompt_version
        ):
            raise AgentExecutionError(
                "invalid_practice_recommendation_run",
                retryable=False,
            )
        return agent


__all__ = [
    "PracticeRecommendationHandler",
    "RecommendationGenerationServiceFactory",
    "RecommendationOutput",
]
