from fastapi import Depends, Request, Response, status

from riva.core.cookies import set_session_cookie
from riva.core.errors import APIError
from riva.core.users import get_user_service
from riva.models import User
from riva.services.users import UserService


async def require_current_user(
    request: Request,
    response: Response,
    user_service: UserService = Depends(get_user_service),
) -> User:
    settings = request.app.state.settings
    token = request.cookies.get(settings.session_cookie_name)
    if token is None:
        raise APIError(status.HTTP_401_UNAUTHORIZED, "not_authenticated")

    session_state = await user_service.get_current_session(token)
    if session_state.refreshed:
        set_session_cookie(response, settings, session_state.token)
    return session_state.user
