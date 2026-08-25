from fastapi import APIRouter

from riva.api.deps import CurrentUserDep, UserServiceDep, csrf_guard
from riva.models import User
from riva.schemas.users import UserProfileUpdate, UserResponse

router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[csrf_guard],
)


@router.get("/me", response_model=UserResponse)
async def get_current_user(current_user: CurrentUserDep) -> User:
    return current_user


@router.patch("/me", response_model=UserResponse)
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
