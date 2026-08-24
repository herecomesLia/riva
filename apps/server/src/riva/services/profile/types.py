from datetime import datetime
from enum import StrEnum

from pydantic import Field

from riva.services.types import DomainModel


class EmploymentType(StrEnum):
    FULL_TIME = "fullTime"
    PART_TIME = "partTime"
    INTERNSHIP = "internship"
    CONTRACT = "contract"
    FREELANCE = "freelance"


class DatedProfileEntry(DomainModel):
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool = False


class ProfileEducation(DatedProfileEntry):
    school: str
    degree: str | None = None
    major: str | None = None


class ProfileWorkExperience(DatedProfileEntry):
    company: str
    title: str
    employment_type: EmploymentType | None = None
    location: str | None = None
    responsibilities: list[str] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)


class ProfileProjectExperience(DatedProfileEntry):
    name: str
    role: str | None = None
    responsibilities: list[str] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    project_url: str | None = None


class ProfileContent(DomainModel):
    summary: str | None = None
    education: list[ProfileEducation] = Field(default_factory=list)
    work_experiences: list[ProfileWorkExperience] = Field(default_factory=list)
    project_experiences: list[ProfileProjectExperience] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)


class SaveProfileRequest(DomainModel):
    version: int | None = None
    content: ProfileContent


class ProfileResponse(DomainModel):
    version: int
    updated_at: datetime
    content: ProfileContent
