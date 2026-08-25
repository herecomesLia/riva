from fastapi import Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from riva.api.cookies import set_session_cookie
from riva.api.errors import APIError
from riva.db import get_db_session
from riva.models import User
from riva.services.users import UserService


async def require_user_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> UserService:
    return UserService(session, request.app.state.settings)


async def require_current_user(
    request: Request,
    response: Response,
    user_service: UserService = Depends(require_user_service),
) -> User:
    settings = request.app.state.settings
    token = request.cookies.get(settings.session_cookie_name)
    if token is None:
        raise APIError(status.HTTP_401_UNAUTHORIZED, "not_authenticated")

    session_state = await user_service.get_current_session(token)
    if session_state.refreshed:
        set_session_cookie(response, settings, session_state.token)
    return session_state.user
