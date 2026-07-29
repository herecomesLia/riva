from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from riva.db import get_db_session
from riva.services.roles import TargetRoleService


async def get_target_role_service(
    session: AsyncSession = Depends(get_db_session),
) -> TargetRoleService:
    return TargetRoleService(session)
