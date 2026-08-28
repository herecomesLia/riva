from fastapi import APIRouter, status

from riva.api.deps import CareerProfileServiceDep, CurrentUserDep, csrf_guard
from riva.api.errors.openapi import error_responses
from riva.models.career_profile import CareerProfile
from riva.schemas.career_profile import (
    CareerProfileResponse,
    CreateCareerProfileRequest,
    UpdateCareerProfileRequest,
)

router = APIRouter(
    prefix="/career-profile",
    tags=["career-profile"],
    dependencies=[csrf_guard],
    responses=error_responses(
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
    ),
)


@router.get(
    "",
    response_model=CareerProfileResponse,
    responses=error_responses(status.HTTP_404_NOT_FOUND),
)
async def get_career_profile(
    current_user: CurrentUserDep,
    career_profile_service: CareerProfileServiceDep,
) -> CareerProfile:
    return await career_profile_service.get(current_user)


@router.post(
    "",
    response_model=CareerProfileResponse,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(
        status.HTTP_409_CONFLICT,
        status.HTTP_422_UNPROCESSABLE_CONTENT,
    ),
)
async def create_career_profile(
    payload: CreateCareerProfileRequest,
    current_user: CurrentUserDep,
    career_profile_service: CareerProfileServiceDep,
) -> CareerProfile:
    return await career_profile_service.create(
        current_user,
        education=payload.education,
        work_experiences=payload.work_experiences,
        projects=payload.projects,
        skills=payload.skills,
    )


@router.patch(
    "",
    response_model=CareerProfileResponse,
    responses=error_responses(
        status.HTTP_404_NOT_FOUND,
        status.HTTP_422_UNPROCESSABLE_CONTENT,
    ),
)
async def update_career_profile(
    payload: UpdateCareerProfileRequest,
    current_user: CurrentUserDep,
    career_profile_service: CareerProfileServiceDep,
) -> CareerProfile:
    return await career_profile_service.update(
        current_user,
        education=payload.education,
        work_experiences=payload.work_experiences,
        projects=payload.projects,
        skills=payload.skills,
    )
