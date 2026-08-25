from fastapi import APIRouter, Depends

from riva.api.csrf import csrf_protect
from riva.api.deps import require_current_user, require_user_service
from riva.models import User
from riva.schemas.users import UserProfileUpdate, UserResponse
from riva.services.users import UserService

router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(csrf_protect)],
)


@router.get("/me", response_model=UserResponse)
async def get_current_user(current_user: User = Depends(require_current_user)) -> User:
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_current_user_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(require_current_user),
    user_service: UserService = Depends(require_user_service),
) -> User:
    changes = payload.model_dump(
        mode="json",
        by_alias=False,
        exclude_unset=True,
    )
    return await user_service.update_profile(current_user, changes)
