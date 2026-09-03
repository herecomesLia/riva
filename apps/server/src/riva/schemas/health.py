from enum import StrEnum

from riva.schemas.base import ResponseModel


class ServiceHealthStatus(StrEnum):
    ok = "ok"
    unhealthy = "unhealthy"


class DependencyHealthStatus(StrEnum):
    ok = "ok"
    unavailable = "unavailable"
    degraded = "degraded"
    unknown = "unknown"


class HealthResponse(ResponseModel):
    status: ServiceHealthStatus
    database: DependencyHealthStatus
    llm: DependencyHealthStatus
