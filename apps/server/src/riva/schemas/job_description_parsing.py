from typing import Annotated
from uuid import UUID

from pydantic import BeforeValidator, BaseModel, ConfigDict, Field, StringConstraints

from riva.schemas.base import MAX_RAW_JOB_DESCRIPTION_LENGTH


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

    education: AnalysisItemList = Field(
        description=(
            "Each item is one complete, independently understandable education "
            "requirement clause."
        )
    )
    graduation_cohorts: AnalysisItemList = Field(
        description=(
            "Each item is one complete, independently understandable "
            "graduation-cohort requirement clause."
        )
    )
    majors: AnalysisItemList = Field(
        description=(
            "Each item is one complete major or field-of-study requirement. "
            "Keep alternatives and qualifiers such as related fields in the same item."
        )
    )
    experience: AnalysisItemList = Field(
        description=(
            "Each item is one complete, independently understandable experience "
            "requirement clause."
        )
    )
    languages: AnalysisItemList = Field(
        description=(
            "Each item is one complete, independently understandable language "
            "requirement clause."
        )
    )
    certifications: AnalysisItemList = Field(
        description=(
            "Each item is one complete, independently understandable certification "
            "requirement clause."
        )
    )
    other: AnalysisItemList = Field(
        description=(
            "Each item is one complete, independently understandable qualification "
            "requirement clause."
        )
    )


class RequiredSkillGroups(BaseModel):
    model_config = ConfigDict(extra="forbid")

    programming_languages: AnalysisItemList = Field(
        description=(
            "Each item is one independent atomic hard-skill or technology entity."
        )
    )
    frameworks_and_libraries: AnalysisItemList = Field(
        description=(
            "Each item is one independent atomic hard-skill or technology entity."
        )
    )
    platforms: AnalysisItemList = Field(
        description=(
            "Each item is one independent atomic hard-skill or technology entity."
        )
    )
    tools: AnalysisItemList = Field(
        description=(
            "Each item is one independent atomic hard-skill or technology entity."
        )
    )
    concepts_and_methods: AnalysisItemList = Field(
        description=(
            "Each item is one independent atomic hard-skill or technology entity."
        )
    )
    databases_and_middleware: AnalysisItemList = Field(
        description=(
            "Each item is one independent atomic hard-skill or technology entity."
        )
    )
    other: AnalysisItemList = Field(
        description=(
            "Each item is one independent atomic hard-skill or technology entity."
        )
    )


class JobDescriptionParsingOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    riva_summary: Summary
    responsibilities: AnalysisItemList
    qualification_requirements: QualificationRequirements
    required_skills: RequiredSkillGroups
    preferred_qualifications: AnalysisItemList = Field(
        description=(
            "Each item is one complete preferred, bonus, or priority condition. "
            "Keep alternatives and qualifiers inside the same item."
        )
    )
    soft_skills: AnalysisItemList
    business_domains: AnalysisItemList


class JobDescriptionParsingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role_title: RoleTitle
    company: Company
    raw_job_description: RawJobDescription


class JobDescriptionParsingRunPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
    )

    role_id: UUID = Field(alias="roleId")
    job_description_version: int = Field(alias="jobDescriptionVersion", ge=1)
