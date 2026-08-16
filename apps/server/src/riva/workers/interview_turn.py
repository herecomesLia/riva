from collections.abc import Callable
from dataclasses import replace

from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult, InterviewTurnAgent
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.interview_turn import InterviewTurnOutput
from riva.services.interview_turn import (
    InterviewTurnService,
    InterviewTurnStateError,
)
from riva.workers.errors import AgentExecutionError
from riva.workers.runtime import SessionFactory


TurnServiceFactory = Callable[[AsyncSession], InterviewTurnService]


class InterviewTurnHandler:
    agent_id = "interview-turn"

    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        agent: InterviewTurnAgent,
        turn_service_factory: TurnServiceFactory = InterviewTurnService,
    ) -> None:
        if agent.agent_id != self.agent_id:
            raise ValueError("agent must be the interview turn agent")
        self.session_factory = session_factory
        self.agent = agent
        self.turn_service_factory = turn_service_factory

    async def execute(
        self,
        run: AgentRun,
    ) -> AgentResult[InterviewTurnOutput]:
        if (
            run.status is not AgentRunStatus.RUNNING
            or run.lease_token is None
            or run.agent_id != self.agent_id
        ):
            raise AgentExecutionError(
                "invalid_interview_turn_run",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                turn_input = await self.turn_service_factory(
                    session
                ).load_turn_input(run)
        except InterviewTurnStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        result = await self.agent.run(turn_input)
        if (
            result.agent_id != run.agent_id
            or result.prompt_id != run.prompt_id
            or result.prompt_version != run.prompt_version
            or not isinstance(result.output, InterviewTurnOutput)
        ):
            raise AgentExecutionError(
                "agent_run_result_mismatch",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                canonical_output = await self.turn_service_factory(
                    session
                ).persist_success(run, result.output)
        except InterviewTurnStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        if canonical_output == result.output:
            return result
        return replace(result, output=canonical_output)


__all__ = ["InterviewTurnHandler"]
