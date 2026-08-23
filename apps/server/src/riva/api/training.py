from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request, status

from riva.api.dependencies import (
    require_competency_service,
    require_csrf,
    require_current_user,
    require_llm_provider,
    require_training_planning_service,
    require_training_record_reference_answer_service,
    require_training_record_service,
)
from riva.api.errors import APIError
from riva.core.language import normalize_interaction_language
from riva.models import User
from riva.schemas.competencies import CompetencyListResponse
from riva.schemas.training_planning import (
    EnsureCurrentTrainingPlanningRequest,
    StartTrainingPlanningRequest,
    TrainingPlanningResponse,
)
from riva.schemas.training_records import (
    MockInterviewTrainingRecordDetailResponse,
    TargetedPracticeReferenceAnswerRequest,
    TargetedPracticeTrainingRecordDetailResponse,
    TrainingRecordKind,
    TrainingRecordReferenceAnswerResponse,
    TrainingRecordsOverviewResponse,
    TrainingRecordsPageResponse,
    TrainingRecordStatus,
)
from riva.services.training.catalog import canonical_competency_sort_key
from riva.services.training.competencies import CompetencyService
from riva.services.training.planning import (
    TRAINING_PLANNING_STATE_CONFLICT,
    TRAINING_PLANNING_TARGET_NOT_FOUND,
    TRAINING_PLANNING_TARGET_UNAVAILABLE,
    TRAINING_PLANNING_UNAVAILABLE,
    TrainingPlanningService,
    TrainingPlanningStateError,
)
from riva.services.training.planning_types import (
    EnsureCurrentTrainingPlanningRequest as DomainEnsureCurrentTrainingPlanningRequest,
)
from riva.services.training.planning_types import (
    StartTrainingPlanningRequest as DomainStartTrainingPlanningRequest,
)
from riva.services.training.record_answers import (
    REFERENCE_ANSWER_GENERATION_UNAVAILABLE,
    TRAINING_RECORD_FOLLOW_UP_NOT_FOUND,
    TRAINING_RECORD_QUESTION_NOT_FOUND,
    TrainingRecordReferenceAnswerService,
    TrainingRecordReferenceAnswerStateError,
)
from riva.services.training.record_answers import (
    TRAINING_RECORD_NOT_FOUND as REFERENCE_ANSWER_RECORD_NOT_FOUND,
)
from riva.services.training.records import (
    TRAINING_RECORD_NOT_FOUND,
    TRAINING_RECORD_STATE_CONFLICT,
    TrainingRecordService,
    TrainingRecordStateError,
)
from riva.services.training.types import (
    TargetedPracticeReferenceAnswerRequest as DomainTargetedPracticeReferenceAnswerRequest,
)

# Competency routes

competencies_router = APIRouter(prefix="/competencies", tags=["competencies"])


@competencies_router.get(
    "",
    response_model=CompetencyListResponse,
    status_code=status.HTTP_200_OK,
)
async def list_competencies(
    current_user: User = Depends(require_current_user),
    competency_service: CompetencyService = Depends(require_competency_service),
) -> CompetencyListResponse:
    competencies = await competency_service.list_competencies(current_user.id)
    competencies.sort(
        key=lambda competency: canonical_competency_sort_key(competency.competency_key)
    )
    return CompetencyListResponse(items=competencies)


# Training record routes

TrainingRecordId = Annotated[UUID, Path(alias="recordId")]
TrainingRecordPage = Annotated[int, Query(ge=1)]
TrainingRecordPageSize = Annotated[
    int,
    Query(alias="pageSize", ge=1, le=100),
]

records_router = APIRouter(
    prefix="/training-records",
    tags=["training-records"],
    dependencies=[Depends(require_csrf)],
)


def training_record_reference_answer_state_api_error(
    error: TrainingRecordReferenceAnswerStateError,
) -> APIError:
    if error.code in {
        REFERENCE_ANSWER_RECORD_NOT_FOUND,
        TRAINING_RECORD_QUESTION_NOT_FOUND,
        TRAINING_RECORD_FOLLOW_UP_NOT_FOUND,
    }:
        return APIError(status.HTTP_404_NOT_FOUND, error.code)
    if error.code == REFERENCE_ANSWER_GENERATION_UNAVAILABLE:
        return APIError(status.HTTP_503_SERVICE_UNAVAILABLE, error.code)
    return APIError(status.HTTP_409_CONFLICT, error.code)


@records_router.get(
    "",
    response_model=TrainingRecordsPageResponse,
    status_code=status.HTTP_200_OK,
)
async def list_training_records(
    kinds: Annotated[list[TrainingRecordKind] | None, Query()] = None,
    statuses: Annotated[list[TrainingRecordStatus] | None, Query()] = None,
    target_role_id: Annotated[UUID | None, Query(alias="targetRoleId")] = None,
    started_at_from: Annotated[
        datetime | None,
        Query(alias="startedAtFrom"),
    ] = None,
    started_at_to: Annotated[
        datetime | None,
        Query(alias="startedAtTo"),
    ] = None,
    page: TrainingRecordPage = 1,
    page_size: TrainingRecordPageSize = 20,
    current_user: User = Depends(require_current_user),
    training_record_service: TrainingRecordService = Depends(
        require_training_record_service
    ),
) -> TrainingRecordsPageResponse:
    return await training_record_service.list_training_records(
        user_id=current_user.id,
        kinds=kinds,
        statuses=statuses,
        target_role_id=target_role_id,
        started_at_from=started_at_from,
        started_at_to=started_at_to,
        page=page,
        page_size=page_size,
    )


