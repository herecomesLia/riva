import asyncio
from http import HTTPStatus

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from riva.api.deps import DatabaseDep, LLMClientDep
from riva.schemas import HealthResponse, HealthStatus, ServiceHealthStatus

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
async def health(
    database: DatabaseDep, llm: LLMClientDep
) -> HealthResponse | JSONResponse:
    database_status, llm_status = await asyncio.gather(
        database.check_health(),
        llm.check_health(),
    )

    if database_status != HealthStatus.ok:
        service_status = ServiceHealthStatus.unavailable
    elif llm_status != HealthStatus.ok:
        service_status = ServiceHealthStatus.degraded
    else:
        service_status = ServiceHealthStatus.ok

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
