from fastapi import APIRouter, Request, Response, status

from riva.api.cookies import delete_session_cookie, set_session_cookie
from riva.api.deps import UserServiceDep, csrf_guard
from riva.api.errors import error_responses
from riva.models import User
from riva.schemas.auth import LoginCredentials, RegisterCredentials
from riva.schemas.users import UserResponse

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    dependencies=[csrf_guard],
    responses=error_responses(status.HTTP_403_FORBIDDEN),
)


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(
        status.HTTP_409_CONFLICT,
        status.HTTP_422_UNPROCESSABLE_CONTENT,
    ),
)
async def register(
    payload: RegisterCredentials,
    request: Request,
    response: Response,
    user_service: UserServiceDep,
) -> User:
    result = await user_service.register(payload.username, payload.password)
    set_session_cookie(response, request.app.state.settings, result.token)
    return result.user


@router.post(
    "/login",
    response_model=UserResponse,
    responses=error_responses(
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_422_UNPROCESSABLE_CONTENT,
    ),
)
async def login(
    payload: LoginCredentials,
    request: Request,
    response: Response,
    user_service: UserServiceDep,
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
    user_service: UserServiceDep,
) -> None:
    settings = request.app.state.settings
    await user_service.logout(request.cookies.get(settings.session_cookie_name))
    delete_session_cookie(response, settings)
