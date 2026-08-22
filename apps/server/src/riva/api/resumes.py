from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Path,
    Query,
    Request,
    UploadFile,
    status,
)

from riva.core.auth import require_current_user
from riva.core.csrf import csrf_protect
from riva.core.errors import APIError
from riva.core.language import normalize_interaction_language
from riva.core.resumes import (
    get_resume_document_service,
    get_resume_import_api_service,
    get_resume_parsing_lifecycle_service,
)
from riva.models import User
from riva.schemas.resume_documents import (
    ResumeDocumentResponse,
    ResumeDocumentsResponse,
)
from riva.schemas.resume_import_api import (
    ResumeImportApplicationRequest,
    ResumeImportApplicationResponse,
    ResumeImportDraftResponse,
)
from riva.services.resume_documents import ResumeDocumentService
from riva.services.resume_import_api import ResumeImportAPIService
from riva.services.resume_parsing_lifecycle import ResumeParsingLifecycleService

ResumeId = Annotated[UUID, Path(alias="resumeId")]
ResumeLimit = Annotated[int, Query(ge=1, le=100)]

router = APIRouter(
    prefix="/profile/resumes",
    tags=["profile"],
    dependencies=[Depends(csrf_protect)],
)


@router.post(
    "",
    response_model=ResumeDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_resume_document(
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    current_user: User = Depends(require_current_user),
    resume_service: ResumeDocumentService = Depends(get_resume_document_service),
) -> ResumeDocumentResponse:
    try:
        has_text = text is not None and bool(text.strip())
        if file is None and not has_text:
            raise APIError(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "resume_source_required",
            )
        if file is not None and has_text:
            raise APIError(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "resume_source_ambiguous",
            )
        if file is None:
            return await resume_service.create_pasted_text_document(
                current_user,
                text=text,
            )
        return await resume_service.create_file_document(
            current_user,
            file_obj=file.file,
            original_filename=file.filename or "",
            declared_media_type=file.content_type,
        )
    finally:
        if file is not None:
            await file.close()


@router.get("", response_model=ResumeDocumentsResponse)
async def list_resume_documents(
    limit: ResumeLimit = 20,
    current_user: User = Depends(require_current_user),
    resume_service: ResumeDocumentService = Depends(get_resume_document_service),
) -> ResumeDocumentsResponse:
    return await resume_service.list_documents(current_user, limit=limit)


@router.get(
    "/{resumeId}",
    response_model=ResumeDocumentResponse,
)
async def get_resume_document(
    resume_document_id: ResumeId,
    current_user: User = Depends(require_current_user),
    resume_service: ResumeDocumentService = Depends(get_resume_document_service),
) -> ResumeDocumentResponse:
    return await resume_service.get_document(current_user, resume_document_id)


@router.post(
    "/{resumeId}/parsing",
    response_model=ResumeImportDraftResponse,
)
async def start_resume_parsing(
    resume_document_id: ResumeId,
    request: Request,
    current_user: User = Depends(require_current_user),
    lifecycle_service: ResumeParsingLifecycleService = Depends(
        get_resume_parsing_lifecycle_service
    ),
) -> ResumeImportDraftResponse:
    return await lifecycle_service.start(
        user_id=current_user.id,
        resume_document_id=resume_document_id,
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )


@router.post(
    "/{resumeId}/parsing/retry",
    response_model=ResumeImportDraftResponse,
)
async def retry_resume_parsing(
    resume_document_id: ResumeId,
    request: Request,
    current_user: User = Depends(require_current_user),
    lifecycle_service: ResumeParsingLifecycleService = Depends(
        get_resume_parsing_lifecycle_service
    ),
) -> ResumeImportDraftResponse:
    return await lifecycle_service.retry(
        user_id=current_user.id,
        resume_document_id=resume_document_id,
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )


@router.get(
    "/{resumeId}/import-draft",
    response_model=ResumeImportDraftResponse,
)
async def get_resume_import_draft(
    resume_document_id: ResumeId,
    current_user: User = Depends(require_current_user),
    import_api_service: ResumeImportAPIService = Depends(get_resume_import_api_service),
) -> ResumeImportDraftResponse:
    return await import_api_service.get_draft(
        user_id=current_user.id,
        resume_document_id=resume_document_id,
    )


@router.post(
    "/{resumeId}/import-draft/apply",
    response_model=ResumeImportApplicationResponse,
)
async def apply_resume_import_draft(
    payload: ResumeImportApplicationRequest,
    resume_document_id: ResumeId,
    current_user: User = Depends(require_current_user),
    import_api_service: ResumeImportAPIService = Depends(get_resume_import_api_service),
) -> ResumeImportApplicationResponse:
    return await import_api_service.apply_draft(
        user_id=current_user.id,
        resume_document_id=resume_document_id,
        draft_version=payload.draft_version,
    )


__all__ = ["router"]
