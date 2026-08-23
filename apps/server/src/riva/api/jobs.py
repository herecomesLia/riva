from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request, status
from pydantic import TypeAdapter

from riva.api.dependencies import (
    require_csrf,
    require_current_user,
    require_job_description_import_service,
    require_llm_provider,
    require_target_role_service,
)
from riva.core.language import normalize_interaction_language
from riva.models import User
from riva.schemas.jd_import import (
    JobDescriptionImportDraftCreate,
    JobDescriptionImportDraftResponse,
)
from riva.schemas.roles import (
    ArchiveTargetRoleRequest,
    CreateTargetRoleRequest,
    DeleteTargetRoleVersion,
    RolesPageResponse,
    SaveJobDescriptionRequest,
    SetCurrentTargetRoleRequest,
    StartJobDescriptionParsingRequest,
    StartMatchingAnalysisRequest,
    UpdateJobDescriptionAnalysisModuleRequest,
    UpdatePreparationStatusRequest,
    UpdateTargetRoleRequest,
)
from riva.services.jobs.import_types import (
    JobDescriptionImportDraftCreate as DomainJobDescriptionImportDraftCreate,
)
from riva.services.jobs.jd_import import (
    JobDescriptionImportDraftService,
)
from riva.services.jobs.role_types import (
    ArchiveTargetRoleRequest as DomainArchiveTargetRoleRequest,
)
from riva.services.jobs.role_types import (
    CreateTargetRoleRequest as DomainCreateTargetRoleRequest,
)
from riva.services.jobs.role_types import (
    SaveJobDescriptionRequest as DomainSaveJobDescriptionRequest,
)
from riva.services.jobs.role_types import (
    SetCurrentTargetRoleRequest as DomainSetCurrentTargetRoleRequest,
)
from riva.services.jobs.role_types import (
    StartJobDescriptionParsingRequest as DomainStartJobDescriptionParsingRequest,
)
from riva.services.jobs.role_types import (
    StartMatchingAnalysisRequest as DomainStartMatchingAnalysisRequest,
)
from riva.services.jobs.role_types import (
    UpdateJobDescriptionAnalysisModuleRequest as DomainUpdateJobDescriptionAnalysisModuleRequest,
)
from riva.services.jobs.role_types import (
    UpdatePreparationStatusRequest as DomainUpdatePreparationStatusRequest,
)
from riva.services.jobs.role_types import (
    UpdateTargetRoleRequest as DomainUpdateTargetRoleRequest,
)
from riva.services.jobs.roles import TargetRoleService


def _to_domain(payload, model):
    return TypeAdapter(model).validate_python(
        payload.model_dump(mode="python", by_alias=False)
    )


def _to_api(model, value):
    data = (
        value.model_dump(mode="python", by_alias=False)
        if hasattr(value, "model_dump")
        else value
    )
    return model.model_validate(data)


# Job description import routes

DraftId = Annotated[UUID, Path(alias="id")]

jd_import_router = APIRouter(
    prefix="/job-description-import-drafts",
    tags=["job-description-import-drafts"],
    dependencies=[Depends(require_csrf)],
)


