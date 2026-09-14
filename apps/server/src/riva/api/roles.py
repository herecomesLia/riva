from uuid import UUID

from fastapi import APIRouter, Response, status
from fastapi.exceptions import RequestValidationError

from riva.api.csrf import csrf_guard
from riva.api.deps import (
    CurrentUserDep,
    JobDescriptionServiceDep,
    RoleServiceDep,
)
from riva.api.errors import AuthRequiredError, CsrfFailedError
from riva.api.errors.openapi import error_responses
from riva.models.role import Role
from riva.models.user import User
from riva.schemas.role import (
    CreateRoleRequest,
    JDTextExtractionRequest,
    RoleListResponse,
    RoleMatchingResponse,
    RoleResponse,
    SetActiveRoleRequest,
    UpdateJobDescriptionRequest,
    UpdateRoleRequest,
)
from riva.schemas.tasks import (
    TaskErrorBody,
    TaskFailureResponse,
    TaskStateResponse,
    TaskStatusResponse,
)
from riva.services.errors import (
    ConflictError,
    InvalidSessionError,
    NotFoundError,
    SessionExpiredError,
)
from riva.tasks import TaskErrorCode, TaskStatus

router = APIRouter(
    prefix="/roles",
    tags=["roles"],
    dependencies=[csrf_guard],
    responses=error_responses(
        AuthRequiredError,
        InvalidSessionError,
        SessionExpiredError,
        CsrfFailedError,
    ),
)


def _build_role_response(user: User, role: Role) -> RoleResponse:
    profile = user.career_profile
    matching = role.matching
    is_stale = matching.result is not None and (
        profile is None
        or matching.profile_updated_at != profile.updated_at
        or matching.jd_updated_at != role.jd.updated_at
    )
    return RoleResponse(
        **{
            field: getattr(role, field)
            for field in RoleResponse.model_fields
            if field != "matching"
        },
        matching=RoleMatchingResponse(
            result=matching.result,
            generated_at=matching.generated_at,
            is_stale=is_stale,
        ),
    )


@router.get(
    "",
    operation_id="list-roles",
    response_model=RoleListResponse,
)
async def list_roles(
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
) -> RoleListResponse:
    roles = await role_service.list(current_user)
    return RoleListResponse(
        roles=[_build_role_response(current_user, role) for role in roles],
        active_role_id=current_user.active_role_id,
    )


@router.post(
    "",
    operation_id="create-role",
    response_model=RoleResponse,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(RequestValidationError),
)
async def create_role(
    payload: CreateRoleRequest,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
) -> RoleResponse:
    role = await role_service.create(
        current_user,
        title=payload.title,
        company=payload.company,
        recruitment_track=payload.recruitment_track,
        location=payload.location,
    )
    return _build_role_response(current_user, role)


@router.patch(
    "/{role_id}",
    operation_id="update-role",
    response_model=RoleResponse,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def update_role(
    role_id: UUID,
    payload: UpdateRoleRequest,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
) -> RoleResponse:
    changes = {field: getattr(payload, field) for field in payload.model_fields_set}
    role = await role_service.update(current_user, role_id, **changes)
    return _build_role_response(current_user, role)


@router.delete(
    "/{role_id}",
    operation_id="delete-role",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def delete_role(
    role_id: UUID,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
) -> None:
    await role_service.delete(current_user, role_id)


@router.put(
    "/active",
    operation_id="set-active-role",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(
        NotFoundError,
        ConflictError,
        RequestValidationError,
    ),
)
async def set_active_role(
    payload: SetActiveRoleRequest,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
) -> None:
    await role_service.set_active(current_user, payload.role_id)


@router.post(
    "/{role_id}/archive",
    operation_id="archive-role",
    response_model=RoleResponse,
    responses=error_responses(
        NotFoundError,
        ConflictError,
        RequestValidationError,
    ),
)
async def archive_role(
    role_id: UUID,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
) -> RoleResponse:
    role = await role_service.archive(current_user, role_id)
    return _build_role_response(current_user, role)


@router.post(
    "/{role_id}/restore",
    operation_id="restore-role",
    response_model=RoleResponse,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def restore_role(
    role_id: UUID,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
) -> RoleResponse:
    role = await role_service.restore(current_user, role_id)
    return _build_role_response(current_user, role)


@router.patch(
    "/{role_id}/jd",
    operation_id="update-jd",
    response_model=RoleResponse,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def update_jd(
    role_id: UUID,
    payload: UpdateJobDescriptionRequest,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
    job_description_service: JobDescriptionServiceDep,
) -> RoleResponse:
    role = await role_service.get(current_user, role_id)
    changes = {field: getattr(payload, field) for field in payload.model_fields_set}
    role = await job_description_service.update(role, **changes)
    return _build_role_response(current_user, role)


@router.post(
    "/{role_id}/jd/extraction/text",
    operation_id="extract-jd-from-text",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def extract_jd_from_text(
    role_id: UUID,
    payload: JDTextExtractionRequest,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
    job_description_service: JobDescriptionServiceDep,
) -> Response:
    role = await role_service.get(current_user, role_id)
    await job_description_service.extract_text(role, text=payload.text)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.get(
    "/{role_id}/jd/extraction",
    operation_id="get-jd-extraction-state",
    response_model=TaskStateResponse,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def get_jd_extraction_state(
    role_id: UUID,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
    job_description_service: JobDescriptionServiceDep,
) -> TaskStateResponse:
    role = await role_service.get(current_user, role_id)
    state = await job_description_service.get_extraction_state(role)
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
    "/{role_id}/jd/extraction/retry",
    operation_id="retry-jd-extraction",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def retry_jd_extraction(
    role_id: UUID,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
    job_description_service: JobDescriptionServiceDep,
) -> Response:
    role = await role_service.get(current_user, role_id)
    await job_description_service.retry_extraction(role)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/{role_id}/jd/extraction/abort",
    operation_id="abort-jd-extraction",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def abort_jd_extraction(
    role_id: UUID,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
    job_description_service: JobDescriptionServiceDep,
) -> Response:
    role = await role_service.get(current_user, role_id)
    await job_description_service.abort_extraction(role)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/{role_id}/matching",
    operation_id="start-role-matching",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def start_role_matching(
    role_id: UUID,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
) -> Response:
    await role_service.start_matching_analysis(current_user, role_id)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.get(
    "/{role_id}/matching",
    operation_id="get-role-matching-state",
    response_model=TaskStateResponse,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def get_role_matching_state(
    role_id: UUID,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
) -> TaskStateResponse:
    state = await role_service.get_matching_analysis_state(current_user, role_id)
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
    "/{role_id}/matching/abort",
    operation_id="abort-role-matching",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def abort_role_matching(
    role_id: UUID,
    current_user: CurrentUserDep,
    role_service: RoleServiceDep,
) -> Response:
    await role_service.abort_matching_analysis(current_user, role_id)
    return Response(status_code=status.HTTP_202_ACCEPTED)
