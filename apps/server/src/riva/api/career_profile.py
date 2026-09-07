from fastapi import APIRouter, status
from fastapi.exceptions import RequestValidationError

from riva.api.csrf import csrf_guard
from riva.api.deps import CareerProfileServiceDep, CurrentUserDep
from riva.api.errors import AuthRequiredError, CsrfFailedError
from riva.api.errors.openapi import error_responses
from riva.models.career_profile import CareerProfile
from riva.schemas.career_profile import (
    CareerProfileResponse,
    CreateCareerProfileRequest,
    UpdateCareerProfileRequest,
)
from riva.services.errors import (
    ConflictError,
    DomainValidationError,
    InvalidSessionError,
    NotFoundError,
    SessionExpiredError,
)

router = APIRouter(
    prefix="/career-profile",
    tags=["career_profile"],
    dependencies=[csrf_guard],
    responses=error_responses(
        AuthRequiredError,
        InvalidSessionError,
        SessionExpiredError,
        CsrfFailedError,
    ),
)


@router.get(
    "",
    operation_id="get-career-profile",
    response_model=CareerProfileResponse,
    responses=error_responses(NotFoundError),
)
async def get_career_profile(
    current_user: CurrentUserDep,
    career_profile_service: CareerProfileServiceDep,
) -> CareerProfile:
    return await career_profile_service.get(current_user)


@router.post(
    "",
    operation_id="create-career-profile",
    response_model=CareerProfileResponse,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(
        ConflictError,
        DomainValidationError,
        RequestValidationError,
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
    operation_id="update-career-profile",
    response_model=CareerProfileResponse,
    responses=error_responses(
        NotFoundError,
        DomainValidationError,
        RequestValidationError,
    ),
)
async def update_career_profile(
    payload: UpdateCareerProfileRequest,
    current_user: CurrentUserDep,
    career_profile_service: CareerProfileServiceDep,
) -> CareerProfile:
    changes = {field: getattr(payload, field) for field in payload.model_fields_set}
    return await career_profile_service.update(current_user, **changes)
