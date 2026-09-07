from enum import StrEnum

from riva.schemas.base import ResponseModel


class ServiceHealthStatus(StrEnum):
    ok = "ok"
    degraded = "degraded"
    unavailable = "unavailable"


class HealthStatus(StrEnum):
    ok = "ok"
    unavailable = "unavailable"
    degraded = "degraded"


class HealthResponse(ResponseModel):
    status: ServiceHealthStatus
    database: HealthStatus
    llm: HealthStatus
