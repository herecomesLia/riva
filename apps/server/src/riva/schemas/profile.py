from datetime import datetime
from enum import StrEnum
from typing import Annotated, Self
from uuid import UUID

from pydantic import ConfigDict, Field, HttpUrl, StringConstraints, model_validator

from riva.schemas.base import APIModel

RequiredText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
]
OptionalText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
]
Month = Annotated[
    str,
    StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
]


class ProfileSource(StrEnum):
    RESUME_EXTRACTED = "resumeExtracted"
    USER_EDITED = "userEdited"
    USER_ADDED = "userAdded"


class EmploymentType(StrEnum):
    FULL_TIME = "fullTime"
    PART_TIME = "partTime"
    INTERNSHIP = "internship"
    CONTRACT = "contract"
    FREELANCE = "freelance"


class ProfileItem(APIModel):
    model_config = ConfigDict(extra="forbid")

    id: RequiredText
    source: ProfileSource = ProfileSource.USER_ADDED


class DatedProfileItem(ProfileItem):
    start_date: Month | None = None
    end_date: Month | None = None
    is_current: bool = False

    @model_validator(mode="after")
    def validate_date_range(self) -> Self:
        if self.is_current and self.end_date is not None:
            raise ValueError("current entries cannot have an end date")
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValueError("end_date cannot be before start_date")
        return self


class EducationExperience(DatedProfileItem):
    school: RequiredText
    degree: OptionalText | None = None
    major: OptionalText | None = None


class WorkExperience(DatedProfileItem):
    company: RequiredText
    title: RequiredText
    employment_type: EmploymentType
    location: OptionalText | None = None
    responsibilities: list[RequiredText] = Field(default_factory=list, max_length=100)
    achievements: list[RequiredText] = Field(default_factory=list, max_length=100)
    skill_ids: list[RequiredText] = Field(default_factory=list, max_length=100)


class ProjectExperience(DatedProfileItem):
    name: RequiredText
    role: OptionalText | None = None
    responsibilities: list[RequiredText] = Field(default_factory=list, max_length=100)
    achievements: list[RequiredText] = Field(default_factory=list, max_length=100)
    skill_ids: list[RequiredText] = Field(default_factory=list, max_length=100)
    project_url: HttpUrl | None = None


class ProfileSkill(ProfileItem):
    name: RequiredText


class ProfileContent(APIModel):
    model_config = ConfigDict(extra="forbid")

    summary: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
        | None
    ) = None
    education: list[EducationExperience] = Field(default_factory=list, max_length=100)
    work_experiences: list[WorkExperience] = Field(default_factory=list, max_length=100)
    project_experiences: list[ProjectExperience] = Field(
        default_factory=list,
        max_length=100,
    )
    skills: list[ProfileSkill] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_item_ids_and_skill_references(self) -> Self:
        for section in (
            self.education,
            self.work_experiences,
            self.project_experiences,
            self.skills,
        ):
            ids = [item.id for item in section]
            if len(ids) != len(set(ids)):
                raise ValueError("profile item ids must be unique within each section")

        skill_ids = {skill.id for skill in self.skills}
        referenced_skill_ids = {
            skill_id
            for experience in (*self.work_experiences, *self.project_experiences)
            for skill_id in experience.skill_ids
        }
        if not referenced_skill_ids <= skill_ids:
            raise ValueError("experience skill_ids must reference profile skills")

        skill_names = [skill.name.casefold() for skill in self.skills]
        if len(skill_names) != len(set(skill_names)):
            raise ValueError("profile skill names must be unique")

        return self


class ProfileResponse(ProfileContent):
    profile_id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
