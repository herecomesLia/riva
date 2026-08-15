from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, status

from riva.core.auth import require_current_user
from riva.core.csrf import csrf_protect
from riva.core.errors import APIError
from riva.core.training_records import get_training_record_service
from riva.models import User
from riva.schemas.training_records import (
    TargetedPracticeTrainingRecordDetailResponse,
)
from riva.services.training_records import (
    TRAINING_RECORD_NOT_FOUND,
    TRAINING_RECORD_STATE_CONFLICT,
    TrainingRecordService,
    TrainingRecordStateError,
)


TrainingRecordId = Annotated[UUID, Path(alias="recordId")]

router = APIRouter(
    prefix="/training-records",
    tags=["training-records"],
    dependencies=[Depends(csrf_protect)],
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
