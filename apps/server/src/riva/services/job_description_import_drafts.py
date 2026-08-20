from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from fastapi import status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.errors import APIError
from riva.core.language import (
    DEFAULT_INTERACTION_LANGUAGE,
    InteractionLanguage,
)
from riva.models import (
    AgentRun,
    JobDescriptionImportDraft,
    User,
)
from riva.prompts import JOB_DESCRIPTION_PARSING_PROMPT
from riva.schemas.job_description_import_drafts import (
    JobDescriptionImportDraftCreate,
    JobDescriptionImportDraftResponse,
    JobDescriptionImportDraftStatus,
)
from riva.schemas.job_description_parsing import (
    JobDescriptionParsingInput,
    JobDescriptionParsingOutput,
    JobDescriptionParsingRunPayload,
)
from riva.schemas.roles import (
    ActiveTargetRolePreparationStatus,
    CreateTargetRoleRequest,
)
from riva.services.agent_runs import AgentRunService
from riva.services.job_description_analyses import (
    new_job_description_analysis,
)
from riva.services.prompt_versions import (
    JOB_DESCRIPTION_PARSING_ACCEPTED_PROMPT_VERSIONS,
)
from riva.services.roles import TargetRoleService
from riva.utils import utc_now


AgentRunServiceFactory = Callable[[AsyncSession], AgentRunService]
Clock = Callable[[], datetime]

IMPORT_DRAFT_NOT_FOUND = "job_description_import_draft_not_found"
IMPORT_DRAFT_NOT_READY = "job_description_import_draft_not_ready"
IMPORT_DRAFT_INVALID_RUN = "invalid_job_description_import_draft_run"
IMPORT_DRAFT_SUPERSEDED = "job_description_import_draft_superseded"
IMPORT_DRAFT_TITLE_MISSING = "job_description_import_draft_title_missing"
IMPORT_DRAFT_PARSING_UNAVAILABLE = "job_description_parsing_unavailable"


