from datetime import datetime
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, StrictInt, StrictStr, field_validator

from riva.schemas.base import APIModel


class _TrainingMemoryModel(APIModel):
    model_config = ConfigDict(extra="forbid")


_Score = Annotated[StrictInt, Field(ge=0, le=100)]
_Count = Annotated[StrictInt, Field(ge=0)]


class TrainingMemoryCompetency(_TrainingMemoryModel):
    competency_key: StrictStr = Field(alias="competencyKey", min_length=1)
    display_name: StrictStr = Field(alias="displayName", min_length=1)
    level: _Score
    confidence: _Score
    trend: Literal["insufficient", "improving", "stable", "declining"]
    evidence_count: _Count = Field(alias="evidenceCount")
    last_evidence_at: datetime | None = Field(alias="lastEvidenceAt")

    @field_validator("last_evidence_at")
    @classmethod
    def _require_aware_last_evidence_at(
        cls,
        value: datetime | None,
    ) -> datetime | None:
        if value is not None and (
            value.tzinfo is None or value.utcoffset() is None
        ):
            raise ValueError("lastEvidenceAt must be timezone-aware")
        return value


class TrainingMemoryContext(_TrainingMemoryModel):
    version: Literal["1"] = "1"
    focus_competencies: list[TrainingMemoryCompetency] = Field(
        alias="focusCompetencies",
        default_factory=list,
        max_length=5,
    )
    established_competencies: list[TrainingMemoryCompetency] = Field(
        alias="establishedCompetencies",
        default_factory=list,
        max_length=3,
    )


__all__ = ["TrainingMemoryCompetency", "TrainingMemoryContext"]
