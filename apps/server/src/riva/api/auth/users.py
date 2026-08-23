from fastapi import APIRouter, Depends
from riva.services.auth.users import UsersService

from riva.api.dependencies import csrf_protect, get_users_service, require_current_user
from riva.models import User
from riva.schemas.users import UserAccountResponse, UserAccountUpdate

router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(csrf_protect)],
)


@router.get("/me", response_model=UserAccountResponse)
async def get_current_user_account(
    current_user: User = Depends(require_current_user),
    users_service: UsersService = Depends(get_users_service),
) -> User:
    return users_service.get_account(current_user)


@router.patch("/me", response_model=UserAccountResponse)
async def update_current_user_account(
    payload: UserAccountUpdate,
    current_user: User = Depends(require_current_user),
    users_service: UsersService = Depends(get_users_service),
) -> User:
    changes = payload.model_dump(
        mode="json",
        by_alias=False,
        exclude_unset=True,
    )
    return await users_service.update_account(current_user, changes)
