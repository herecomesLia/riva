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
from pydantic import TypeAdapter

from riva.api.dependencies import (
    require_csrf,
    require_current_user,
    require_llm_provider,
    require_resume_document_service,
    require_resume_import_service,
    require_resume_parsing_service,
)
from riva.api.errors import APIError
from riva.core.language import InteractionLanguage, normalize_interaction_language
from riva.models import User
from riva.schemas.resume_import import (
    ResumeImportApplicationRequest,
    ResumeImportApplicationResponse,
    ResumeImportDraftResponse,
)
from riva.schemas.resumes import (
    ResumeDocumentResponse,
    ResumeDocumentsResponse,
)
from riva.services.resumes.documents import ResumeDocumentService
from riva.services.resumes.import_service import ResumeImportService
from riva.services.resumes.parsing import ResumeParsingService

ResumeId = Annotated[UUID, Path(alias="resumeId")]
ResumeLimit = Annotated[int, Query(ge=1, le=100)]


def _api_model(model, value):
    data = (
        value.model_dump(mode="python", by_alias=False)
        if hasattr(value, "model_dump")
        else value
    )
    return model.model_validate(data)


def _api_union(annotation, value):
    data = (
        value.model_dump(mode="python", by_alias=False)
        if hasattr(value, "model_dump")
        else value
    )
    return TypeAdapter(annotation).validate_python(data)


router = APIRouter(
    prefix="/profile/resumes",
    tags=["profile"],
    dependencies=[Depends(require_csrf)],
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
    resume_service: ResumeDocumentService = Depends(require_resume_document_service),
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
            result = await resume_service.create_pasted_text_document(
                current_user,
                text=text,
            )
            return _api_union(ResumeDocumentResponse, result)
        result = await resume_service.create_file_document(
            current_user,
            file_obj=file.file,
            original_filename=file.filename or "",
            declared_media_type=file.content_type,
        )
        return _api_union(ResumeDocumentResponse, result)
    finally:
        if file is not None:
            await file.close()


@router.get("", response_model=ResumeDocumentsResponse)
async def list_resume_documents(
    limit: ResumeLimit = 20,
    current_user: User = Depends(require_current_user),
    resume_service: ResumeDocumentService = Depends(require_resume_document_service),
) -> ResumeDocumentsResponse:
    result = await resume_service.list_documents(current_user, limit=limit)
    return _api_model(ResumeDocumentsResponse, result)


@router.get(
    "/{resumeId}",
    response_model=ResumeDocumentResponse,
)
async def get_resume_document(
    resume_document_id: ResumeId,
    current_user: User = Depends(require_current_user),
    resume_service: ResumeDocumentService = Depends(require_resume_document_service),
) -> ResumeDocumentResponse:
    result = await resume_service.get_document(current_user, resume_document_id)
    return _api_union(ResumeDocumentResponse, result)


@router.post(
    "/{resumeId}/parsing",
    response_model=ResumeImportDraftResponse,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def start_resume_parsing(
    resume_document_id: ResumeId,
    request: Request,
    current_user: User = Depends(require_current_user),
    parsing_service: ResumeParsingService = Depends(require_resume_parsing_service),
    import_api_service: ResumeImportService = Depends(require_resume_import_service),
) -> ResumeImportDraftResponse:
    return await _parse_resume_and_build_draft(
        parsing_service,
        import_api_service,
        current_user.id,
        resume_document_id,
        normalize_interaction_language(request.headers.get("accept-language")),
    )


@router.post(
    "/{resumeId}/parsing/retry",
    response_model=ResumeImportDraftResponse,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def retry_resume_parsing(
    resume_document_id: ResumeId,
    request: Request,
    current_user: User = Depends(require_current_user),
    parsing_service: ResumeParsingService = Depends(require_resume_parsing_service),
    import_api_service: ResumeImportService = Depends(require_resume_import_service),
) -> ResumeImportDraftResponse:
    return await _parse_resume_and_build_draft(
        parsing_service,
        import_api_service,
        current_user.id,
        resume_document_id,
        normalize_interaction_language(request.headers.get("accept-language")),
        retry=True,
    )


@router.get(
    "/{resumeId}/import-draft",
    response_model=ResumeImportDraftResponse,
)
async def get_resume_import_draft(
    resume_document_id: ResumeId,
    current_user: User = Depends(require_current_user),
    import_api_service: ResumeImportService = Depends(require_resume_import_service),
) -> ResumeImportDraftResponse:
    result = await import_api_service.get_draft(
        user_id=current_user.id,
        resume_document_id=resume_document_id,
    )
    return _api_model(ResumeImportDraftResponse, result)


@router.post(
    "/{resumeId}/import-draft/apply",
    response_model=ResumeImportApplicationResponse,
)
async def apply_resume_import_draft(
    payload: ResumeImportApplicationRequest,
    resume_document_id: ResumeId,
    current_user: User = Depends(require_current_user),
    import_api_service: ResumeImportService = Depends(require_resume_import_service),
) -> ResumeImportApplicationResponse:
    result = await import_api_service.apply_draft(
        user_id=current_user.id,
        resume_document_id=resume_document_id,
        draft_version=payload.draft_version,
    )
    return _api_model(ResumeImportApplicationResponse, result)


async def _parse_resume_and_build_draft(
    parsing_service: ResumeParsingService,
    import_api_service: ResumeImportService,
    user_id: UUID,
    resume_document_id: UUID,
    interaction_language: InteractionLanguage,
    *,
    retry: bool = False,
) -> ResumeImportDraftResponse:
    await parsing_service.parse(
        user_id=user_id,
        resume_document_id=resume_document_id,
        interaction_language=interaction_language,
        retry=retry,
    )
    result = await import_api_service.get_draft(
        user_id=user_id,
        resume_document_id=resume_document_id,
    )
    return _api_model(ResumeImportDraftResponse, result)
