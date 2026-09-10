from uuid import UUID

from fastapi import APIRouter, status
from fastapi.exceptions import RequestValidationError

from riva.api.csrf import csrf_guard
from riva.api.deps import (
    CurrentUserDep,
    JobDescriptionServiceDep,
    TargetRoleServiceDep,
)
from riva.api.errors import AuthRequiredError, CsrfFailedError
from riva.api.errors.openapi import error_responses
from riva.models.target_role import TargetRole
from riva.schemas.target_role import (
    CreateTargetRoleRequest,
    SetActiveTargetRoleRequest,
    TargetRoleListResponse,
    TargetRoleResponse,
    UpdateJobDescriptionRequest,
    UpdateTargetRoleRequest,
)
from riva.services.errors import (
    ConflictError,
    InvalidSessionError,
    NotFoundError,
    SessionExpiredError,
)

router = APIRouter(
    prefix="/target-roles",
    tags=["target_roles"],
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
    operation_id="list-target-roles",
    response_model=TargetRoleListResponse,
)
async def list_target_roles(
    current_user: CurrentUserDep,
    target_role_service: TargetRoleServiceDep,
) -> TargetRoleListResponse:
    roles = await target_role_service.list(current_user)
    return TargetRoleListResponse(
        target_roles=roles,
        active_target_role_id=current_user.active_target_role_id,
    )


@router.post(
    "",
    operation_id="create-target-role",
    response_model=TargetRoleResponse,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(RequestValidationError),
)
async def create_target_role(
    payload: CreateTargetRoleRequest,
    current_user: CurrentUserDep,
    target_role_service: TargetRoleServiceDep,
) -> TargetRole:
    return await target_role_service.create(
        current_user,
        title=payload.title,
        company=payload.company,
        recruitment_track=payload.recruitment_track,
        location=payload.location,
    )


@router.patch(
    "/{target_role_id}",
    operation_id="update-target-role",
    response_model=TargetRoleResponse,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def update_target_role(
    target_role_id: UUID,
    payload: UpdateTargetRoleRequest,
    current_user: CurrentUserDep,
    target_role_service: TargetRoleServiceDep,
) -> TargetRole:
    changes = {field: getattr(payload, field) for field in payload.model_fields_set}
    return await target_role_service.update(current_user, target_role_id, **changes)


@router.delete(
    "/{target_role_id}",
    operation_id="delete-target-role",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def delete_target_role(
    target_role_id: UUID,
    current_user: CurrentUserDep,
    target_role_service: TargetRoleServiceDep,
) -> None:
    await target_role_service.delete(current_user, target_role_id)


@router.put(
    "/active",
    operation_id="set-active-target-role",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(
        NotFoundError,
        ConflictError,
        RequestValidationError,
    ),
)
async def set_active_target_role(
    payload: SetActiveTargetRoleRequest,
    current_user: CurrentUserDep,
    target_role_service: TargetRoleServiceDep,
) -> None:
    await target_role_service.set_active(current_user, payload.target_role_id)


@router.post(
    "/{target_role_id}/archive",
    operation_id="archive-target-role",
    response_model=TargetRoleResponse,
    responses=error_responses(
        NotFoundError,
        ConflictError,
        RequestValidationError,
    ),
)
async def archive_target_role(
    target_role_id: UUID,
    current_user: CurrentUserDep,
    target_role_service: TargetRoleServiceDep,
) -> TargetRole:
    return await target_role_service.archive(current_user, target_role_id)


@router.post(
    "/{target_role_id}/restore",
    operation_id="restore-target-role",
    response_model=TargetRoleResponse,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def restore_target_role(
    target_role_id: UUID,
    current_user: CurrentUserDep,
    target_role_service: TargetRoleServiceDep,
) -> TargetRole:
    return await target_role_service.restore(current_user, target_role_id)


@router.patch(
    "/{target_role_id}/jd",
    operation_id="update-target-role-jd",
    response_model=TargetRoleResponse,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def update_target_role_jd(
    target_role_id: UUID,
    payload: UpdateJobDescriptionRequest,
    current_user: CurrentUserDep,
    target_role_service: TargetRoleServiceDep,
    job_description_service: JobDescriptionServiceDep,
) -> TargetRole:
    role = await target_role_service.get(current_user, target_role_id)
    changes = {field: getattr(payload, field) for field in payload.model_fields_set}
    return await job_description_service.update(role, **changes)
