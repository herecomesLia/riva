from enum import StrEnum

from riva.schemas.base import APIModel


class ServiceHealthStatus(StrEnum):
    ok = "ok"
    unhealthy = "unhealthy"


class DependencyHealthStatus(StrEnum):
    ok = "ok"
    unavailable = "unavailable"
    degraded = "degraded"
    unknown = "unknown"


class HealthResponse(APIModel):
    status: ServiceHealthStatus
    database: DependencyHealthStatus
