from fastapi import APIRouter, Depends, status

from riva.core.auth import require_current_user
from riva.core.dashboard import get_dashboard_service
from riva.models import User
from riva.schemas.dashboard import DashboardResponse
from riva.services.dashboard import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get(
    "",
    response_model=DashboardResponse,
    status_code=status.HTTP_200_OK,
)
async def get_dashboard(
    current_user: User = Depends(require_current_user),
    dashboard_service: DashboardService = Depends(get_dashboard_service),
) -> DashboardResponse:
    return await dashboard_service.get_dashboard(current_user)


__all__ = ["router"]
