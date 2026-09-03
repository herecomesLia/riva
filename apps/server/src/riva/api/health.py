from http import HTTPStatus

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

from riva.schemas import DependencyHealthStatus, HealthResponse, ServiceHealthStatus

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    operation_id="check-health",
    response_model=HealthResponse,
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": HealthResponse,
            "description": HTTPStatus(status.HTTP_503_SERVICE_UNAVAILABLE).phrase,
        }
    },
)
async def health(request: Request) -> HealthResponse | JSONResponse:
    service_status = ServiceHealthStatus.ok
    database_status = DependencyHealthStatus.ok
    if not await request.app.state.database.check_health():
        service_status = ServiceHealthStatus.unhealthy
        database_status = DependencyHealthStatus.unavailable

    if service_status != ServiceHealthStatus.ok:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=HealthResponse(
                status=service_status,
                database=database_status,
            ).model_dump(mode="json"),
        )

    return HealthResponse(
        status=service_status,
        database=database_status,
    )
