from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import (
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from riva.schemas.base import APIModel

MAX_RAW_JOB_DESCRIPTION_LENGTH = 50_000


def _normalize_optional_text(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


RequiredText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
]
OptionalText = Annotated[
    Annotated[str, StringConstraints(max_length=255)] | None,
    BeforeValidator(_normalize_optional_text),
]
RawJobDescription = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_RAW_JOB_DESCRIPTION_LENGTH,
    ),
]
TargetRoleVersion = Annotated[int, Field(ge=1)]
DeleteTargetRoleVersion = TargetRoleVersion
ExperienceYears = Annotated[int, Field(ge=0)]


class RoleAPIModel(APIModel):
    model_config = ConfigDict(extra="forbid")


class TargetRoleRecruitmentType(StrEnum):
    CAMPUS = "campus"
    EXPERIENCED = "experienced"


class TargetRolePreparationStatus(StrEnum):
    PREPARING = "preparing"
    PAUSED = "paused"
    ARCHIVED = "archived"


class ActiveTargetRolePreparationStatus(StrEnum):
    PREPARING = "preparing"
    PAUSED = "paused"


class TargetRoleExperienceRange(RoleAPIModel):
    min_years: ExperienceYears | None
    max_years: ExperienceYears | None

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if self.min_years is None and self.max_years is None:
            raise ValueError("experience_range requires at least one bound")
        if (
            self.min_years is not None
            and self.max_years is not None
            and self.max_years < self.min_years
        ):
            raise ValueError("max_years cannot be less than min_years")
        return self


class MissingJobDescriptionResponse(RoleAPIModel):
    status: Literal["missing"]
    raw_text: None
    version: None
    parsing_failure_reason: None


class SavedJobDescriptionResponse(RoleAPIModel):
    status: Literal["saved"]
    raw_text: RawJobDescription
    version: TargetRoleVersion
    parsing_failure_reason: None


JobDescriptionResponse = Annotated[
    MissingJobDescriptionResponse | SavedJobDescriptionResponse,
    Field(discriminator="status"),
]


class MissingProfileContext(RoleAPIModel):
    exists: Literal[False]
    version: None
    completed: Literal[False]


class ExistingProfileContext(RoleAPIModel):
    exists: Literal[True]
    version: TargetRoleVersion
    completed: bool


ProfileContext = Annotated[
    MissingProfileContext | ExistingProfileContext,
    Field(discriminator="exists"),
]


class TargetRoleResponse(RoleAPIModel):
    id: UUID
    title: RequiredText
    company: OptionalText
    recruitment_type: TargetRoleRecruitmentType | None
    location: OptionalText
    experience_range: TargetRoleExperienceRange | None
    preparation_status: TargetRolePreparationStatus
    created_at: datetime
    updated_at: datetime
    version: TargetRoleVersion
    job_description: JobDescriptionResponse
    job_description_analysis: None
    matching_analysis: None


class RolesPageResponse(RoleAPIModel):
    roles: list[TargetRoleResponse]
    current_role_id: UUID | None
    profile_context: ProfileContext

    @model_validator(mode="after")
    def validate_current_role(self) -> Self:
        if self.current_role_id is None:
            return self

        current_role = next(
            (role for role in self.roles if role.id == self.current_role_id),
            None,
        )
        if current_role is None:
            raise ValueError("current_role_id must reference a role in roles")
        if current_role.preparation_status is TargetRolePreparationStatus.ARCHIVED:
            raise ValueError("current_role_id cannot reference an archived role")
        return self


class TargetRoleDetailsRequest(RoleAPIModel):
    title: RequiredText
    company: OptionalText
    recruitment_type: TargetRoleRecruitmentType | None
    location: OptionalText
    experience_range: TargetRoleExperienceRange | None


class CreateTargetRoleRequest(TargetRoleDetailsRequest):
    preparation_status: ActiveTargetRolePreparationStatus


class UpdateTargetRoleRequest(TargetRoleDetailsRequest):
    version: TargetRoleVersion


class SetCurrentTargetRoleRequest(RoleAPIModel):
    version: TargetRoleVersion


class UpdatePreparationStatusRequest(RoleAPIModel):
    version: TargetRoleVersion
    preparation_status: ActiveTargetRolePreparationStatus


class ArchiveTargetRoleRequest(RoleAPIModel):
    version: TargetRoleVersion


class SaveJobDescriptionRequest(RoleAPIModel):
    version: TargetRoleVersion
    raw_text: RawJobDescription
