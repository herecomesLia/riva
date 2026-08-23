from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.llm import get_llm_provider
from riva.db import get_db_session
from riva.services.job_description_import_drafts import (
    JobDescriptionImportDraftService,
)


async def get_job_description_import_draft_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JobDescriptionImportDraftService:
    settings = request.app.state.settings
    return JobDescriptionImportDraftService(
        session,
        llm_provider=get_llm_provider(request),
        llm_model=settings.llm_model,
    )


__all__ = ["get_job_description_import_draft_service"]