@jd_import_router.post(
    "",
    response_model=JobDescriptionImportDraftResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def create_job_description_import_draft(
    payload: JobDescriptionImportDraftCreate,
    request: Request,
    current_user: User = Depends(require_current_user),
    draft_service: JobDescriptionImportDraftService = Depends(
        require_job_description_import_service
    ),
) -> JobDescriptionImportDraftResponse:
    result = await draft_service.create_draft(
        current_user,
        _to_domain(payload, DomainJobDescriptionImportDraftCreate),
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )
    return _to_api(JobDescriptionImportDraftResponse, result)


@jd_import_router.get("/{id}", response_model=JobDescriptionImportDraftResponse)
async def get_job_description_import_draft(
    draft_id: DraftId,
    current_user: User = Depends(require_current_user),
    draft_service: JobDescriptionImportDraftService = Depends(
        require_job_description_import_service
    ),
) -> JobDescriptionImportDraftResponse:
    result = await draft_service.get_draft(
        user_id=current_user.id,
        draft_id=draft_id,
    )
    return _to_api(JobDescriptionImportDraftResponse, result)


@jd_import_router.post(
    "/{id}/apply",
    response_model=JobDescriptionImportDraftResponse,
)
async def apply_job_description_import_draft(
    draft_id: DraftId,
    current_user: User = Depends(require_current_user),
    draft_service: JobDescriptionImportDraftService = Depends(
        require_job_description_import_service
    ),
) -> JobDescriptionImportDraftResponse:
    result = await draft_service.apply_draft(current_user, draft_id)
    return _to_api(JobDescriptionImportDraftResponse, result)


# Target role routes

RoleId = Annotated[UUID, Path(alias="roleId")]
VersionQuery = Annotated[DeleteTargetRoleVersion, Query()]

roles_router = APIRouter(
    prefix="/roles",
    tags=["roles"],
    dependencies=[Depends(require_csrf)],
)


@roles_router.get("", response_model=RolesPageResponse)
async def get_roles(
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(require_target_role_service),
) -> RolesPageResponse:
    return _to_api(RolesPageResponse, await role_service.get_roles_page(current_user))


@roles_router.post(
    "",
    response_model=RolesPageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_role(
    payload: CreateTargetRoleRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(require_target_role_service),
) -> RolesPageResponse:
    result = await role_service.create_role(
        current_user,
        _to_domain(payload, DomainCreateTargetRoleRequest),
    )
    return _to_api(RolesPageResponse, result)


@roles_router.patch("/{roleId}", response_model=RolesPageResponse)
async def update_role(
    role_id: RoleId,
    payload: UpdateTargetRoleRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(require_target_role_service),
) -> RolesPageResponse:
    result = await role_service.update_role(
        current_user,
        role_id,
        _to_domain(payload, DomainUpdateTargetRoleRequest),
    )
    return _to_api(RolesPageResponse, result)


@roles_router.put("/{roleId}/current", response_model=RolesPageResponse)
async def set_current_role(
    role_id: RoleId,
    payload: SetCurrentTargetRoleRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(require_target_role_service),
) -> RolesPageResponse:
    result = await role_service.set_current_role(
        current_user,
        role_id,
        _to_domain(payload, DomainSetCurrentTargetRoleRequest),
    )
    return _to_api(RolesPageResponse, result)


@roles_router.patch(
    "/{roleId}/preparation-status",
    response_model=RolesPageResponse,
)
async def update_preparation_status(
    role_id: RoleId,
    payload: UpdatePreparationStatusRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(require_target_role_service),
) -> RolesPageResponse:
    result = await role_service.update_preparation_status(
        current_user,
        role_id,
        _to_domain(payload, DomainUpdatePreparationStatusRequest),
    )
    return _to_api(RolesPageResponse, result)


@roles_router.post("/{roleId}/archive", response_model=RolesPageResponse)
async def archive_role(
    role_id: RoleId,
    payload: ArchiveTargetRoleRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(require_target_role_service),
) -> RolesPageResponse:
    result = await role_service.archive_role(
        current_user,
        role_id,
        _to_domain(payload, DomainArchiveTargetRoleRequest),
    )
    return _to_api(RolesPageResponse, result)


@roles_router.delete("/{roleId}", response_model=RolesPageResponse)
async def delete_role(
    role_id: RoleId,
    version: VersionQuery,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(require_target_role_service),
) -> RolesPageResponse:
    return await role_service.delete_role(current_user, role_id, version)


@roles_router.put(
    "/{roleId}/job-description",
    response_model=RolesPageResponse,
)
async def save_job_description(
    role_id: RoleId,
    payload: SaveJobDescriptionRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(require_target_role_service),
) -> RolesPageResponse:
    result = await role_service.save_job_description(
        current_user,
        role_id,
        _to_domain(payload, DomainSaveJobDescriptionRequest),
    )
    return _to_api(RolesPageResponse, result)


@roles_router.patch(
    "/{roleId}/job-description/analysis",
    response_model=RolesPageResponse,
)
async def update_job_description_analysis_module(
    role_id: RoleId,
    payload: UpdateJobDescriptionAnalysisModuleRequest,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(require_target_role_service),
) -> RolesPageResponse:
    result = await role_service.update_job_description_analysis_module(
        current_user,
        role_id,
        _to_domain(payload, DomainUpdateJobDescriptionAnalysisModuleRequest),
    )
    return _to_api(RolesPageResponse, result)


@roles_router.post(
    "/{roleId}/job-description/parsing",
    response_model=RolesPageResponse,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def start_job_description_parsing(
    role_id: RoleId,
    payload: StartJobDescriptionParsingRequest,
    request: Request,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(require_target_role_service),
) -> RolesPageResponse:
    result = await role_service.start_job_description_parsing(
        current_user,
        role_id,
        _to_domain(payload, DomainStartJobDescriptionParsingRequest),
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )
    return _to_api(RolesPageResponse, result)


@roles_router.post(
    "/{roleId}/matching-analysis",
    response_model=RolesPageResponse,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def start_matching_analysis(
    role_id: RoleId,
    payload: StartMatchingAnalysisRequest,
    request: Request,
    current_user: User = Depends(require_current_user),
    role_service: TargetRoleService = Depends(require_target_role_service),
) -> RolesPageResponse:
    result = await role_service.start_matching_analysis(
        current_user,
        role_id,
        _to_domain(payload, DomainStartMatchingAnalysisRequest),
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )
    return _to_api(RolesPageResponse, result)


router = APIRouter()
router.include_router(jd_import_router)
router.include_router(roles_router)
