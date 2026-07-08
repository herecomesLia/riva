from enum import StrEnum

from pydantic import BaseModel


class ServiceHealthStatus(StrEnum):
    ok = "ok"
    unhealthy = "unhealthy"


class DependencyHealthStatus(StrEnum):
    ok = "ok"
    unavailable = "unavailable"
    degraded = "degraded"
    unknown = "unknown"


class HealthResponse(BaseModel):
    status: ServiceHealthStatus
    database: DependencyHealthStatus
