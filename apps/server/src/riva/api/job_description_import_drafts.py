from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request, status

from riva.core.auth import require_current_user
from riva.core.csrf import csrf_protect
from riva.core.job_description_import_drafts import (
    get_job_description_import_draft_service,
)
from riva.core.language import normalize_interaction_language
from riva.models import User
from riva.schemas.job_description_import_drafts import (
    JobDescriptionImportDraftCreate,
    JobDescriptionImportDraftResponse,
)
from riva.services.job_description_import_drafts import (
    JobDescriptionImportDraftService,
)

DraftId = Annotated[UUID, Path(alias="id")]

router = APIRouter(
    prefix="/job-description-import-drafts",
    tags=["job-description-import-drafts"],
    dependencies=[Depends(csrf_protect)],
)


@router.post(
    "",
    response_model=JobDescriptionImportDraftResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_job_description_import_draft(
    payload: JobDescriptionImportDraftCreate,
    request: Request,
    current_user: User = Depends(require_current_user),
    draft_service: JobDescriptionImportDraftService = Depends(
        get_job_description_import_draft_service
    ),
) -> JobDescriptionImportDraftResponse:
    return await draft_service.create_draft(
        current_user,
        payload,
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )


@router.get("/{id}", response_model=JobDescriptionImportDraftResponse)
async def get_job_description_import_draft(
    draft_id: DraftId,
    current_user: User = Depends(require_current_user),
    draft_service: JobDescriptionImportDraftService = Depends(
        get_job_description_import_draft_service
    ),
) -> JobDescriptionImportDraftResponse:
    return await draft_service.get_draft(
        user_id=current_user.id,
        draft_id=draft_id,
    )


@router.post(
    "/{id}/apply",
    response_model=JobDescriptionImportDraftResponse,
)
async def apply_job_description_import_draft(
    draft_id: DraftId,
    current_user: User = Depends(require_current_user),
    draft_service: JobDescriptionImportDraftService = Depends(
        get_job_description_import_draft_service
    ),
) -> JobDescriptionImportDraftResponse:
    return await draft_service.apply_draft(current_user, draft_id)


__all__ = ["router"]
