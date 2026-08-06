from collections.abc import Callable
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult, ResumeParsingAgent
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.resume_parsing import (
    ResumeParsingOutput,
    ResumeParsingRunPayload,
)
from riva.services.resume_imports import (
    ResumeImportDraftService,
    ResumeImportStateError,
)
from riva.services.resume_parsing import (
    INVALID_RESUME_PARSING_RUN,
    ResumeParsingService,
    ResumeParsingStateError,
)
from riva.workers.errors import AgentExecutionError
from riva.workers.runtime import SessionFactory


ParsingServiceFactory = Callable[[AsyncSession], ResumeParsingService]
DraftServiceFactory = Callable[[AsyncSession], ResumeImportDraftService]


class ResumeParsingWorkerHandler:
    agent_id = "resume-parser"

    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        agent: ResumeParsingAgent,
        parsing_service_factory: ParsingServiceFactory = ResumeParsingService,
        draft_service_factory: DraftServiceFactory = ResumeImportDraftService,
    ) -> None:
        if agent.agent_id != self.agent_id:
            raise ValueError("agent must be the resume parsing agent")
        self.session_factory = session_factory
        self.agent = agent
        self.parsing_service_factory = parsing_service_factory
        self.draft_service_factory = draft_service_factory

    async def execute(
        self,
        run: AgentRun,
    ) -> AgentResult[ResumeParsingOutput]:
        if (
            run.status is not AgentRunStatus.RUNNING
            or run.lease_token is None
            or run.agent_id != self.agent_id
        ):
            raise AgentExecutionError(
                INVALID_RESUME_PARSING_RUN,
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                parsing_input = await self.parsing_service_factory(
                    session
                ).load_input(run)
        except ResumeParsingStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        result = await self.agent.run(parsing_input)
        if (
            result.agent_id != run.agent_id
            or result.prompt_id != run.prompt_id
            or result.prompt_version != run.prompt_version
            or not isinstance(result.output, ResumeParsingOutput)
        ):
            raise AgentExecutionError(
                "agent_run_result_mismatch",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                await self.parsing_service_factory(session).persist_success(
                    run,
                    result.output,
                )
        except ResumeParsingStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        resume_document_id = _resume_document_id(run)
        try:
            async with self.session_factory() as session:
                await self.draft_service_factory(session).build_draft(
                    user_id=run.user_id,
                    resume_document_id=resume_document_id,
                )
        except ResumeImportStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        return result


def _resume_document_id(run: AgentRun) -> UUID:
    try:
        return ResumeParsingRunPayload.model_validate(
            run.payload
        ).resume_document_id
    except (TypeError, ValueError, ValidationError):
        raise AgentExecutionError(
            INVALID_RESUME_PARSING_RUN,
            retryable=False,
        ) from None


__all__ = ["ResumeParsingWorkerHandler"]
