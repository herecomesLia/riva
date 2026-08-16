from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.config import Settings
from riva.db import get_db_session
from riva.services.interview_api import InterviewAPIService


async def get_interview_api_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> InterviewAPIService:
    settings: Settings = request.app.state.settings
    return InterviewAPIService(session, llm_model=settings.llm_model)


__all__ = ["get_interview_api_service"]
