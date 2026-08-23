from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.llm import get_llm_provider
from riva.db import get_db_session
from riva.services.practice_api import PracticeAPIService


async def get_practice_api_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> PracticeAPIService:
    settings = request.app.state.settings
    return PracticeAPIService(
        session,
        llm_provider=get_llm_provider(request),
        llm_model=settings.llm_model,
    )


__all__ = ["get_practice_api_service"]
