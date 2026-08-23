from fastapi import APIRouter, Depends, status

from riva.api.dependencies import require_current_user, require_dashboard_service
from riva.models import User
from riva.schemas.dashboard import DashboardResponse
from riva.services.dashboard.dashboard import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get(
    "",
    response_model=DashboardResponse,
    status_code=status.HTTP_200_OK,
)
async def get_dashboard(
    current_user: User = Depends(require_current_user),
    dashboard_service: DashboardService = Depends(require_dashboard_service),
) -> DashboardResponse:
    result = await dashboard_service.get_dashboard(current_user)
    data = (
        result.model_dump(mode="python", by_alias=False)
        if hasattr(result, "model_dump")
        else result
    )
    return DashboardResponse.model_validate(data)
