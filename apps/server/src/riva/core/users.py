from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from riva.db import get_db_session
from riva.services.users import UserService


async def get_user_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> UserService:
    return UserService(session, request.app.state.settings)
