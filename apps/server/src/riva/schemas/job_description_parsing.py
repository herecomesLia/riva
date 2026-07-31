from typing import Annotated

from pydantic import BeforeValidator, BaseModel, ConfigDict, Field, StringConstraints

from riva.schemas.roles import MAX_RAW_JOB_DESCRIPTION_LENGTH


MAX_JOB_DESCRIPTION_ANALYSIS_ITEM_LENGTH = 1_000
MAX_JOB_DESCRIPTION_ANALYSIS_LIST_ITEMS = 100
MAX_JOB_DESCRIPTION_SUMMARY_LENGTH = 2_000


def _normalize_list_items(value: object) -> object:
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


def _normalize_optional_text(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


AnalysisItem = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_JOB_DESCRIPTION_ANALYSIS_ITEM_LENGTH,
    ),
]
AnalysisItemList = Annotated[
    list[AnalysisItem],
    BeforeValidator(_normalize_list_items),
    Field(max_length=MAX_JOB_DESCRIPTION_ANALYSIS_LIST_ITEMS),
]
Summary = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_JOB_DESCRIPTION_SUMMARY_LENGTH,
    ),
]
RoleTitle = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
]
Company = Annotated[
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


class QualificationRequirements(BaseModel):
    model_config = ConfigDict(extra="forbid")

    education: AnalysisItemList
    graduation_cohorts: AnalysisItemList
    majors: AnalysisItemList
    experience: AnalysisItemList
    languages: AnalysisItemList
    certifications: AnalysisItemList
    other: AnalysisItemList


class RequiredSkillGroups(BaseModel):
    model_config = ConfigDict(extra="forbid")

    programming_languages: AnalysisItemList
    frameworks_and_libraries: AnalysisItemList
    platforms: AnalysisItemList
    tools: AnalysisItemList
    concepts_and_methods: AnalysisItemList
    databases_and_middleware: AnalysisItemList
    other: AnalysisItemList


class JobDescriptionParsingOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    riva_summary: Summary
    responsibilities: AnalysisItemList
    qualification_requirements: QualificationRequirements
    required_skills: RequiredSkillGroups
    preferred_qualifications: AnalysisItemList
    soft_skills: AnalysisItemList
    business_domains: AnalysisItemList


class JobDescriptionParsingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role_title: RoleTitle
    company: Company
    raw_job_description: RawJobDescription
