from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.config import Settings
from riva.core.llm import get_llm_provider
from riva.db import get_db_session
from riva.services.interview_api import InterviewAPIService


async def get_interview_api_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> InterviewAPIService:
    settings: Settings = request.app.state.settings
    return InterviewAPIService(
        session,
        llm_provider=get_llm_provider(request),
        llm_model=settings.llm_model,
    )


__all__ = ["get_interview_api_service"]
