from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.agent_execution import get_agent_executor
from riva.db import get_db_session
from riva.services.roles import TargetRoleService


async def get_target_role_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> TargetRoleService:
    settings = request.app.state.settings
    return TargetRoleService(
        session,
        llm_provider=settings.llm_provider,
        llm_model=settings.llm_model,
        agent_executor=get_agent_executor(request),
    )
