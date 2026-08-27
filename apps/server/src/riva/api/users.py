from fastapi import APIRouter, status

from riva.api.deps import CurrentUserDep, UserServiceDep, csrf_guard
from riva.api.errors import APINotImplementedError
from riva.api.errors.openapi import error_responses
from riva.models import User
from riva.schemas.users import UpdateCurrentUserRequest, UserResponse

router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[csrf_guard],
    responses=error_responses(
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
    ),
)


@router.get("/me", response_model=UserResponse)
async def get_current_user(current_user: CurrentUserDep) -> User:
    return current_user


@router.patch(
    "/me",
    response_model=UserResponse,
    responses=error_responses(status.HTTP_422_UNPROCESSABLE_CONTENT),
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
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    responses=error_responses(status.HTTP_501_NOT_IMPLEMENTED),
)
async def update_current_user_avatar(current_user: CurrentUserDep) -> None:
    raise APINotImplementedError()


@router.delete(
    "/me/avatar",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    responses=error_responses(status.HTTP_501_NOT_IMPLEMENTED),
)
async def delete_current_user_avatar(current_user: CurrentUserDep) -> None:
    raise APINotImplementedError()
