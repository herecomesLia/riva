from fastapi import APIRouter, Depends

from riva.api.dependencies import (
    require_career_profile_service,
    require_csrf,
    require_current_user,
)
from riva.models import User
from riva.schemas.profile import (
    CareerProfileGetResponse,
    CareerProfilePutRequest,
    CareerProfilePutResponse,
)
from riva.services.profile.profile import CareerProfileService
from riva.services.profile.types import (
    CareerProfilePutRequest as DomainCareerProfilePutRequest,
)


def _to_domain_profile(
    payload: CareerProfilePutRequest,
) -> DomainCareerProfilePutRequest:
    return DomainCareerProfilePutRequest.model_validate(
        payload.model_dump(mode="python", by_alias=False)
    )


router = APIRouter(
    prefix="/profile",
    tags=["profile"],
    dependencies=[Depends(require_csrf)],
)


@router.get("", response_model=CareerProfileGetResponse)
async def get_profile(
    current_user: User = Depends(require_current_user),
    profile_service: CareerProfileService = Depends(require_career_profile_service),
) -> CareerProfileGetResponse:
    profile = await profile_service.get_profile(current_user)
    return CareerProfileGetResponse.model_validate({"profile": profile})


@router.put("", response_model=CareerProfilePutResponse)
async def replace_profile(
    payload: CareerProfilePutRequest,
    current_user: User = Depends(require_current_user),
    profile_service: CareerProfileService = Depends(require_career_profile_service),
) -> CareerProfilePutResponse:
    profile = await profile_service.replace_profile(
        current_user,
        _to_domain_profile(payload),
    )
    return CareerProfilePutResponse.model_validate({"profile": profile})
