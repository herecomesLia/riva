from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import ResumeImportDraft, ResumeParsingResult
from riva.services.errors import (
    DomainConflictError,
    ResourceMissingError,
    ServiceError,
)
from riva.services.profile.types import CareerProfileResponse
from riva.services.resumes.apply import (
    ResumeImportApplicationResult,
    ResumeImportApplicationService,
)
from riva.services.resumes.drafts import (
    RESUME_DOCUMENT_NOT_FOUND,
    RESUME_IMPORT_APPLY_CONFLICT,
    RESUME_IMPORT_DRAFT_CONFLICT,
    RESUME_IMPORT_DRAFT_INVALID,
    RESUME_IMPORT_DRAFT_NOT_FOUND,
    RESUME_IMPORT_DRAFT_NOT_READY,
    RESUME_IMPORT_DRAFT_VERSION_CONFLICT,
    RESUME_IMPORT_PROFILE_INVALID,
    RESUME_IMPORT_PROFILE_VERSION_CONFLICT,
    RESUME_PARSING_RESULT_INVALID,
    RESUME_PARSING_RESULT_NOT_FOUND,
    ResumeImportDraftService,
    ResumeImportStateError,
    resume_import_draft_data_from_model,
)
from riva.services.resumes.import_types import (
    ResumeImportApplicationResponse,
    ResumeImportDraftResponse,
)

_NOT_FOUND_CODES = {
    RESUME_DOCUMENT_NOT_FOUND,
    RESUME_IMPORT_DRAFT_NOT_FOUND,
}
_CONFLICT_CODES = {
    RESUME_IMPORT_DRAFT_NOT_READY,
    RESUME_PARSING_RESULT_NOT_FOUND,
    RESUME_PARSING_RESULT_INVALID,
    RESUME_IMPORT_DRAFT_INVALID,
    RESUME_IMPORT_DRAFT_VERSION_CONFLICT,
    RESUME_IMPORT_PROFILE_VERSION_CONFLICT,
    RESUME_IMPORT_APPLY_CONFLICT,
    RESUME_IMPORT_PROFILE_INVALID,
    RESUME_IMPORT_DRAFT_CONFLICT,
}


class ResumeImportService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        draft_service_factory: Callable[
            [AsyncSession], ResumeImportDraftService
        ] = ResumeImportDraftService,
        application_service_factory: Callable[
            [AsyncSession], ResumeImportApplicationService
        ] = ResumeImportApplicationService,
    ) -> None:
        self.session = session
        self.draft_service_factory = draft_service_factory
        self.application_service_factory = application_service_factory

    async def get_draft(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
    ) -> ResumeImportDraftResponse:
        try:
            await self._require_parsing_succeeded(
                user_id=user_id,
                resume_document_id=resume_document_id,
            )
            draft = await self.draft_service_factory(self.session).build_draft(
                user_id=user_id,
                resume_document_id=resume_document_id,
            )
            return build_resume_import_draft_response(draft)
        except ResumeImportStateError as exc:
            raise resume_import_state_service_error(exc) from None

    async def apply_draft(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
        draft_version: int,
    ) -> ResumeImportApplicationResponse:
        try:
            await self._require_parsing_succeeded(
                user_id=user_id,
                resume_document_id=resume_document_id,
            )
            result = await self.application_service_factory(self.session).apply_draft(
                user_id=user_id,
                resume_document_id=resume_document_id,
                draft_version=draft_version,
            )
            return build_resume_import_application_response(result)
        except ResumeImportStateError as exc:
            raise resume_import_state_service_error(exc) from None

    async def _require_parsing_succeeded(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
    ) -> None:
        result = await self.session.scalar(
            select(ResumeParsingResult).where(
                ResumeParsingResult.user_id == user_id,
                ResumeParsingResult.resume_document_id == resume_document_id,
            )
        )
        if result is None:
            raise DomainConflictError(RESUME_IMPORT_DRAFT_NOT_READY)


def build_resume_import_draft_response(
    draft: ResumeImportDraft,
) -> ResumeImportDraftResponse:
    try:
        data = resume_import_draft_data_from_model(draft)
        values = data.model_dump(mode="python", by_alias=False)
        return ResumeImportDraftResponse(
            resume_document_id=draft.resume_document_id,
            parsing_result_version=draft.parsing_result_version,
            draft_version=draft.draft_version,
            status=draft.status,
            base_profile_id=draft.base_profile_id,
            base_profile_version=draft.base_profile_version,
            applied_profile_version=draft.applied_profile_version,
            applied_at=draft.applied_at,
            can_apply=draft.status == "ready",
            created_at=draft.created_at,
            updated_at=draft.updated_at,
            **values,
        )
    except ResumeImportStateError:
        raise
    except AttributeError, TypeError, ValueError, ValidationError:
        raise ResumeImportStateError(RESUME_IMPORT_DRAFT_INVALID) from None


def build_resume_import_application_response(
    result: ResumeImportApplicationResult,
) -> ResumeImportApplicationResponse:
    try:
        profile = (
            result.profile
            if isinstance(result.profile, CareerProfileResponse)
            else CareerProfileResponse.model_validate(result.profile)
        )
        return ResumeImportApplicationResponse(
            draft=build_resume_import_draft_response(result.draft),
            profile=profile,
            profile_created=result.profile_created,
            profile_changed=result.profile_changed,
        )
    except ResumeImportStateError:
        raise
    except AttributeError, TypeError, ValueError, ValidationError:
        raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID) from None


def resume_import_state_service_error(error: ResumeImportStateError) -> ServiceError:

    if error.code in _NOT_FOUND_CODES:
        return ResourceMissingError(error.code)
    if error.code in _CONFLICT_CODES:
        return DomainConflictError(error.code)
    return DomainConflictError(error.code)
