from datetime import datetime
from typing import Self

from pydantic import Field, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema

from riva.models.career_profile import (
    CareerProfileContent,
    EducationEntry,
    ProjectEntry,
    WorkExperienceEntry,
)
from riva.models.types import NonBlankStr
from riva.schemas.base import (
    NonEmptyPartialUpdateRequest,
    RequestModel,
    ResponseModel,
)


class CareerProfileTextExtractionRequest(RequestModel):
    text: NonBlankStr = Field(description="Source resume text to extract.")


class EducationEntryRequest(EducationEntry, RequestModel):
    pass


class EducationEntryResponse(EducationEntry, ResponseModel):
    pass


class WorkExperienceEntryRequest(WorkExperienceEntry, RequestModel):
    pass


class WorkExperienceEntryResponse(WorkExperienceEntry, ResponseModel):
    pass


class ProjectEntryRequest(ProjectEntry, RequestModel):
    pass


class ProjectEntryResponse(ProjectEntry, ResponseModel):
    pass


class CreateCareerProfileRequest(CareerProfileContent, RequestModel):
    """Initial profile content. Omitted sections start empty."""

    education: list[EducationEntryRequest] = Field(
        default_factory=list,
        description="Education history, including institutions, degrees, fields of study and dates.",
    )
    work_experiences: list[WorkExperienceEntryRequest] = Field(
        default_factory=list,
        description="Work history, including roles, responsibilities, achievements and related skills.",
    )
    projects: list[ProjectEntryRequest] = Field(
        default_factory=list,
        description="Project experience, including contributions, outcomes and project-specific technologies.",
    )


class UpdateCareerProfileRequest(NonEmptyPartialUpdateRequest):
    """Replace each supplied section in full. Omitted sections stay unchanged.

    Empty lists clear sections; null is not accepted. At least one section is required.
    """

    education: list[EducationEntryRequest] | SkipJsonSchema[None] = Field(
        default_factory=lambda: None,
        description="Replacement education history; omitted leaves it unchanged and [] clears it.",
    )
    work_experiences: list[WorkExperienceEntryRequest] | SkipJsonSchema[None] = Field(
        default_factory=lambda: None,
        description="Replacement work history; omitted leaves it unchanged and [] clears it.",
    )
    projects: list[ProjectEntryRequest] | SkipJsonSchema[None] = Field(
        default_factory=lambda: None,
        description="Replacement project experience; omitted leaves it unchanged and [] clears it.",
    )
    skills: list[NonBlankStr] | SkipJsonSchema[None] = Field(
        default_factory=lambda: None,
        description="Replacement profile-wide skills; must include all skills associated with the resulting work history. Omitted leaves it unchanged; [] clears it.",
    )

    @field_validator(
        "education",
        "work_experiences",
        "projects",
        "skills",
        mode="before",
    )
    @classmethod
    def sections_cannot_be_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("career profile sections cannot be null")
        return value

    @model_validator(mode="after")
    def validate_skill_consistency(self) -> Self:
        if (
            "work_experiences" in self.model_fields_set
            and "skills" in self.model_fields_set
            and self.work_experiences is not None
            and self.skills is not None
            and any(
                skill not in self.skills
                for work_experience in self.work_experiences
                for skill in work_experience.skills
            )
        ):
            raise ValueError(
                "work experience skills must exist in the career profile skills list"
            )
        return self


class CareerProfileResponse(CareerProfileContent, ResponseModel):
    education: list[EducationEntryResponse] = Field(
        description="Education history, including institutions, degrees, fields of study and dates."
    )
    work_experiences: list[WorkExperienceEntryResponse] = Field(
        description="Work history, including roles, responsibilities, achievements and related skills."
    )
    projects: list[ProjectEntryResponse] = Field(
        description="Project experience, including contributions, outcomes and project-specific technologies."
    )
    created_at: datetime
    updated_at: datetime
