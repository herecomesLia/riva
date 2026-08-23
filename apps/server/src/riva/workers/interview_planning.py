from collections.abc import Callable

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
from riva.workers.errors import AgentExecutionError
from riva.workers.runtime import SessionFactory

PlanningServiceFactory = Callable[[AsyncSession], InterviewPlanningService]


class InterviewPlanningHandler:
    agent_id = InterviewPlanningAgent.agent_id

    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        agent: InterviewPlanningAgent,
        planning_service_factory: PlanningServiceFactory = InterviewPlanningService,
    ) -> None:
        if (
            agent.agent_id != self.agent_id
            or agent.agent_version != InterviewPlanningAgent.agent_version
        ):
            raise ValueError("agent must be the current interview planning agent")
        self.session_factory = session_factory
        self.agent = agent
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
        if (
            run.prompt_id != self.agent.agent_id
            or run.prompt_version != self.agent.agent_version
        ):
            raise AgentExecutionError(
                "invalid_interview_planning_run",
                retryable=False,
            )
        return self.agent


__all__ = ["InterviewPlanningHandler"]
