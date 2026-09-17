from fastapi import APIRouter, Response, status
from fastapi.exceptions import RequestValidationError

from riva.api.csrf import csrf_guard
from riva.api.deps import CareerProfileServiceDep, CurrentUserDep
from riva.api.errors import AuthRequiredError, CsrfFailedError
from riva.api.errors.openapi import error_responses
from riva.models.career_profile import CareerProfile
from riva.schemas.career_profile import (
    CareerProfileResponse,
    CareerProfileTextExtractionRequest,
    CreateCareerProfileRequest,
    UpdateCareerProfileRequest,
)
from riva.schemas.task import (
    TaskErrorBody,
    TaskFailureResponse,
    TaskStateResponse,
    TaskStatusResponse,
)
from riva.services.errors import (
    ConflictError,
    DomainValidationError,
    InvalidSessionError,
    NotFoundError,
    SessionExpiredError,
)
from riva.tasks import TaskErrorCode, TaskStatus

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
        NotFoundError,
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
        ConflictError,
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


@router.post(
    "/extraction/text",
    operation_id="extract-career-profile-from-text",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def extract_career_profile_from_text(
    payload: CareerProfileTextExtractionRequest,
    current_user: CurrentUserDep,
    career_profile_service: CareerProfileServiceDep,
) -> Response:
    await career_profile_service.extract_text(current_user, text=payload.text)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.get(
    "/extraction",
    operation_id="get-career-profile-extraction-state",
    response_model=TaskStateResponse,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def get_career_profile_extraction_state(
    current_user: CurrentUserDep,
    career_profile_service: CareerProfileServiceDep,
) -> TaskStateResponse:
    state = await career_profile_service.get_extraction_state(current_user)
    if state.status is TaskStatus.FAILED:
        error = TaskErrorBody(
            code=state.error_code,
            message={
                TaskErrorCode.SERVICE_UNAVAILABLE: "Service is temporarily unavailable. Please try again later.",
                TaskErrorCode.INVALID_OUTPUT: "Unable to complete the task.",
                TaskErrorCode.LLM_UNAVAILABLE: "LLM service is temporarily unavailable.",
                TaskErrorCode.INTERNAL_ERROR: "Unable to complete the task.",
            }[state.error_code],
        )
        return TaskFailureResponse(status=state.status, error=error)
    return TaskStatusResponse(status=state.status, error=None)


@router.post(
    "/extraction/retry",
    operation_id="retry-career-profile-extraction",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def retry_career_profile_extraction(
    current_user: CurrentUserDep,
    career_profile_service: CareerProfileServiceDep,
) -> Response:
    await career_profile_service.retry_extraction(current_user)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/extraction/abort",
    operation_id="abort-career-profile-extraction",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def abort_career_profile_extraction(
    current_user: CurrentUserDep,
    career_profile_service: CareerProfileServiceDep,
) -> Response:
    await career_profile_service.abort_extraction(current_user)
    return Response(status_code=status.HTTP_202_ACCEPTED)
