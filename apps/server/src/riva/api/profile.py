from fastapi import APIRouter, Depends

from riva.core.auth import require_current_user
from riva.core.csrf import csrf_protect
from riva.core.profile import get_career_profile_service
from riva.models import User
from riva.schemas.profile import (
    CareerProfileGetResponse,
    CareerProfilePutRequest,
    CareerProfilePutResponse,
)
from riva.services.profile import CareerProfileService

router = APIRouter(
    prefix="/profile",
    tags=["profile"],
    dependencies=[Depends(csrf_protect)],
)


@router.get("", response_model=CareerProfileGetResponse)
async def get_profile(
    current_user: User = Depends(require_current_user),
    profile_service: CareerProfileService = Depends(get_career_profile_service),
) -> CareerProfileGetResponse:
    profile = await profile_service.get_profile(current_user)
    return CareerProfileGetResponse(profile=profile)


@router.put("", response_model=CareerProfilePutResponse)
async def replace_profile(
    payload: CareerProfilePutRequest,
    current_user: User = Depends(require_current_user),
    profile_service: CareerProfileService = Depends(get_career_profile_service),
) -> CareerProfilePutResponse:
    profile = await profile_service.replace_profile(current_user, payload)
    return CareerProfilePutResponse(profile=profile)
