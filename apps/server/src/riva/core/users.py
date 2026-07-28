from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from riva.db import get_db_session
from riva.services.users import UsersService


async def get_users_service(
    session: AsyncSession = Depends(get_db_session),
) -> UsersService:
    return UsersService(session)
