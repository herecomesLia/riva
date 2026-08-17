from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from riva.db import get_db_session
from riva.services.competencies import CompetencyService


async def get_competency_service(
    session: AsyncSession = Depends(get_db_session),
) -> CompetencyService:
    return CompetencyService(session)


__all__ = ["get_competency_service"]
