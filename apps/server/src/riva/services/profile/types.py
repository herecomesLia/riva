from datetime import datetime
from enum import StrEnum
from typing import Annotated, Self
from uuid import UUID

from pydantic import (
    BeforeValidator,
    ConfigDict,
    Field,
    HttpUrl,
    StringConstraints,
    field_validator,
    model_validator,
)

from riva.services.types import DomainModel

MAX_SECTION_ITEMS = 100
MAX_SKILLS = 200
MAX_BULLETS = 100
MAX_SKILL_REFERENCES = 100


def _normalize_optional_text(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _validate_standard_uuid(value: object) -> object:
    if isinstance(value, UUID):
        return value
    if not isinstance(value, str):
        return value
    try:
        parsed = UUID(value)
    except ValueError:
        return value
    if str(parsed) != value.lower():
        raise ValueError("id must be a standard UUID")
    return value


def _normalize_bullets(value: object) -> object:
    if not isinstance(value, list):
        return value

    normalized: list[object] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            normalized.append(item)
            continue
        item = item.strip()
        if not item or item in seen:
            continue
        seen.add(item)
        normalized.append(item)
    return normalized


def _deduplicate_ids(value: object) -> object:
    if not isinstance(value, list):
        return value

    deduplicated: list[object] = []
    seen: set[str] = set()
    for item in value:
        key = str(item).lower()
        if key in seen:
            continue
        seen.add(key)
        deduplicated.append(item)
    return deduplicated


StandardUUID = Annotated[UUID, BeforeValidator(_validate_standard_uuid)]
RequiredText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
]
OptionalText = Annotated[
    Annotated[str, StringConstraints(max_length=255)] | None,
    BeforeValidator(_normalize_optional_text),
]
Summary = Annotated[
    Annotated[str, StringConstraints(max_length=2000)] | None,
    BeforeValidator(_normalize_optional_text),
]
Month = Annotated[
    str,
    StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
]
Bullet = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=1000),
]
OptionalProjectUrl = Annotated[
    HttpUrl | None,
    BeforeValidator(_normalize_optional_text),
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


class StrictDomainModel(DomainModel):
    model_config = ConfigDict(extra="forbid")


class CurrentDatedInput(StrictDomainModel):
    id: StandardUUID
    start_date: Month
    end_date: Month | None
    is_current: bool

    @model_validator(mode="after")
    def validate_date_range(self) -> Self:
        if self.is_current and self.end_date is not None:
            raise ValueError("current entries cannot have an end date")
        if not self.is_current and self.end_date is None:
            raise ValueError("non-current entries require an end date")
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self


class CareerProfileEducationInput(CurrentDatedInput):
    school: RequiredText
    degree: OptionalText
    major: OptionalText


class CareerProfileWorkExperienceInput(CurrentDatedInput):
    company: RequiredText
    title: RequiredText
    employment_type: EmploymentType
    location: OptionalText
    responsibilities: list[Bullet] = Field(max_length=MAX_BULLETS)
    achievements: list[Bullet] = Field(max_length=MAX_BULLETS)
    skill_ids: list[StandardUUID] = Field(max_length=MAX_SKILL_REFERENCES)

    @field_validator("responsibilities", "achievements", mode="before")
    @classmethod
    def normalize_bullets(cls, value: object) -> object:
        return _normalize_bullets(value)

    @field_validator("skill_ids", mode="before")
    @classmethod
    def deduplicate_skill_ids(cls, value: object) -> object:
        return _deduplicate_ids(value)


class CareerProfileProjectExperienceInput(StrictDomainModel):
    id: StandardUUID
    name: RequiredText
    role: OptionalText
    start_date: Month
    end_date: Month | None
    responsibilities: list[Bullet] = Field(max_length=MAX_BULLETS)
    achievements: list[Bullet] = Field(max_length=MAX_BULLETS)
    skill_ids: list[StandardUUID] = Field(max_length=MAX_SKILL_REFERENCES)
    project_url: OptionalProjectUrl

    @field_validator("responsibilities", "achievements", mode="before")
    @classmethod
    def normalize_bullets(cls, value: object) -> object:
        return _normalize_bullets(value)

    @field_validator("skill_ids", mode="before")
    @classmethod
    def deduplicate_skill_ids(cls, value: object) -> object:
        return _deduplicate_ids(value)

    @model_validator(mode="after")
    def validate_date_range(self) -> Self:
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self


class CareerProfileSkillInput(StrictDomainModel):
    id: StandardUUID
    name: RequiredText


class CareerProfileEducationResponse(CareerProfileEducationInput):
    source: ProfileSource


class CareerProfileWorkExperienceResponse(CareerProfileWorkExperienceInput):
    source: ProfileSource


class CareerProfileProjectExperienceResponse(CareerProfileProjectExperienceInput):
    source: ProfileSource


class CareerProfileSkillResponse(CareerProfileSkillInput):
    source: ProfileSource


class CareerProfilePutRequest(StrictDomainModel):
    version: Annotated[int, Field(ge=1)] | None
    summary: Summary
    education: list[CareerProfileEducationInput] = Field(max_length=MAX_SECTION_ITEMS)
    work_experiences: list[CareerProfileWorkExperienceInput] = Field(
        max_length=MAX_SECTION_ITEMS
    )
    project_experiences: list[CareerProfileProjectExperienceInput] = Field(
        max_length=MAX_SECTION_ITEMS
    )
    skills: list[CareerProfileSkillInput] = Field(max_length=MAX_SKILLS)

    @model_validator(mode="after")
    def validate_ids_and_skill_references(self) -> Self:
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
            raise ValueError("experience skill_ids must reference request skills")

        skill_names = [skill.name.casefold() for skill in self.skills]
        if len(skill_names) != len(set(skill_names)):
            raise ValueError("profile skill names must be unique")

        return self


class CareerProfileResponse(StrictDomainModel):
    profile_id: StandardUUID
    summary: Summary
    version: Annotated[int, Field(ge=1)]
    updated_at: datetime
    education: list[CareerProfileEducationResponse]
    work_experiences: list[CareerProfileWorkExperienceResponse]
    project_experiences: list[CareerProfileProjectExperienceResponse]
    skills: list[CareerProfileSkillResponse]


class CareerProfileGetResponse(StrictDomainModel):
    profile: CareerProfileResponse | None


class CareerProfilePutResponse(StrictDomainModel):
    profile: CareerProfileResponse
