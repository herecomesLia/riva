from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request, status

from riva.core.auth import require_current_user
from riva.core.csrf import csrf_protect
from riva.core.language import normalize_interaction_language
from riva.core.roles import get_target_role_service
from riva.models import User
from riva.schemas.roles import (
    ArchiveTargetRoleRequest,
    CreateTargetRoleRequest,
    DeleteTargetRoleVersion,
    JobDescriptionParsingStatusQuery,
    MatchingAnalysisStatusQuery,
    RolesPageResponse,
    SaveJobDescriptionRequest,
    SetCurrentTargetRoleRequest,
    StartJobDescriptionParsingRequest,
    StartMatchingAnalysisRequest,
    TargetRoleResponse,
    UpdateJobDescriptionAnalysisModuleRequest,
    UpdatePreparationStatusRequest,
    UpdateTargetRoleRequest,
)
from riva.services.roles import TargetRoleService

RoleId = Annotated[UUID, Path(alias="roleId")]
VersionQuery = Annotated[DeleteTargetRoleVersion, Query()]
ParsingStatusQuery = Annotated[JobDescriptionParsingStatusQuery, Query()]
MatchingStatusQuery = Annotated[MatchingAnalysisStatusQuery, Query()]

router = APIRouter(
    prefix="/roles",
    tags=["roles"],
    dependencies=[Depends(csrf_protect)],
)


@router.get("", response_model=RolesPageResponse)
async def get_roles(
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(get_target_role_service),
) -> RolesPageResponse:
    return await role_service.get_roles_page(current_user)


@router.post(
    "",
    response_model=RolesPageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_role(
    payload: CreateTargetRoleRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(get_target_role_service),
) -> RolesPageResponse:
    return await role_service.create_role(current_user, payload)


@router.patch("/{roleId}", response_model=RolesPageResponse)
async def update_role(
    role_id: RoleId,
    payload: UpdateTargetRoleRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(get_target_role_service),
) -> RolesPageResponse:
    return await role_service.update_role(current_user, role_id, payload)


@router.put("/{roleId}/current", response_model=RolesPageResponse)
async def set_current_role(
    role_id: RoleId,
    payload: SetCurrentTargetRoleRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(get_target_role_service),
) -> RolesPageResponse:
    return await role_service.set_current_role(current_user, role_id, payload)


@router.patch(
    "/{roleId}/preparation-status",
    response_model=RolesPageResponse,
)
async def update_preparation_status(
    role_id: RoleId,
    payload: UpdatePreparationStatusRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(get_target_role_service),
) -> RolesPageResponse:
    return await role_service.update_preparation_status(
        current_user,
        role_id,
        payload,
    )


@router.post("/{roleId}/archive", response_model=RolesPageResponse)
async def archive_role(
    role_id: RoleId,
    payload: ArchiveTargetRoleRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(get_target_role_service),
) -> RolesPageResponse:
    return await role_service.archive_role(current_user, role_id, payload)


@router.delete("/{roleId}", response_model=RolesPageResponse)
async def delete_role(
    role_id: RoleId,
    version: VersionQuery,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(get_target_role_service),
) -> RolesPageResponse:
    return await role_service.delete_role(current_user, role_id, version)


@router.put(
    "/{roleId}/job-description",
    response_model=RolesPageResponse,
)
async def save_job_description(
    role_id: RoleId,
    payload: SaveJobDescriptionRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(get_target_role_service),
) -> RolesPageResponse:
    return await role_service.save_job_description(
        current_user,
        role_id,
        payload,
    )


@router.patch(
    "/{roleId}/job-description/analysis",
    response_model=RolesPageResponse,
)
async def update_job_description_analysis_module(
    role_id: RoleId,
    payload: UpdateJobDescriptionAnalysisModuleRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(get_target_role_service),
) -> RolesPageResponse:
    return await role_service.update_job_description_analysis_module(
        current_user,
        role_id,
        payload,
    )


@router.post(
    "/{roleId}/job-description/parsing",
    response_model=RolesPageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_job_description_parsing(
    role_id: RoleId,
    payload: StartJobDescriptionParsingRequest,
    request: Request,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(get_target_role_service),
) -> RolesPageResponse:
    return await role_service.start_job_description_parsing(
        current_user,
        role_id,
        payload,
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )


@router.get(
    "/{roleId}/job-description/parsing",
    response_model=TargetRoleResponse,
)
async def get_job_description_parsing_status(
    role_id: RoleId,
    query: ParsingStatusQuery,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(get_target_role_service),
) -> TargetRoleResponse:
    return await role_service.get_job_description_parsing_status(
        current_user,
        role_id,
        query,
    )


@router.post(
    "/{roleId}/matching-analysis",
    response_model=RolesPageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_matching_analysis(
    role_id: RoleId,
    payload: StartMatchingAnalysisRequest,
    request: Request,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(get_target_role_service),
) -> RolesPageResponse:
    return await role_service.start_matching_analysis(
        current_user,
        role_id,
        payload,
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )


@router.get(
    "/{roleId}/matching-analysis",
    response_model=TargetRoleResponse,
)
async def get_matching_analysis_status(
    role_id: RoleId,
    query: MatchingStatusQuery,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(get_target_role_service),
) -> TargetRoleResponse:
    return await role_service.get_matching_analysis_status(
        current_user,
        role_id,
        query,
    )
