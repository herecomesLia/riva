from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from riva.db import get_db_session
from riva.services.interview_api import InterviewAPIService


async def get_interview_api_service(
    session: AsyncSession = Depends(get_db_session),
) -> InterviewAPIService:
    return InterviewAPIService(session)


__all__ = ["get_interview_api_service"]
