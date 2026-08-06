from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from riva.db import get_db_session
from riva.resumes import ResumeTextExtractor
from riva.services.resume_documents import ResumeDocumentService
from riva.services.resume_parsing_lifecycle import ResumeParsingLifecycleService
from riva.storage import ResumeObjectStorage


def get_resume_object_storage(request: Request) -> ResumeObjectStorage:
    return request.app.state.resume_storage


def get_resume_text_extractor(request: Request) -> ResumeTextExtractor:
    return request.app.state.resume_text_extractor


async def get_resume_document_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    storage: ResumeObjectStorage = Depends(get_resume_object_storage),
    extractor: ResumeTextExtractor = Depends(get_resume_text_extractor),
) -> ResumeDocumentService:
    settings = request.app.state.settings
    return ResumeDocumentService(
        session=session,
        storage=storage,
        extractor=extractor,
        max_upload_bytes=settings.resume_max_upload_bytes,
        max_extracted_characters=settings.resume_max_extracted_characters,
    )


async def get_resume_parsing_lifecycle_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> ResumeParsingLifecycleService:
    settings = request.app.state.settings
    return ResumeParsingLifecycleService(
        session=session,
        llm_provider=settings.llm_provider,
        llm_model=settings.llm_model,
    )


__all__ = [
    "get_resume_document_service",
    "get_resume_object_storage",
    "get_resume_parsing_lifecycle_service",
    "get_resume_text_extractor",
]
