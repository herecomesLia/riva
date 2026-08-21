from datetime import datetime
from typing import Literal, Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from riva.schemas.base import APIModel
from riva.schemas.profile import StandardUUID

ResumeParsingLifecycleStatus = Literal[
    "notStarted",
    "queued",
    "running",
    "succeeded",
    "failed",
]
ResumeImportDraftLifecycleStatus = Literal[
    "ready",
    "applied",
    "superseded",
]


class ResumeParsingStatusResponse(APIModel):
    model_config = ConfigDict(extra="forbid")

    resume_document_id: StandardUUID
    status: ResumeParsingLifecycleStatus
    run_id: StandardUUID | None
    attempt_count: int = Field(ge=0)
    max_attempts: int | None = Field(default=None, ge=1)
    error_code: str | None
    failure_reason: str | None
    can_retry: bool
    created_at: datetime | None
    started_at: datetime | None
    finished_at: datetime | None
    result_version: int | None = Field(default=None, ge=1)
    draft_version: int | None = Field(default=None, ge=1)
    draft_status: ResumeImportDraftLifecycleStatus | None

    @field_validator("created_at", "started_at", "finished_at")
    @classmethod
    def validate_aware_datetime(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("timestamps must be timezone-aware")
        return value

    @model_validator(mode="after")
    def validate_state(self) -> Self:
        if self.status == "notStarted":
            self._require(
                self.run_id is None
                and self.attempt_count == 0
                and self.max_attempts is None
                and self.error_code is None
                and self.failure_reason is None
                and not self.can_retry
                and self.created_at is None
                and self.started_at is None
                and self.finished_at is None
                and self.result_version is None
                and self.draft_version is None
                and self.draft_status is None,
                "notStarted state contains run data",
            )
        elif self.status == "queued":
            self._require_active_state()
            self._require(
                self.failure_reason is None
                and not self.can_retry
                and self.finished_at is None
                and self.error_code is None
                and self.result_version is None
                and self.draft_version is None
                and self.draft_status is None,
                "queued state contains finished data",
            )
        elif self.status == "running":
            self._require_active_state()
            self._require(
                self.started_at is not None
                and self.failure_reason is None
                and not self.can_retry
                and self.finished_at is None
                and self.error_code is None
                and self.result_version is None
                and self.draft_version is None
                and self.draft_status is None,
                "running state contains invalid lifecycle data",
            )
        elif self.status == "succeeded":
            self._require_terminal_state()
            self._require(
                self.error_code is None
                and self.failure_reason is None
                and not self.can_retry
                and self.result_version is not None
                and self.draft_version is not None
                and self.draft_status is not None,
                "succeeded state is incomplete",
            )
        elif self.status == "failed":
            self._require_terminal_state()
            self._require(
                self.error_code is not None
                and self.failure_reason is not None
                and bool(self.failure_reason.strip())
                and self.can_retry
                and self.result_version is None
                and self.draft_version is None
                and self.draft_status is None,
                "failed state is invalid",
            )
        return self

    def _require_active_state(self) -> None:
        self._require(
            self.run_id is not None
            and self.max_attempts is not None
            and self.created_at is not None,
            "active state is incomplete",
        )

    def _require_terminal_state(self) -> None:
        self._require(
            self.run_id is not None
            and self.max_attempts is not None
            and self.created_at is not None
            and self.finished_at is not None,
            "terminal state is incomplete",
        )

    @staticmethod
    def _require(condition: bool, message: str) -> None:
        if not condition:
            raise ValueError(message)


__all__ = [
    "ResumeImportDraftLifecycleStatus",
    "ResumeParsingLifecycleStatus",
    "ResumeParsingStatusResponse",
]
