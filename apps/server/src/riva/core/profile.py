from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from riva.db import get_db_session
from riva.services.profile import CareerProfileService


async def get_career_profile_service(
    session: AsyncSession = Depends(get_db_session),
) -> CareerProfileService:
    return CareerProfileService(session)
