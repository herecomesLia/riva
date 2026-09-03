import asyncio
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
    database_available, llm_available = await asyncio.gather(
        request.app.state.database.check_health(),
        request.app.state.llm.check_health(),
    )

    if not database_available:
        service_status = ServiceHealthStatus.unavailable
    elif not llm_available:
        service_status = ServiceHealthStatus.degraded
    else:
        service_status = ServiceHealthStatus.ok
    database_status = (
        DependencyHealthStatus.ok
        if database_available
        else DependencyHealthStatus.unavailable
    )
    llm_status = (
        DependencyHealthStatus.ok
        if llm_available
        else DependencyHealthStatus.unavailable
    )

    response = HealthResponse(
        status=service_status,
        database=database_status,
        llm=llm_status,
    )
    if service_status == ServiceHealthStatus.unavailable:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=response.model_dump(mode="json"),
        )

    return response
