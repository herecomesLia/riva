from fastapi import APIRouter, Depends, status

from riva.core.auth import require_current_user
from riva.core.competencies import get_competency_service
from riva.models import User
from riva.schemas.competencies import CompetencyListResponse
from riva.services.competencies import CompetencyService
from riva.services.competency_catalog import canonical_competency_sort_key

router = APIRouter(prefix="/competencies", tags=["competencies"])


@router.get(
    "",
    response_model=CompetencyListResponse,
    status_code=status.HTTP_200_OK,
)
async def list_competencies(
    current_user: User = Depends(require_current_user),
    competency_service: CompetencyService = Depends(get_competency_service),
) -> CompetencyListResponse:
    competencies = await competency_service.list_competencies(current_user.id)
    competencies.sort(
        key=lambda competency: canonical_competency_sort_key(competency.competency_key)
    )
    return CompetencyListResponse(items=competencies)


__all__ = ["router"]
