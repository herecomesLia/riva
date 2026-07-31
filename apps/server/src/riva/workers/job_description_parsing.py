from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult, JobDescriptionParsingAgent
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.job_description_parsing import JobDescriptionParsingOutput
from riva.services.job_description_analyses import (
    JobDescriptionAnalysisService,
    JobDescriptionParsingStateError,
)
from riva.workers.errors import AgentExecutionError
from riva.workers.runtime import SessionFactory


AnalysisServiceFactory = Callable[[AsyncSession], JobDescriptionAnalysisService]


class JobDescriptionParsingHandler:
    agent_id = "job-description-parser"

    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        agent: JobDescriptionParsingAgent,
        analysis_service_factory: AnalysisServiceFactory = (
            JobDescriptionAnalysisService
        ),
    ) -> None:
        if agent.agent_id != self.agent_id:
            raise ValueError("agent must be the job description parsing agent")
        self.session_factory = session_factory
        self.agent = agent
        self.analysis_service_factory = analysis_service_factory

    async def execute(
        self,
        run: AgentRun,
    ) -> AgentResult[JobDescriptionParsingOutput]:
        if (
            run.status is not AgentRunStatus.RUNNING
            or run.lease_token is None
            or run.agent_id != self.agent_id
        ):
            raise AgentExecutionError(
                "invalid_job_description_parse_run",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                parsing_input = await self.analysis_service_factory(
                    session
                ).load_parsing_input(run)
        except JobDescriptionParsingStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        result = await self.agent.run(parsing_input)
        if (
            result.agent_id != run.agent_id
            or result.prompt_id != run.prompt_id
            or result.prompt_version != run.prompt_version
            or not isinstance(result.output, JobDescriptionParsingOutput)
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
        except JobDescriptionParsingStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        return result
