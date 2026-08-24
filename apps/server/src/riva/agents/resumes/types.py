from pydantic import BaseModel

from riva.agents.types import EmploymentType
from riva.core.language import (
    DEFAULT_INTERACTION_LANGUAGE,
    InteractionLanguage,
)


class _ResumeDatedModel(BaseModel):
    start_date: str | None
    end_date: str | None
    is_current: bool = False


class ResumeParsingInput(BaseModel):
    resume_text: str
    interaction_language: InteractionLanguage = DEFAULT_INTERACTION_LANGUAGE


class ResumeParsingEducation(_ResumeDatedModel):
    school: str
    degree: str | None
    major: str | None


class ResumeParsingWorkExperience(_ResumeDatedModel):
    company: str
    title: str
    employment_type: EmploymentType | None
    location: str | None
    responsibilities: list[str]
    achievements: list[str]
    skills: list[str]


class ResumeParsingProjectExperience(_ResumeDatedModel):
    name: str
    role: str | None
    responsibilities: list[str]
    achievements: list[str]
    skills: list[str]
    project_url: str | None


class ResumeParsingOutput(BaseModel):
    summary: str | None
    education: list[ResumeParsingEducation]
    work_experiences: list[ResumeParsingWorkExperience]
    project_experiences: list[ResumeParsingProjectExperience]
    skills: list[str]
