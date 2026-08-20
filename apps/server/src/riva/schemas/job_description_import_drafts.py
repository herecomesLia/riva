from datetime import datetime
from enum import StrEnum
from uuid import UUID

from riva.schemas.base import APIModel
from riva.schemas.job_description_parsing import Company, RawJobDescription, RoleTitle


class JobDescriptionImportDraftStatus(StrEnum):
    PARSING = "parsing"
    READY = "ready"
    FAILED = "failed"
    APPLIED = "applied"


class JobDescriptionImportDraftCreate(APIModel):
    raw_text: RawJobDescription


class JobDescriptionImportDraftResponse(APIModel):
    id: UUID
    raw_text: RawJobDescription
    parsed_company: Company
    parsed_title: RoleTitle | None
    parsed_location: Company
    parsed_description: RawJobDescription | None
    status: JobDescriptionImportDraftStatus
    agent_run_id: UUID | None
    failure_reason: str | None
    applied_role_id: UUID | None
    can_apply: bool
    created_at: datetime
    updated_at: datetime


__all__ = [
    "JobDescriptionImportDraftCreate",
    "JobDescriptionImportDraftResponse",
    "JobDescriptionImportDraftStatus",
]
