from collections.abc import Callable
from datetime import datetime
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.jobs.jd_parser import JobDescriptionParsingAgent
from riva.agents.jobs.jd_parser_types import (
    JobDescriptionParsingInput,
    JobDescriptionParsingOutput,
)
from riva.core.language import DEFAULT_INTERACTION_LANGUAGE, InteractionLanguage
from riva.integrations.llm import LLMProvider
from riva.models import JobDescriptionImportDraft, User
from riva.services.errors import (
    DomainConflictError,
    ExternalDependencyError,
    InvalidDataError,
    ResourceMissingError,
)
from riva.services.jobs.import_types import (
    JobDescriptionImportDraftCreate,
    JobDescriptionImportDraftResponse,
    JobDescriptionImportDraftStatus,
)
from riva.services.jobs.jd_analysis import new_job_description_analysis
from riva.services.jobs.role_types import (
    ActiveTargetRolePreparationStatus,
    CreateTargetRoleRequest,
)
from riva.services.jobs.roles import TargetRoleService
from riva.utils import utc_now

IMPORT_DRAFT_NOT_FOUND = "job_description_import_draft_not_found"
IMPORT_DRAFT_NOT_READY = "job_description_import_draft_not_ready"
IMPORT_DRAFT_TITLE_MISSING = "job_description_import_draft_title_missing"
IMPORT_DRAFT_PARSING_UNAVAILABLE = "job_description_parsing_unavailable"


class JobDescriptionImportDraftService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: LLMProvider | None = None,
        llm_model: str | None = None,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()
        self.clock = clock

    async def create_draft(
        self,
        user: User,
        payload: JobDescriptionImportDraftCreate,
        *,
        interaction_language: InteractionLanguage = DEFAULT_INTERACTION_LANGUAGE,
    ) -> JobDescriptionImportDraftResponse:
        if self.llm_provider is None or not self.llm_model:
            raise ExternalDependencyError(IMPORT_DRAFT_PARSING_UNAVAILABLE)
        try:
            input_snapshot = JobDescriptionParsingInput(
                role_title=None,
                company=None,
                raw_job_description=payload.raw_text,
                interaction_language=interaction_language,
            )
            output = (
                await JobDescriptionParsingAgent(
                    self.llm_provider,
                    self.llm_model,
                ).run(input_snapshot)
            ).output
            if output.parsed_title is None:
                raise InvalidDataError(IMPORT_DRAFT_TITLE_MISSING)
            draft = JobDescriptionImportDraft(
                user_id=user.id,
                raw_text=payload.raw_text,
                status=JobDescriptionImportDraftStatus.READY.value,
                parsed_company=output.parsed_company,
                parsed_title=output.parsed_title,
                parsed_location=output.parsed_location,
                parsed_description=output.parsed_description or payload.raw_text,
                parsed_result=output.model_dump(mode="json"),
            )
            self.session.add(draft)
            await self.session.commit()
            return job_description_import_draft_response(draft)
        except BaseException:
            await self.session.rollback()
            raise

    async def get_draft(
        self, *, user_id: UUID, draft_id: UUID
    ) -> JobDescriptionImportDraftResponse:
        draft = await self._draft(user_id, draft_id, for_update=False)
        return job_description_import_draft_response(draft)

    async def apply_draft(
        self, user: User, draft_id: UUID
    ) -> JobDescriptionImportDraftResponse:
        try:
            draft = await self._draft(user.id, draft_id, for_update=True)
            if draft.status == JobDescriptionImportDraftStatus.APPLIED.value:
                await self.session.commit()
                return job_description_import_draft_response(draft)
            if (
                draft.status != JobDescriptionImportDraftStatus.READY.value
                or draft.parsed_result is None
                or draft.parsed_title is None
            ):
                raise DomainConflictError(IMPORT_DRAFT_NOT_READY)
            try:
                output = JobDescriptionParsingOutput.model_validate(draft.parsed_result)
            except ValidationError:
                raise DomainConflictError(IMPORT_DRAFT_NOT_READY) from None
            role_service = TargetRoleService(self.session)
            role = await role_service.create_role_in_transaction(
                user.id,
                CreateTargetRoleRequest(
                    title=draft.parsed_title,
                    company=draft.parsed_company,
                    recruitment_type=None,
                    location=draft.parsed_location,
                    experience_range=None,
                    preparation_status=ActiveTargetRolePreparationStatus.PREPARING,
                ),
            )
            await role_service.save_job_description_in_transaction(role, draft.raw_text)
            analysis = new_job_description_analysis(
                role=role,
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

    async def _draft(
        self, user_id: UUID, draft_id: UUID, *, for_update: bool
    ) -> JobDescriptionImportDraft:
        statement = select(JobDescriptionImportDraft).where(
            JobDescriptionImportDraft.id == draft_id,
            JobDescriptionImportDraft.user_id == user_id,
        )
        if for_update:
            statement = statement.with_for_update()
        draft = await self.session.scalar(statement)
        if draft is None:
            raise ResourceMissingError(IMPORT_DRAFT_NOT_FOUND)
        return draft


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
        applied_role_id=draft.applied_role_id,
        can_apply=draft.status == JobDescriptionImportDraftStatus.READY.value,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )
