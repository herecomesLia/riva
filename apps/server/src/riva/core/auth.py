from fastapi import Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.cookies import set_session_cookie
from riva.core.errors import APIError
from riva.db import get_db_session
from riva.models import User
from riva.services.auth import AuthService


async def get_auth_service(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> AuthService:
    return AuthService(session, request.app.state.settings)


async def require_current_user(
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
) -> User:
    settings = request.app.state.settings
    token = request.cookies.get(settings.session_cookie_name)
    if token is None:
        raise APIError(status.HTTP_401_UNAUTHORIZED, "not_authenticated")

    current_session = await auth_service.current_session(token)
    if current_session.refreshed:
        set_session_cookie(response, settings, current_session.token)
    return current_session.user
