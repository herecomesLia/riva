from collections.abc import AsyncIterator
from typing import Annotated

import structlog
from fastapi import Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from riva.api.cookies import set_session_cookie
from riva.api.csrf import csrf_protect
from riva.api.errors import AuthRequiredError
from riva.db import Database
from riva.models import User
from riva.services.career_profiles import CareerProfileService
from riva.services.target_roles import TargetRoleService
from riva.services.users import UserService

csrf_guard = Depends(csrf_protect)


async def get_db_session(request: Request) -> AsyncIterator[AsyncSession]:
    database: Database = request.app.state.database
    async with database.sessionmaker() as session:
        yield session


DbSessionDep = Annotated[AsyncSession, Depends(get_db_session)]


async def get_user_service(
    request: Request,
    session: DbSessionDep,
) -> UserService:
    return UserService(session, request.app.state.settings)


UserServiceDep = Annotated[UserService, Depends(get_user_service)]


async def require_current_user(
    request: Request,
    response: Response,
    user_service: UserServiceDep,
) -> User:
    settings = request.app.state.settings
    token = request.cookies.get(settings.session.cookie_name)
    if token is None:
        raise AuthRequiredError()

    session_state = await user_service.get_current_session(token)
    user = session_state.user
    structlog.contextvars.bind_contextvars(user_id=str(user.id))
    if session_state.refreshed:
        set_session_cookie(response, settings, token)
    return user


CurrentUserDep = Annotated[User, Depends(require_current_user)]


async def get_career_profile_service(
    session: DbSessionDep,
) -> CareerProfileService:
    return CareerProfileService(session)


CareerProfileServiceDep = Annotated[
    CareerProfileService,
    Depends(get_career_profile_service),
]


async def get_target_role_service(
    session: DbSessionDep,
) -> TargetRoleService:
    return TargetRoleService(session)


TargetRoleServiceDep = Annotated[
    TargetRoleService,
    Depends(get_target_role_service),
]
