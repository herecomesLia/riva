from fastapi import APIRouter, Depends, Request, Response, status

from riva.api.cookies import delete_session_cookie, set_session_cookie
from riva.api.dependencies import (
    require_csrf,
    require_user_service,
)
from riva.models import User
from riva.schemas.auth import AuthCredentials, UserResponse
from riva.services.user import UserService

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    dependencies=[Depends(require_csrf)],
)


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: AuthCredentials,
    request: Request,
    response: Response,
    user_service: UserService = Depends(require_user_service),
) -> User:
    result = await user_service.register(payload.username, payload.password)
    set_session_cookie(response, request.app.state.settings, result.token)
    return result.user


@router.post("/login", response_model=UserResponse)
async def login(
    payload: AuthCredentials,
    request: Request,
    response: Response,
    user_service: UserService = Depends(require_user_service),
) -> User:
    settings = request.app.state.settings
    result = await user_service.login(
        payload.username,
        payload.password,
        current_token=request.cookies.get(settings.session_cookie_name),
    )
    set_session_cookie(response, settings, result.token)
    return result.user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    user_service: UserService = Depends(require_user_service),
) -> None:
    settings = request.app.state.settings
    await user_service.logout(request.cookies.get(settings.session_cookie_name))
    delete_session_cookie(response, settings)
