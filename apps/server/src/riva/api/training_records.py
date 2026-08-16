from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, status

from riva.core.auth import require_current_user
from riva.core.csrf import csrf_protect
from riva.core.errors import APIError
from riva.core.training_records import get_training_record_service
from riva.models import User
from riva.schemas.training_records import (
    TargetedPracticeTrainingRecordDetailResponse,
    TrainingRecordKind,
    TrainingRecordStatus,
    TrainingRecordsOverviewResponse,
    TrainingRecordsPageResponse,
)
from riva.services.training_records import (
    TRAINING_RECORD_NOT_FOUND,
    TRAINING_RECORD_STATE_CONFLICT,
    TrainingRecordService,
    TrainingRecordStateError,
)


TrainingRecordId = Annotated[UUID, Path(alias="recordId")]
TrainingRecordPage = Annotated[int, Query(ge=1)]
TrainingRecordPageSize = Annotated[
    int,
    Query(alias="pageSize", ge=1, le=100),
]

router = APIRouter(
    prefix="/training-records",
    tags=["training-records"],
    dependencies=[Depends(csrf_protect)],
)


@router.get(
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
        get_training_record_service
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


@router.get(
    "/overview",
    response_model=TrainingRecordsOverviewResponse,
    status_code=status.HTTP_200_OK,
)
async def get_training_records_overview(
    current_user: User = Depends(require_current_user),
    training_record_service: TrainingRecordService = Depends(
        get_training_record_service
    ),
) -> TrainingRecordsOverviewResponse:
    return await training_record_service.get_training_records_overview(
        user_id=current_user.id,
    )


@router.get(
    "/practice/{recordId}",
    response_model=TargetedPracticeTrainingRecordDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def get_targeted_practice_training_record(
    record_id: TrainingRecordId,
    current_user: User = Depends(require_current_user),
    training_record_service: TrainingRecordService = Depends(
        get_training_record_service
    ),
) -> TargetedPracticeTrainingRecordDetailResponse:
    try:
        return await training_record_service.get_targeted_practice_record(
            user_id=current_user.id,
            record_id=record_id,
        )
    except TrainingRecordStateError as error:
        if error.code == TRAINING_RECORD_NOT_FOUND:
            raise APIError(status.HTTP_404_NOT_FOUND, TRAINING_RECORD_NOT_FOUND) from None
        if error.code == TRAINING_RECORD_STATE_CONFLICT:
            raise APIError(
                status.HTTP_409_CONFLICT,
                TRAINING_RECORD_STATE_CONFLICT,
            ) from None
        raise


__all__ = ["router"]
