from datetime import datetime
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, StrictInt, StrictStr, field_validator

from riva.schemas.base import APIModel


class _StrictAPIModel(APIModel):
    model_config = ConfigDict(extra="forbid")


def _validate_aware_timestamp(value: datetime | None) -> datetime | None:
    if value is not None and (
        value.tzinfo is None or value.utcoffset() is None
    ):
        raise ValueError("last_evidence_at must be timezone-aware")
    return value


class CompetencySummaryResponse(_StrictAPIModel):
    competency_key: StrictStr
    display_name: StrictStr
    level: Annotated[StrictInt, Field(ge=0, le=100)] | None
    confidence: Annotated[StrictInt, Field(ge=0, le=100)]
    trend: Literal["insufficient", "improving", "stable", "declining"]
    evidence_count: Annotated[StrictInt, Field(ge=0)]
    last_evidence_at: datetime | None

    _validate_last_evidence_at = field_validator("last_evidence_at")(
        _validate_aware_timestamp
    )


class CompetencyListResponse(_StrictAPIModel):
    items: list[CompetencySummaryResponse]


__all__ = ["CompetencyListResponse", "CompetencySummaryResponse"]
