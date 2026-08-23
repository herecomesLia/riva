from datetime import datetime
from enum import StrEnum
from uuid import UUID

from riva.agents.jobs.jd_parser_types import (
    Company,
    RawJobDescription,
    RoleTitle,
)
from riva.services.types import DomainModel


class JobDescriptionImportDraftStatus(StrEnum):
    READY = "ready"
    APPLIED = "applied"


class JobDescriptionImportDraftCreate(DomainModel):
    raw_text: RawJobDescription


class JobDescriptionImportDraftResponse(DomainModel):
    id: UUID
    raw_text: RawJobDescription
    parsed_company: Company
    parsed_title: RoleTitle | None
    parsed_location: Company
    parsed_description: RawJobDescription | None
    status: JobDescriptionImportDraftStatus
    applied_role_id: UUID | None
    can_apply: bool
    created_at: datetime
    updated_at: datetime
