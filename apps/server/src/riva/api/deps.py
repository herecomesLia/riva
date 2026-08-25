from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from riva.api.cookies import set_session_cookie
from riva.api.csrf import csrf_protect
from riva.api.errors import APIError
from riva.db import Database
from riva.models import User
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
    token = request.cookies.get(settings.session_cookie_name)
    if token is None:
        raise APIError(status.HTTP_401_UNAUTHORIZED, "not_authenticated")

    session_state = await user_service.get_current_session(token)
    if session_state.refreshed:
        set_session_cookie(response, settings, session_state.token)
    return session_state.user


CurrentUserDep = Annotated[User, Depends(require_current_user)]
