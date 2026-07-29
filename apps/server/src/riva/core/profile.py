from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from riva.db import get_db_session
from riva.services.profile import ProfileService


async def get_profile_service(
    session: AsyncSession = Depends(get_db_session),
) -> ProfileService:
    return ProfileService(session)
