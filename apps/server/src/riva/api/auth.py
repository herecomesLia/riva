import structlog
from fastapi import APIRouter, Request, Response, status
from fastapi.exceptions import RequestValidationError

from riva.api.cookies import delete_session_cookie, set_session_cookie
from riva.api.csrf import csrf_guard
from riva.api.deps import SettingsDep, UserServiceDep
from riva.api.errors import CsrfFailedError
from riva.api.errors.openapi import error_responses
from riva.models import User
from riva.schemas.auth import LoginCredentials, RegisterCredentials
from riva.schemas.user import UserResponse
from riva.services.errors import InvalidCredentialsError, UsernameTakenError

logger = structlog.get_logger("riva.auth")

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    dependencies=[csrf_guard],
    responses=error_responses(CsrfFailedError),
)


@router.post(
    "/register",
    operation_id="register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(
        UsernameTakenError,
        RequestValidationError,
    ),
)
async def register(
    payload: RegisterCredentials,
    response: Response,
    user_service: UserServiceDep,
    settings: SettingsDep,
) -> User:
    result = await user_service.register(payload.username, payload.password)
    set_session_cookie(response, result.token, settings)
    user_id = str(result.user.id)
    structlog.contextvars.bind_contextvars(user_id=user_id)
    logger.info("auth.register")
    return result.user


@router.post(
    "/login",
    operation_id="login",
    response_model=UserResponse,
    responses=error_responses(
        InvalidCredentialsError,
        RequestValidationError,
    ),
)
async def login(
    payload: LoginCredentials,
    request: Request,
    response: Response,
    user_service: UserServiceDep,
    settings: SettingsDep,
) -> User:
    result = await user_service.login(
        payload.username,
        payload.password,
        current_token=request.cookies.get(settings.session.cookie_name),
    )
    set_session_cookie(response, result.token, settings)
    user_id = str(result.user.id)
    structlog.contextvars.bind_contextvars(user_id=user_id)
    logger.info("auth.login")
    return result.user


@router.post(
    "/logout",
    operation_id="logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout(
    request: Request,
    response: Response,
    user_service: UserServiceDep,
    settings: SettingsDep,
) -> None:
    user_id = await user_service.logout(
        request.cookies.get(settings.session.cookie_name)
    )
    delete_session_cookie(response, settings)
    if user_id is not None:
        structlog.contextvars.bind_contextvars(user_id=str(user_id))
        logger.info("auth.logout")
