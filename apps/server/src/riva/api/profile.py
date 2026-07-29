from fastapi import APIRouter, Depends

from riva.core.auth import require_current_user
from riva.core.csrf import csrf_protect
from riva.core.profile import get_profile_service
from riva.models import Profile, User
from riva.schemas.profile import ProfileContent, ProfileResponse
from riva.services.profile import ProfileService

router = APIRouter(
    prefix="/profile",
    tags=["profile"],
    dependencies=[Depends(csrf_protect)],
)


@router.get("", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(require_current_user),
    profile_service: ProfileService = Depends(get_profile_service),
) -> Profile:
    return await profile_service.get_profile(current_user)


@router.put("", response_model=ProfileResponse)
async def replace_profile(
    payload: ProfileContent,
    current_user: User = Depends(require_current_user),
    profile_service: ProfileService = Depends(get_profile_service),
) -> Profile:
    content = payload.model_dump(mode="json", by_alias=False)
    return await profile_service.replace_profile(current_user, content)
