from fastapi import APIRouter, Depends

from riva.api.dependencies import (
    require_csrf,
    require_current_user,
    require_user_service,
)
from riva.models import User
from riva.schemas.users import UserAccountResponse, UserAccountUpdate
from riva.services.user import UserService

router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(require_csrf)],
)


@router.get("/me", response_model=UserAccountResponse)
async def get_current_user(
    current_user: User = Depends(require_current_user),
) -> User:
    return current_user


@router.patch("/me", response_model=UserAccountResponse)
async def update_current_user_profile(
    payload: UserAccountUpdate,
    current_user: User = Depends(require_current_user),
    user_service: UserService = Depends(require_user_service),
) -> User:
    changes = payload.model_dump(
        mode="json",
        by_alias=False,
        exclude_unset=True,
    )
    return await user_service.update_profile(current_user, changes)
