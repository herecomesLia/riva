from http import HTTPStatus

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

from riva.db.errors import DatabaseUnavailableError
from riva.schemas import DependencyHealthStatus, HealthResponse, ServiceHealthStatus

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "model": HealthResponse,
            "description": HTTPStatus(status.HTTP_503_SERVICE_UNAVAILABLE).phrase,
        }
    },
)
async def health(request: Request) -> HealthResponse | JSONResponse:
    try:
        await request.app.state.database.ping()
    except DatabaseUnavailableError:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=HealthResponse(
                status=ServiceHealthStatus.unhealthy,
                database=DependencyHealthStatus.unavailable,
            ).model_dump(mode="json"),
        )

    return HealthResponse(
        status=ServiceHealthStatus.ok,
        database=DependencyHealthStatus.ok,
    )
