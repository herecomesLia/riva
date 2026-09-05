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
    education: list[EducationEntryRequest] = Field(default_factory=list)
    work_experiences: list[WorkExperienceEntryRequest] = Field(
        default_factory=list,
    )
    projects: list[ProjectEntryRequest] = Field(default_factory=list)


class UpdateCareerProfileRequest(NonEmptyPartialUpdateRequest):
    education: list[EducationEntryRequest] | SkipJsonSchema[None] = Field(
        default_factory=lambda: None,
    )
    work_experiences: list[WorkExperienceEntryRequest] | SkipJsonSchema[None] = Field(
        default_factory=lambda: None,
    )
    projects: list[ProjectEntryRequest] | SkipJsonSchema[None] = Field(
        default_factory=lambda: None,
    )
    skills: list[NonBlankStr] | SkipJsonSchema[None] = Field(
        default_factory=lambda: None,
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
    education: list[EducationEntryResponse]
    work_experiences: list[WorkExperienceEntryResponse]
    projects: list[ProjectEntryResponse]
    created_at: datetime
    updated_at: datetime