class JobDescriptionImportDraftStateError(RuntimeError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__("The job description import draft state is invalid.")


class JobDescriptionImportDraftService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: str | None = None,
        llm_model: str | None = None,
        agent_run_service_factory: AgentRunServiceFactory = AgentRunService,
        clock: Clock = utc_now,
    ) -> None:
        self.session = session
        self.llm_provider = (llm_provider or "").strip().lower()
        self.llm_model = (llm_model or "").strip()
        self.agent_run_service_factory = agent_run_service_factory
        self.clock = clock

    async def create_draft(
        self,
        user: User,
        payload: JobDescriptionImportDraftCreate,
        *,
        interaction_language: InteractionLanguage = DEFAULT_INTERACTION_LANGUAGE,
    ) -> JobDescriptionImportDraftResponse:
        self._require_parsing_configuration()
        try:
            draft = JobDescriptionImportDraft(
                user_id=user.id,
                raw_text=payload.raw_text,
                status=JobDescriptionImportDraftStatus.PARSING.value,
            )
            self.session.add(draft)
            await self.session.flush()

            prompt = JOB_DESCRIPTION_PARSING_PROMPT
            run_payload = JobDescriptionParsingRunPayload(
                job_description_import_draft_id=draft.id,
                interaction_language=interaction_language,
            )
            run = await self.agent_run_service_factory(
                self.session
            ).enqueue_in_transaction(
                user_id=user.id,
                agent_id="job-description-parser",
                prompt_id=prompt.prompt_id,
                prompt_version=prompt.version,
                output_schema_id=prompt.output_schema_id,
                model=self.llm_model,
                payload=run_payload.model_dump(
                    mode="json",
                    by_alias=True,
                    exclude_none=True,
                ),
                idempotency_key=f"job-description-import:{draft.id}",
                max_attempts=3,
            )
            draft.agent_run_id = run.id
            draft.agent_run = run
            await self.session.commit()
            return job_description_import_draft_response(draft)
        except Exception:
            await self.session.rollback()
            raise

    async def get_draft(
        self,
        *,
        user_id: UUID,
        draft_id: UUID,
    ) -> JobDescriptionImportDraftResponse:
        draft = await self._draft(user_id, draft_id, for_update=False)
        return job_description_import_draft_response(draft)

    async def apply_draft(
        self,
        user: User,
        draft_id: UUID,
    ) -> JobDescriptionImportDraftResponse:
        try:
            draft = await self._draft(user.id, draft_id, for_update=True)
            if draft.status == JobDescriptionImportDraftStatus.APPLIED.value:
                if draft.applied_role_id is None:
                    raise APIError(
                        status.HTTP_409_CONFLICT,
                        IMPORT_DRAFT_NOT_READY,
                    )
                await self.session.commit()
                return job_description_import_draft_response(draft)
            if draft.status != JobDescriptionImportDraftStatus.READY.value:
                raise APIError(
                    status.HTTP_409_CONFLICT,
                    IMPORT_DRAFT_NOT_READY,
                )
            if draft.parsed_result is None or draft.parsed_title is None:
                raise APIError(
                    status.HTTP_409_CONFLICT,
                    IMPORT_DRAFT_NOT_READY,
                )
            try:
                output = JobDescriptionParsingOutput.model_validate(
                    draft.parsed_result
                )
            except ValidationError:
                raise APIError(
                    status.HTTP_409_CONFLICT,
                    IMPORT_DRAFT_NOT_READY,
                ) from None
            if draft.agent_run_id is None:
                raise APIError(
                    status.HTTP_409_CONFLICT,
                    IMPORT_DRAFT_NOT_READY,
                )

            role_service = TargetRoleService(self.session)
            role = await role_service.create_role_in_transaction(
                user.id,
                CreateTargetRoleRequest(
                    title=draft.parsed_title,
                    company=draft.parsed_company,
                    recruitment_type=None,
                    location=draft.parsed_location,
                    experience_range=None,
                    preparation_status=(
                        ActiveTargetRolePreparationStatus.PREPARING
                    ),
                ),
            )
            await role_service.save_job_description_in_transaction(
                role,
                draft.raw_text,
            )
            role.job_description_parsing_run_id = draft.agent_run_id
            analysis = new_job_description_analysis(
                role=role,
                source_agent_run_id=draft.agent_run_id,
                output=output,
                parsed_at=self.clock(),
            )
            self.session.add(analysis)
            role.job_description_analysis = analysis
            draft.status = JobDescriptionImportDraftStatus.APPLIED.value
            draft.applied_role_id = role.id
            await self.session.commit()
            return job_description_import_draft_response(draft)
        except Exception:
            await self.session.rollback()
            raise

    async def load_parsing_input(
        self,
        run: AgentRun,
    ) -> JobDescriptionParsingInput:
        try:
            draft = await self._draft_for_run(run, for_update=False)
            if draft.status != JobDescriptionImportDraftStatus.PARSING.value:
                raise JobDescriptionImportDraftStateError(
                    IMPORT_DRAFT_SUPERSEDED
                )
            parsing_input = JobDescriptionParsingInput(
                role_title=None,
                company=None,
                raw_job_description=draft.raw_text,
                interaction_language=self._run_payload(
                    run
                ).interaction_language,
            )
            await self.session.commit()
            return parsing_input
        except Exception:
            await self.session.rollback()
            raise

    async def persist_success(
        self,
        run: AgentRun,
        output: JobDescriptionParsingOutput,
    ) -> JobDescriptionImportDraft:
        try:
            draft = await self._draft_for_run(run, for_update=True)
            if draft.status == JobDescriptionImportDraftStatus.READY.value:
                await self.session.commit()
                return draft
            if draft.status != JobDescriptionImportDraftStatus.PARSING.value:
                raise JobDescriptionImportDraftStateError(
                    IMPORT_DRAFT_SUPERSEDED
                )
            if output.parsed_title is None:
                raise JobDescriptionImportDraftStateError(
                    IMPORT_DRAFT_TITLE_MISSING
                )

            draft.parsed_company = output.parsed_company
            draft.parsed_title = output.parsed_title
            draft.parsed_location = output.parsed_location
            draft.parsed_description = (
                output.parsed_description or draft.raw_text
            )
            draft.parsed_result = output.model_dump(mode="json")
            draft.status = JobDescriptionImportDraftStatus.READY.value
            draft.failure_reason = None
            await self.session.commit()
            return draft
        except Exception:
            await self.session.rollback()
            raise

    async def persist_failure(
        self,
        run: AgentRun,
        failure_reason: str,
    ) -> None:
        try:
            draft = await self._draft_for_run(run, for_update=True)
            if draft.status == JobDescriptionImportDraftStatus.APPLIED.value:
                await self.session.commit()
                return
            draft.status = JobDescriptionImportDraftStatus.FAILED.value
            draft.failure_reason = failure_reason.strip() or "agent_execution_error"
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

    async def _draft(
        self,
        user_id: UUID,
        draft_id: UUID,
        *,
        for_update: bool,
    ) -> JobDescriptionImportDraft:
        statement = select(JobDescriptionImportDraft).where(
            JobDescriptionImportDraft.id == draft_id,
            JobDescriptionImportDraft.user_id == user_id,
        )
        if for_update:
            statement = statement.with_for_update()
        draft = await self.session.scalar(statement)
        if draft is None:
            raise APIError(
                status.HTTP_404_NOT_FOUND,
                IMPORT_DRAFT_NOT_FOUND,
            )
        return draft

    async def _draft_for_run(
        self,
        run: AgentRun,
        *,
        for_update: bool,
    ) -> JobDescriptionImportDraft:
        payload = self._run_payload(run)
        draft_id = payload.job_description_import_draft_id
        if draft_id is None:
            raise JobDescriptionImportDraftStateError(
                IMPORT_DRAFT_INVALID_RUN
            )
        statement = select(JobDescriptionImportDraft).where(
            JobDescriptionImportDraft.id == draft_id,
            JobDescriptionImportDraft.user_id == run.user_id,
        )
        if for_update:
            statement = statement.with_for_update()
        draft = await self.session.scalar(statement)
        if draft is None:
            raise JobDescriptionImportDraftStateError(
                IMPORT_DRAFT_INVALID_RUN
            )
        if draft.agent_run_id != run.id:
            raise JobDescriptionImportDraftStateError(
                IMPORT_DRAFT_SUPERSEDED
            )
        return draft

    @staticmethod
    def _run_payload(run: AgentRun) -> JobDescriptionParsingRunPayload:
        prompt = JOB_DESCRIPTION_PARSING_PROMPT
        if (
            run.agent_id != "job-description-parser"
            or run.prompt_id != prompt.prompt_id
            or run.prompt_version
            not in JOB_DESCRIPTION_PARSING_ACCEPTED_PROMPT_VERSIONS
            or run.output_schema_id != prompt.output_schema_id
        ):
            raise JobDescriptionImportDraftStateError(
                IMPORT_DRAFT_INVALID_RUN
            )
        try:
            return JobDescriptionParsingRunPayload.model_validate(run.payload)
        except ValidationError:
            raise JobDescriptionImportDraftStateError(
                IMPORT_DRAFT_INVALID_RUN
            ) from None

    def _require_parsing_configuration(self) -> None:
        if self.llm_provider != "qwen" or not self.llm_model:
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                IMPORT_DRAFT_PARSING_UNAVAILABLE,
            )


def job_description_import_draft_response(
    draft: JobDescriptionImportDraft,
) -> JobDescriptionImportDraftResponse:
    return JobDescriptionImportDraftResponse(
        id=draft.id,
        raw_text=draft.raw_text,
        parsed_company=draft.parsed_company,
        parsed_title=draft.parsed_title,
        parsed_location=draft.parsed_location,
        parsed_description=draft.parsed_description,
        status=JobDescriptionImportDraftStatus(draft.status),
        agent_run_id=draft.agent_run_id,
        failure_reason=draft.failure_reason,
        applied_role_id=draft.applied_role_id,
        can_apply=draft.status == JobDescriptionImportDraftStatus.READY.value,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


__all__ = [
    "JobDescriptionImportDraftService",
    "JobDescriptionImportDraftStateError",
    "job_description_import_draft_response",
]
