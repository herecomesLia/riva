from collections.abc import Callable

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult, JobDescriptionParsingAgent
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.job_description_parsing import (
    JobDescriptionParsingOutput,
    JobDescriptionParsingRunPayload,
)
from riva.services.job_description_analyses import (
    JobDescriptionAnalysisService,
    JobDescriptionParsingStateError,
)
from riva.services.job_description_import_drafts import (
    JobDescriptionImportDraftService,
    JobDescriptionImportDraftStateError,
)
from riva.workers.errors import AgentExecutionError
from riva.workers.runtime import SessionFactory

AnalysisServiceFactory = Callable[[AsyncSession], JobDescriptionAnalysisService]
ImportDraftServiceFactory = Callable[[AsyncSession], JobDescriptionImportDraftService]


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
        import_draft_service_factory: ImportDraftServiceFactory = (
            JobDescriptionImportDraftService
        ),
    ) -> None:
        if agent.agent_id != self.agent_id:
            raise ValueError("agent must be the job description parsing agent")
        self.session_factory = session_factory
        self.agent = agent
        self.analysis_service_factory = analysis_service_factory
        self.import_draft_service_factory = import_draft_service_factory

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
                if _is_import_draft_run(run):
                    parsing_input = await self.import_draft_service_factory(
                        session
                    ).load_parsing_input(run)
                else:
                    parsing_input = await self.analysis_service_factory(
                        session
                    ).load_parsing_input(run)
        except (
            JobDescriptionImportDraftStateError,
            JobDescriptionParsingStateError,
        ) as error:
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
                if _is_import_draft_run(run):
                    await self.import_draft_service_factory(session).persist_success(
                        run, result.output
                    )
                else:
                    await self.analysis_service_factory(session).persist_success(
                        run, result.output
                    )
        except (
            JobDescriptionImportDraftStateError,
            JobDescriptionParsingStateError,
        ) as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        return result

    async def persist_terminal_failure(
        self,
        run: AgentRun,
        error_code: str,
    ) -> None:
        if not _is_import_draft_run(run):
            return
        async with self.session_factory() as session:
            await self.import_draft_service_factory(session).persist_failure(
                run,
                error_code,
            )


def _is_import_draft_run(run: AgentRun) -> bool:
    try:
        payload = JobDescriptionParsingRunPayload.model_validate(run.payload)
    except ValidationError:
        return False
    return payload.job_description_import_draft_id is not None
