from collections.abc import Callable, Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult, InterviewPlanningAgent
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.interview_planning import (
    InterviewPlanningOutput,
)
from riva.services.interview_planning import (
    InterviewPlanningService,
    InterviewPlanningStateError,
)
from riva.services.interview_planning_prompt_versions import (
    get_interview_planning_prompt,
)
from riva.workers.errors import AgentExecutionError
from riva.workers.runtime import SessionFactory


PlanningServiceFactory = Callable[[AsyncSession], InterviewPlanningService]


class InterviewPlanningHandler:
    agent_id = "interview-planner"

    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        agent: InterviewPlanningAgent | None = None,
        legacy_agent: InterviewPlanningAgent | None = None,
        agents: Mapping[str, InterviewPlanningAgent] | None = None,
        planning_service_factory: PlanningServiceFactory = InterviewPlanningService,
    ) -> None:
        self.session_factory = session_factory
        if agents is None:
            if agent is None:
                raise ValueError("at least one interview planning agent is required")
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
            raise ValueError("at least one interview planning agent is required")
        for version, current_agent in resolved_agents.items():
            try:
                prompt = get_interview_planning_prompt(version)
            except ValueError:
                raise ValueError(
                    "interview planning agent mapping contains an unsupported version"
                ) from None
            if (
                current_agent.agent_id != self.agent_id
                or current_agent.prompt_version != version
                or current_agent.prompt is not prompt
                or current_agent.prompt_id != prompt.prompt_id
            ):
                raise ValueError(
                    "interview planning agent mapping must match agent identity "
                    "and version"
                )
        self._agents = resolved_agents
        self.agents = dict(resolved_agents)
        current_prompt = get_interview_planning_prompt("2")
        self.agent = self._agents.get(current_prompt.version) or next(
            iter(self._agents.values())
        )
        self.legacy_agent = self._agents.get("1")
        self.planning_service_factory = planning_service_factory

    async def execute(
        self,
        run: AgentRun,
    ) -> AgentResult[InterviewPlanningOutput]:
        if (
            run.status is not AgentRunStatus.RUNNING
            or run.lease_token is None
            or run.agent_id != self.agent_id
        ):
            raise AgentExecutionError(
                "invalid_interview_planning_run",
                retryable=False,
            )

        agent = self._agent_for_run(run)

        try:
            async with self.session_factory() as session:
                planning_input = await self.planning_service_factory(
                    session
                ).load_planning_input(run)
        except InterviewPlanningStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        result = await agent.run(planning_input)
        if (
            result.agent_id != run.agent_id
            or result.prompt_id != run.prompt_id
            or result.prompt_version != run.prompt_version
            or not isinstance(result.output, InterviewPlanningOutput)
        ):
            raise AgentExecutionError(
                "agent_run_result_mismatch",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                await self.planning_service_factory(session).persist_success(
                    run,
                    result.output,
                )
        except InterviewPlanningStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        return result

    def _agent_for_run(self, run: AgentRun) -> InterviewPlanningAgent:
        try:
            prompt = get_interview_planning_prompt(run.prompt_version)
        except ValueError:
            raise AgentExecutionError(
                "invalid_interview_planning_run",
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
                "invalid_interview_planning_run",
                retryable=False,
            )
        return agent


__all__ = ["InterviewPlanningHandler"]
