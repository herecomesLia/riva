from fastapi import APIRouter, Depends, Request, Response, status
from riva.services.auth.auth import AuthService

from riva.api.cookies import delete_session_cookie, set_session_cookie
from riva.api.dependencies import csrf_protect, get_auth_service, require_current_user
from riva.models import User
from riva.schemas.auth import AuthCredentials, UserResponse

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    dependencies=[Depends(csrf_protect)],
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
    auth_service: AuthService = Depends(get_auth_service),
) -> User:
    result = await auth_service.register(payload.username, payload.password)
    set_session_cookie(response, request.app.state.settings, result.token)
    return result.user


@router.post("/login", response_model=UserResponse)
async def login(
    payload: AuthCredentials,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
) -> User:
    settings = request.app.state.settings
    result = await auth_service.login(
        payload.username,
        payload.password,
        current_token=request.cookies.get(settings.session_cookie_name),
    )
    set_session_cookie(response, settings, result.token)
    return result.user


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(require_current_user)) -> User:
    return current_user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
) -> None:
    settings = request.app.state.settings
    await auth_service.logout(request.cookies.get(settings.session_cookie_name))
    delete_session_cookie(response, settings)
