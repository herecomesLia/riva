from enum import StrEnum

from pydantic import Field

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
    status: ServiceHealthStatus = Field(
        description="Overall availability: unavailable when the database is unhealthy; degraded when only the LLM dependency is unhealthy."
    )
    database: HealthStatus = Field(description="Database probe status.")
    llm: HealthStatus = Field(
        description="Configured LLM model availability: degraded when only some models are available; unavailable when disabled or none are available."
    )
