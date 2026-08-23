from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult, MatchingAnalysisAgent
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.matching_analysis import (
    MatchingAnalysisOutput,
)
from riva.services.matching_analyses import (
    MatchingAnalysisService,
    MatchingAnalysisStateError,
)
from riva.workers.errors import AgentExecutionError
from riva.workers.runtime import SessionFactory

AnalysisServiceFactory = Callable[[AsyncSession], MatchingAnalysisService]


class MatchingAnalysisHandler:
    agent_id = MatchingAnalysisAgent.agent_id

    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        agent: MatchingAnalysisAgent,
        analysis_service_factory: AnalysisServiceFactory = (MatchingAnalysisService),
    ) -> None:
        if agent.agent_id != self.agent_id:
            raise ValueError("agent must be the matching analysis agent")
        self.session_factory = session_factory
        self.agent = agent
        self.analysis_service_factory = analysis_service_factory

    async def execute(
        self,
        run: AgentRun,
    ) -> AgentResult[MatchingAnalysisOutput]:
        if (
            run.status is not AgentRunStatus.RUNNING
            or run.lease_token is None
            or run.agent_id != self.agent_id
        ):
            raise AgentExecutionError(
                "invalid_matching_analysis_run",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                matching_input = await self.analysis_service_factory(
                    session
                ).load_matching_input(run)
        except MatchingAnalysisStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        result = await self.agent.run(matching_input)
        if (
            result.agent_id != run.agent_id
            or result.prompt_id != run.prompt_id
            or result.prompt_version != run.prompt_version
            or not isinstance(result.output, MatchingAnalysisOutput)
        ):
            raise AgentExecutionError(
                "agent_run_result_mismatch",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                await self.analysis_service_factory(session).persist_success(
                    run,
                    result.output,
                )
        except MatchingAnalysisStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        return result