@records_router.get(
    "/overview",
    response_model=TrainingRecordsOverviewResponse,
    status_code=status.HTTP_200_OK,
)
async def get_training_records_overview(
    current_user: User = Depends(require_current_user),
    training_record_service: TrainingRecordService = Depends(
        require_training_record_service
    ),
) -> TrainingRecordsOverviewResponse:
    return await training_record_service.get_training_records_overview(
        user_id=current_user.id,
    )


@records_router.post(
    "/practice/{recordId}/reference-answer",
    response_model=TrainingRecordReferenceAnswerResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def request_training_record_reference_answer(
    record_id: TrainingRecordId,
    payload: TargetedPracticeReferenceAnswerRequest,
    current_user: User = Depends(require_current_user),
    reference_answer_service: TrainingRecordReferenceAnswerService = Depends(
        require_training_record_reference_answer_service
    ),
) -> TrainingRecordReferenceAnswerResponse:
    try:
        return await reference_answer_service.request_reference_answer(
            user_id=current_user.id,
            record_id=record_id,
            payload=_to_domain(payload, DomainTargetedPracticeReferenceAnswerRequest),
        )
    except TrainingRecordReferenceAnswerStateError as error:
        raise training_record_reference_answer_state_api_error(error) from None


@records_router.get(
    "/practice/{recordId}",
    response_model=TargetedPracticeTrainingRecordDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def get_targeted_practice_training_record(
    record_id: TrainingRecordId,
    current_user: User = Depends(require_current_user),
    training_record_service: TrainingRecordService = Depends(
        require_training_record_service
    ),
) -> TargetedPracticeTrainingRecordDetailResponse:
    try:
        return await training_record_service.get_targeted_practice_record(
            user_id=current_user.id,
            record_id=record_id,
        )
    except TrainingRecordStateError as error:
        if error.code == TRAINING_RECORD_NOT_FOUND:
            raise APIError(
                status.HTTP_404_NOT_FOUND, TRAINING_RECORD_NOT_FOUND
            ) from None
        if error.code == TRAINING_RECORD_STATE_CONFLICT:
            raise APIError(
                status.HTTP_409_CONFLICT,
                TRAINING_RECORD_STATE_CONFLICT,
            ) from None
        raise


@records_router.get(
    "/interview/{recordId}",
    response_model=MockInterviewTrainingRecordDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def get_mock_interview_training_record(
    record_id: TrainingRecordId,
    current_user: User = Depends(require_current_user),
    training_record_service: TrainingRecordService = Depends(
        require_training_record_service
    ),
) -> MockInterviewTrainingRecordDetailResponse:
    try:
        return await training_record_service.get_mock_interview_record(
            user_id=current_user.id,
            record_id=record_id,
        )
    except TrainingRecordStateError as error:
        if error.code == TRAINING_RECORD_NOT_FOUND:
            raise APIError(
                status.HTTP_404_NOT_FOUND, TRAINING_RECORD_NOT_FOUND
            ) from None
        if error.code == TRAINING_RECORD_STATE_CONFLICT:
            raise APIError(
                status.HTTP_409_CONFLICT,
                TRAINING_RECORD_STATE_CONFLICT,
            ) from None
        raise


# Training planning routes

planning_router = APIRouter(
    prefix="/training-plans",
    tags=["training-planning"],
    dependencies=[Depends(require_csrf)],
)


def _to_domain(payload, model):
    return model.model_validate(payload.model_dump(mode="python", by_alias=False))


def training_planning_state_api_error(
    error: TrainingPlanningStateError,
) -> APIError:
    if error.code == TRAINING_PLANNING_TARGET_NOT_FOUND:
        return APIError(status.HTTP_404_NOT_FOUND, error.code)
    if error.code == TRAINING_PLANNING_TARGET_UNAVAILABLE:
        return APIError(status.HTTP_409_CONFLICT, error.code)
    if error.code == TRAINING_PLANNING_UNAVAILABLE:
        return APIError(status.HTTP_503_SERVICE_UNAVAILABLE, error.code)
    return APIError(status.HTTP_409_CONFLICT, TRAINING_PLANNING_STATE_CONFLICT)


@planning_router.post(
    "",
    response_model=TrainingPlanningResponse,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def start_training_planning(
    payload: StartTrainingPlanningRequest,
    request: Request,
    current_user: User = Depends(require_current_user),
    training_planning_service: TrainingPlanningService = Depends(
        require_training_planning_service
    ),
) -> TrainingPlanningResponse:
    try:
        return await training_planning_service.start_planning(
            current_user,
            _to_domain(payload, DomainStartTrainingPlanningRequest),
            interaction_language=normalize_interaction_language(
                request.headers.get("accept-language")
            ),
        )
    except TrainingPlanningStateError as error:
        raise training_planning_state_api_error(error) from None


@planning_router.post(
    "/current",
    response_model=TrainingPlanningResponse,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def ensure_current_training_planning(
    payload: EnsureCurrentTrainingPlanningRequest,
    request: Request,
    current_user: User = Depends(require_current_user),
    training_planning_service: TrainingPlanningService = Depends(
        require_training_planning_service
    ),
) -> TrainingPlanningResponse:
    try:
        return await training_planning_service.ensure_current_planning(
            current_user,
            _to_domain(payload, DomainEnsureCurrentTrainingPlanningRequest),
            interaction_language=normalize_interaction_language(
                request.headers.get("accept-language")
            ),
        )
    except TrainingPlanningStateError as error:
        raise training_planning_state_api_error(error) from None


router = APIRouter()
router.include_router(competencies_router)
router.include_router(records_router)
router.include_router(planning_router)
