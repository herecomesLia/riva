from fastapi import APIRouter, status
from fastapi.exceptions import RequestValidationError

from riva.api.deps import CurrentUserDep, UserServiceDep, csrf_guard
from riva.api.errors import (
    APINotImplementedError,
    AuthRequiredError,
    CsrfFailedError,
)
from riva.api.errors.openapi import error_responses
from riva.models import User
from riva.schemas.users import UpdateCurrentUserRequest, UserResponse
from riva.services.errors import InvalidSessionError, SessionExpiredError

router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[csrf_guard],
    responses=error_responses(
        AuthRequiredError,
        InvalidSessionError,
        SessionExpiredError,
        CsrfFailedError,
    ),
)


@router.get(
    "/me",
    operation_id="get-current-user",
    response_model=UserResponse,
)
async def get_current_user(current_user: CurrentUserDep) -> User:
    return current_user


@router.patch(
    "/me",
    operation_id="update-current-user",
    response_model=UserResponse,
    responses=error_responses(RequestValidationError),
)
async def update_current_user(
    payload: UpdateCurrentUserRequest,
    current_user: CurrentUserDep,
    user_service: UserServiceDep,
) -> User:
    changes = payload.model_dump(
        mode="json",
        by_alias=False,
        exclude_unset=True,
    )
    return await user_service.update(current_user, **changes)


@router.put(
    "/me/avatar",
    operation_id="set-user-avatar",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    responses=error_responses(APINotImplementedError),
)
async def set_current_user_avatar(current_user: CurrentUserDep) -> None:
    raise APINotImplementedError()


@router.delete(
    "/me/avatar",
    operation_id="delete-user-avatar",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    responses=error_responses(APINotImplementedError),
)
async def delete_current_user_avatar(current_user: CurrentUserDep) -> None:
    raise APINotImplementedError()
