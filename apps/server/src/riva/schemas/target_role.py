from datetime import datetime
from uuid import UUID

from pydantic import Field, field_validator
from pydantic.json_schema import SkipJsonSchema

from riva.models.target_role import (
    HardSkills,
    JobDescriptionContent,
    JobRequirements,
    RecruitmentTrack,
)
from riva.models.types import NonBlankStr
from riva.schemas.base import (
    NonEmptyPartialUpdateRequest,
    RequestModel,
    ResponseModel,
)


class JobRequirementsRequest(JobRequirements, RequestModel):
    pass


class JobRequirementsResponse(JobRequirements, ResponseModel):
    pass


class HardSkillsRequest(HardSkills, RequestModel):
    pass


class HardSkillsResponse(HardSkills, ResponseModel):
    pass


class JobDescriptionResponse(JobDescriptionContent, ResponseModel):
    requirements: JobRequirementsResponse = Field(
        description="Mandatory eligibility conditions; excludes preferred qualifications."
    )
    hard_skills: HardSkillsResponse = Field(
        description="Required technical skills, retaining proficiency and conditions; excludes preferred-only skills."
    )


class TargetRoleResponse(ResponseModel):
    id: UUID
    title: str
    company: str | None
    recruitment_track: RecruitmentTrack | None = Field(
        description="Campus or experienced hiring track, not employment type; null when unspecified."
    )
    location: str | None
    is_archived: bool = Field(
        description="Whether the saved role is archived. An archived role cannot be the current target role."
    )
    jd: JobDescriptionResponse
    created_at: datetime
    updated_at: datetime


class TargetRoleListResponse(ResponseModel):
    target_roles: list[TargetRoleResponse]
    active_target_role_id: UUID | None = Field(
        description="The currently selected target role, not all unarchived roles; null when none is selected."
    )


class CreateTargetRoleRequest(RequestModel):
    title: NonBlankStr
    company: NonBlankStr | None = None
    recruitment_track: RecruitmentTrack | None = Field(
        default=None,
        description="Campus or experienced hiring track, not employment type.",
    )
    location: NonBlankStr | None = None


class UpdateTargetRoleRequest(NonEmptyPartialUpdateRequest):
    """Update supplied fields only; at least one field is required.

    Null clears company, recruitment track or location, but is not allowed for title.
    """

    title: NonBlankStr | SkipJsonSchema[None] = Field(default_factory=lambda: None)
    company: NonBlankStr | None = None
    recruitment_track: RecruitmentTrack | None = None
    location: NonBlankStr | None = None

    @field_validator("title", mode="before")
    @classmethod
    def title_cannot_be_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("title cannot be null")
        return value


class SetActiveTargetRoleRequest(RequestModel):
    target_role_id: UUID = Field(
        description="Unarchived target role to select as the current role."
    )


class JDTextExtractionRequest(RequestModel):
    text: NonBlankStr = Field(description="Source job description text to extract.")


class UpdateJobDescriptionRequest(NonEmptyPartialUpdateRequest):
    """Replace supplied sections in full, without reparsing the source JD.

    Omitted sections stay unchanged; null is not accepted. Lists can be cleared
    with []. Category objects are replaced, not recursively merged: omitted
    subcategories become empty. At least one section is required.
    """

    responsibilities: list[NonBlankStr] | SkipJsonSchema[None] = Field(
        default_factory=lambda: None
    )
    requirements: JobRequirementsRequest | SkipJsonSchema[None] = Field(
        default_factory=lambda: None
    )
    hard_skills: HardSkillsRequest | SkipJsonSchema[None] = Field(
        default_factory=lambda: None
    )
    soft_skills: list[NonBlankStr] | SkipJsonSchema[None] = Field(
        default_factory=lambda: None
    )
    preferred_qualifications: list[NonBlankStr] | SkipJsonSchema[None] = Field(
        default_factory=lambda: None
    )
    business_domains: list[NonBlankStr] | SkipJsonSchema[None] = Field(
        default_factory=lambda: None
    )

    @field_validator(
        "responsibilities",
        "requirements",
        "hard_skills",
        "soft_skills",
        "preferred_qualifications",
        "business_domains",
        mode="before",
    )
    @classmethod
    def sections_cannot_be_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("job description sections cannot be null")
        return value
