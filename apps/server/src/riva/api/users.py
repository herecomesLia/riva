from fastapi import APIRouter, status

from riva.api.deps import CurrentUserDep, UserServiceDep, csrf_guard
from riva.api.errors import error_responses
from riva.models import User
from riva.schemas.users import UserProfileUpdate, UserResponse

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
async def update_current_user_profile(
    payload: UserProfileUpdate,
    current_user: CurrentUserDep,
    user_service: UserServiceDep,
) -> User:
    changes = payload.model_dump(
        mode="json",
        by_alias=False,
        exclude_unset=True,
    )
    return await user_service.update_profile(current_user, changes)
