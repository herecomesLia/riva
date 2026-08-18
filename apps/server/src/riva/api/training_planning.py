from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request, status

from riva.core.auth import require_current_user
from riva.core.csrf import csrf_protect
from riva.core.errors import APIError
from riva.core.language import normalize_interaction_language
from riva.core.training_planning import get_training_planning_service
from riva.models import User
from riva.schemas.training_planning import (
    StartTrainingPlanningRequest,
    TrainingPlanningStatusResponse,
)
from riva.services.training_planning import (
    TRAINING_PLANNING_NOT_FOUND,
    TRAINING_PLANNING_REQUEST_CONFLICT,
    TRAINING_PLANNING_STATE_CONFLICT,
    TRAINING_PLANNING_TARGET_NOT_FOUND,
    TRAINING_PLANNING_TARGET_UNAVAILABLE,
    TRAINING_PLANNING_UNAVAILABLE,
    TrainingPlanningService,
    TrainingPlanningStateError,
)


TrainingPlanningRunId = Annotated[UUID, Path(alias="runId")]

router = APIRouter(
    prefix="/training-plans",
    tags=["training-planning"],
    dependencies=[Depends(csrf_protect)],
)


def training_planning_state_api_error(
    error: TrainingPlanningStateError,
) -> APIError:
    if error.code == TRAINING_PLANNING_TARGET_NOT_FOUND:
        return APIError(status.HTTP_404_NOT_FOUND, error.code)
    if error.code == TRAINING_PLANNING_NOT_FOUND:
        return APIError(status.HTTP_404_NOT_FOUND, error.code)
    if error.code == TRAINING_PLANNING_TARGET_UNAVAILABLE:
        return APIError(status.HTTP_409_CONFLICT, error.code)
    if error.code == TRAINING_PLANNING_REQUEST_CONFLICT:
        return APIError(status.HTTP_409_CONFLICT, error.code)
    if error.code == TRAINING_PLANNING_UNAVAILABLE:
        return APIError(status.HTTP_503_SERVICE_UNAVAILABLE, error.code)
    return APIError(status.HTTP_409_CONFLICT, TRAINING_PLANNING_STATE_CONFLICT)


@router.post(
    "",
    response_model=TrainingPlanningStatusResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_training_planning(
    payload: StartTrainingPlanningRequest,
    request: Request,
    current_user: User = Depends(require_current_user),
    training_planning_service: TrainingPlanningService = Depends(
        get_training_planning_service
    ),
) -> TrainingPlanningStatusResponse:
    try:
        return await training_planning_service.start_planning(
            current_user,
            payload,
            interaction_language=normalize_interaction_language(
                request.headers.get("accept-language")
            ),
        )
    except TrainingPlanningStateError as error:
        raise training_planning_state_api_error(error) from None


@router.get(
    "/{runId}",
    response_model=TrainingPlanningStatusResponse,
)
async def get_training_planning_status(
    run_id: TrainingPlanningRunId,
    current_user: User = Depends(require_current_user),
    training_planning_service: TrainingPlanningService = Depends(
        get_training_planning_service
    ),
) -> TrainingPlanningStatusResponse:
    try:
        return await training_planning_service.get_planning_status(
            user_id=current_user.id,
            run_id=run_id,
        )
    except TrainingPlanningStateError as error:
        raise training_planning_state_api_error(error) from None


__all__ = ["router", "training_planning_state_api_error"]
