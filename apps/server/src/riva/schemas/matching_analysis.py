from typing import Annotated, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StrictInt,
    model_validator,
)

from riva.core.language import (
    DEFAULT_INTERACTION_LANGUAGE,
    InteractionLanguage,
)
from riva.schemas.base import APIModel
from riva.schemas.job_description_parsing import (
    AnalysisItemList,
    Company,
    JobDescriptionParsingOutput,
    RoleTitle,
    Summary,
)
from riva.schemas.profile import (
    Bullet,
    EmploymentType,
    Month,
    OptionalText,
    RequiredText,
)
from riva.schemas.profile import (
    Summary as ProfileSummary,
)

MAX_MATCHING_EDUCATION_ITEMS = 20
MAX_MATCHING_WORK_EXPERIENCE_ITEMS = 20
MAX_MATCHING_PROJECT_EXPERIENCE_ITEMS = 20
MAX_MATCHING_EXPERIENCE_RESPONSIBILITIES = 20
MAX_MATCHING_EXPERIENCE_ACHIEVEMENTS = 20
MAX_MATCHING_EXPERIENCE_SKILLS = 100
MAX_MATCHING_PROFILE_SKILLS = 200


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


def _reject_uuid_skill_name(value: object) -> object:
    if not isinstance(value, str):
        return value

    candidate = value.strip()
    try:
        parsed = UUID(candidate)
    except ValueError:
        return value
    if str(parsed) == candidate.lower():
        raise ValueError("skills must contain names, not UUIDs")
    return value


MatchingSkillName = Annotated[
    RequiredText,
    BeforeValidator(_reject_uuid_skill_name),
]
MatchingBulletList = Annotated[
    list[Bullet],
    BeforeValidator(_normalize_bullets),
    Field(max_length=MAX_MATCHING_EXPERIENCE_RESPONSIBILITIES),
]
MatchingAchievementList = Annotated[
    list[Bullet],
    BeforeValidator(_normalize_bullets),
    Field(max_length=MAX_MATCHING_EXPERIENCE_ACHIEVEMENTS),
]
MatchingExperienceSkillList = Annotated[
    list[MatchingSkillName],
    Field(max_length=MAX_MATCHING_EXPERIENCE_SKILLS),
]
MatchingProfileSkillList = Annotated[
    list[MatchingSkillName],
    Field(max_length=MAX_MATCHING_PROFILE_SKILLS),
]
OverallMatchScore = Annotated[StrictInt, Field(ge=0, le=100)]


class _MatchingInputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _MatchingCurrentDatedModel(_MatchingInputModel):
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


class MatchingProfileEducation(_MatchingCurrentDatedModel):
    school: RequiredText
    degree: OptionalText
    major: OptionalText


class MatchingProfileWorkExperience(_MatchingCurrentDatedModel):
    company: RequiredText
    title: RequiredText
    employment_type: EmploymentType
    location: OptionalText
    responsibilities: MatchingBulletList
    achievements: MatchingAchievementList
    skills: MatchingExperienceSkillList


class MatchingProfileProjectExperience(_MatchingInputModel):
    name: RequiredText
    role: OptionalText
    start_date: Month
    end_date: Month | None
    responsibilities: MatchingBulletList
    achievements: MatchingAchievementList
    skills: MatchingExperienceSkillList

    @model_validator(mode="after")
    def validate_date_range(self) -> Self:
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self


class MatchingCareerProfile(_MatchingInputModel):
    summary: ProfileSummary
    education: Annotated[
        list[MatchingProfileEducation],
        Field(max_length=MAX_MATCHING_EDUCATION_ITEMS),
    ]
    work_experiences: Annotated[
        list[MatchingProfileWorkExperience],
        Field(max_length=MAX_MATCHING_WORK_EXPERIENCE_ITEMS),
    ]
    project_experiences: Annotated[
        list[MatchingProfileProjectExperience],
        Field(max_length=MAX_MATCHING_PROJECT_EXPERIENCE_ITEMS),
    ]
    skills: MatchingProfileSkillList


class MatchingJobContext(_MatchingInputModel):
    role_title: RoleTitle
    company: Company
    job_description_analysis: JobDescriptionParsingOutput


class MatchingAnalysisInput(_MatchingInputModel):
    career_profile: MatchingCareerProfile
    job: MatchingJobContext
    interaction_language: InteractionLanguage = DEFAULT_INTERACTION_LANGUAGE


class MatchingAnalysisOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overall_match_score: OverallMatchScore
    core_requirements_summary: Summary
    matched_capabilities: AnalysisItemList
    missing_capabilities: AnalysisItemList
    underrepresented_capabilities: AnalysisItemList
    resume_highlights: AnalysisItemList
    resume_gaps: AnalysisItemList
    high_risk_questions: AnalysisItemList
    preparation_recommendations: AnalysisItemList


class MatchingAnalysisResultResponse(APIModel):
    model_config = ConfigDict(extra="forbid")

    overall_match_score: OverallMatchScore
    core_requirements_summary: Summary
    matched_capabilities: AnalysisItemList
    missing_capabilities: AnalysisItemList
    underrepresented_capabilities: AnalysisItemList
    resume_highlights: AnalysisItemList
    resume_gaps: AnalysisItemList
    high_risk_questions: AnalysisItemList
    preparation_recommendations: AnalysisItemList
