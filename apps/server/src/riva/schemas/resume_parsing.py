from typing import Annotated, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from riva.core.language import (
    DEFAULT_INTERACTION_LANGUAGE,
    InteractionLanguage,
)
from riva.schemas.job_description_parsing import AnalysisItemList
from riva.schemas.profile import (
    Bullet,
    EmploymentType,
    OptionalProjectUrl,
    OptionalText,
    RequiredText,
    StandardUUID,
)
from riva.schemas.profile import (
    Summary as ProfileSummary,
)

MAX_RESUME_TEXT_LENGTH = 100_000
MAX_RESUME_EDUCATION_ITEMS = 100
MAX_RESUME_WORK_EXPERIENCE_ITEMS = 100
MAX_RESUME_PROJECT_EXPERIENCE_ITEMS = 100
MAX_RESUME_EXPERIENCE_RESPONSIBILITIES = 100
MAX_RESUME_EXPERIENCE_ACHIEVEMENTS = 100
MAX_RESUME_EXPERIENCE_SKILLS = 100
MAX_RESUME_SKILLS = 200


def _normalize_text_list(value: object) -> object:
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


def _normalize_skill_list(value: object) -> object:
    if not isinstance(value, list):
        return value

    normalized: list[object] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            normalized.append(item)
            continue
        item = item.strip()
        if not item:
            continue
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
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


def _date_parts(value: str) -> tuple[int, int | None]:
    parts = value.split("-")
    return int(parts[0]), int(parts[1]) if len(parts) == 2 else None


def _validate_date_range(
    start_date: str | None,
    end_date: str | None,
) -> None:
    if start_date is None or end_date is None:
        return

    start_year, start_month = _date_parts(start_date)
    end_year, end_month = _date_parts(end_date)
    if end_year < start_year:
        raise ValueError("end_date cannot be before start_date")
    if (
        end_year == start_year
        and start_month is not None
        and end_month is not None
        and end_month < start_month
    ):
        raise ValueError("end_date cannot be before start_date")


ResumeText = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_RESUME_TEXT_LENGTH,
    ),
]
ResumeDate = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        pattern=r"^[0-9]{4}(?:-(?:0[1-9]|1[0-2]))?$",
    ),
]
SkillName = Annotated[
    RequiredText,
    BeforeValidator(_reject_uuid_skill_name),
]
BulletList = Annotated[
    list[Bullet],
    BeforeValidator(_normalize_text_list),
    Field(max_length=MAX_RESUME_EXPERIENCE_RESPONSIBILITIES),
]
AchievementList = Annotated[
    list[Bullet],
    BeforeValidator(_normalize_text_list),
    Field(max_length=MAX_RESUME_EXPERIENCE_ACHIEVEMENTS),
]
SkillList = Annotated[
    list[SkillName],
    BeforeValidator(_normalize_skill_list),
    Field(max_length=MAX_RESUME_EXPERIENCE_SKILLS),
]
TopLevelSkillList = Annotated[
    list[SkillName],
    BeforeValidator(_normalize_skill_list),
    Field(max_length=MAX_RESUME_SKILLS),
]


class _ResumeParsingModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _ResumeDatedModel(_ResumeParsingModel):
    start_date: ResumeDate | None
    end_date: ResumeDate | None
    is_current: bool | None

    @model_validator(mode="after")
    def validate_dates(self) -> Self:
        if self.is_current is True and self.end_date is not None:
            raise ValueError("current entries cannot have an end date")
        if self.end_date is not None and self.is_current is not False:
            raise ValueError("entries with an end date must not be current")
        _validate_date_range(self.start_date, self.end_date)
        return self


class ResumeParsingInput(_ResumeParsingModel):
    resume_text: ResumeText
    interaction_language: InteractionLanguage = DEFAULT_INTERACTION_LANGUAGE


class ResumeParsingEducation(_ResumeDatedModel):
    school: RequiredText
    degree: OptionalText
    major: OptionalText


class ResumeParsingWorkExperience(_ResumeDatedModel):
    company: RequiredText
    title: RequiredText
    employment_type: EmploymentType | None
    location: OptionalText
    responsibilities: BulletList
    achievements: AchievementList
    skills: SkillList = Field(
        description=(
            "Skills explicitly tied to this experience. Every item must "
            "also appear in the top-level skills list."
        )
    )


class ResumeParsingProjectExperience(_ResumeDatedModel):
    name: RequiredText
    role: OptionalText
    responsibilities: BulletList
    achievements: AchievementList
    skills: SkillList = Field(
        description=(
            "Skills explicitly tied to this experience. Every item must "
            "also appear in the top-level skills list."
        )
    )
    project_url: OptionalProjectUrl


class ResumeParsingOutput(_ResumeParsingModel):
    summary: ProfileSummary
    education: list[ResumeParsingEducation] = Field(
        max_length=MAX_RESUME_EDUCATION_ITEMS
    )
    work_experiences: list[ResumeParsingWorkExperience] = Field(
        max_length=MAX_RESUME_WORK_EXPERIENCE_ITEMS
    )
    project_experiences: list[ResumeParsingProjectExperience] = Field(
        max_length=MAX_RESUME_PROJECT_EXPERIENCE_ITEMS
    )
    skills: TopLevelSkillList = Field(
        description=(
            "Canonical set of all explicitly supported skills referenced "
            "anywhere in the parsed resume. Every experience-level skill "
            "must exist here."
        )
    )
    unresolved_items: AnalysisItemList

    @model_validator(mode="after")
    def normalize_and_validate_skill_references(self) -> Self:
        canonical_skills = {skill.casefold(): skill for skill in self.skills}

        for experience in (
            *self.work_experiences,
            *self.project_experiences,
        ):
            normalized: list[str] = []
            for skill in experience.skills:
                canonical = canonical_skills.get(skill.casefold())
                if canonical is None:
                    raise ValueError(
                        "experience skills must reference top-level skills"
                    )
                normalized.append(canonical)
            experience.skills = normalized
        return self


class ResumeParsingRunPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )

    resume_document_id: StandardUUID = Field(alias="resumeDocumentId")
    interaction_language: InteractionLanguage = Field(
        default=DEFAULT_INTERACTION_LANGUAGE,
        alias="interactionLanguage",
    )
