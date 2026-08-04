from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import (
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from riva.schemas.base import APIModel, MAX_RAW_JOB_DESCRIPTION_LENGTH
from riva.schemas.job_description_parsing import (
    AnalysisItemList,
    Summary,
)
from riva.schemas.matching_analysis import MatchingAnalysisResultResponse


def _normalize_optional_text(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


RequiredText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
]
OptionalText = Annotated[
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
TargetRoleVersion = Annotated[int, Field(ge=1)]
DeleteTargetRoleVersion = TargetRoleVersion
ExperienceYears = Annotated[int, Field(ge=0)]


class RoleAPIModel(APIModel):
    model_config = ConfigDict(extra="forbid")


class TargetRoleRecruitmentType(StrEnum):
    CAMPUS = "campus"
    EXPERIENCED = "experienced"


class TargetRolePreparationStatus(StrEnum):
    PREPARING = "preparing"
    PAUSED = "paused"
    ARCHIVED = "archived"


class ActiveTargetRolePreparationStatus(StrEnum):
    PREPARING = "preparing"
    PAUSED = "paused"


class TargetRoleExperienceRange(RoleAPIModel):
    min_years: ExperienceYears | None
    max_years: ExperienceYears | None

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if self.min_years is None and self.max_years is None:
            raise ValueError("experience_range requires at least one bound")
        if (
            self.min_years is not None
            and self.max_years is not None
            and self.max_years < self.min_years
        ):
            raise ValueError("max_years cannot be less than min_years")
        return self


class MissingJobDescriptionResponse(RoleAPIModel):
    status: Literal["missing"]
    raw_text: None
    version: None
    parsing_failure_reason: None


class SavedJobDescriptionResponse(RoleAPIModel):
    status: Literal["saved"]
    raw_text: RawJobDescription
    version: TargetRoleVersion
    parsing_failure_reason: None


class ParsingJobDescriptionResponse(RoleAPIModel):
    status: Literal["parsing"]
    raw_text: RawJobDescription
    version: TargetRoleVersion
    parsing_failure_reason: None


class ReadyJobDescriptionResponse(RoleAPIModel):
    status: Literal["ready"]
    raw_text: RawJobDescription
    version: TargetRoleVersion
    parsing_failure_reason: None


class FailedJobDescriptionResponse(RoleAPIModel):
    status: Literal["failed"]
    raw_text: RawJobDescription
    version: TargetRoleVersion
    parsing_failure_reason: RequiredText


JobDescriptionResponse = Annotated[
    MissingJobDescriptionResponse
    | SavedJobDescriptionResponse
    | ParsingJobDescriptionResponse
    | ReadyJobDescriptionResponse
    | FailedJobDescriptionResponse,
    Field(discriminator="status"),
]


class QualificationRequirements(RoleAPIModel):
    education: AnalysisItemList
    graduation_cohorts: AnalysisItemList
    majors: AnalysisItemList
    experience: AnalysisItemList
    languages: AnalysisItemList
    certifications: AnalysisItemList
    other: AnalysisItemList


class RequiredSkillGroups(RoleAPIModel):
    programming_languages: AnalysisItemList
    frameworks_and_libraries: AnalysisItemList
    platforms: AnalysisItemList
    tools: AnalysisItemList
    concepts_and_methods: AnalysisItemList
    databases_and_middleware: AnalysisItemList
    other: AnalysisItemList


class JobDescriptionAnalysisResponse(RoleAPIModel):
    job_description_version: TargetRoleVersion
    analysis_version: TargetRoleVersion
    parsed_at: datetime
    riva_summary: Summary
    responsibilities: AnalysisItemList
    qualification_requirements: QualificationRequirements
    required_skills: RequiredSkillGroups
    preferred_qualifications: AnalysisItemList
    soft_skills: AnalysisItemList
    business_domains: AnalysisItemList


class MatchingAnalysisVersionContext(RoleAPIModel):
    profile_version: TargetRoleVersion
    job_description_version: TargetRoleVersion
    job_description_analysis_version: TargetRoleVersion


class GeneratingMatchingAnalysisResponse(MatchingAnalysisVersionContext):
    status: Literal["generating"]
    generated_at: None
    failure_reason: None
    result: None


class CurrentMatchingAnalysisResponse(MatchingAnalysisVersionContext):
    status: Literal["current"]
    generated_at: datetime
    failure_reason: None
    result: MatchingAnalysisResultResponse


class StaleMatchingAnalysisResponse(MatchingAnalysisVersionContext):
    status: Literal["stale"]
    generated_at: datetime
    failure_reason: None
    result: MatchingAnalysisResultResponse


class FailedMatchingAnalysisResponse(MatchingAnalysisVersionContext):
    status: Literal["failed"]
    generated_at: None
    failure_reason: RequiredText
    result: None


MatchingAnalysisResponse = Annotated[
    GeneratingMatchingAnalysisResponse
    | CurrentMatchingAnalysisResponse
    | StaleMatchingAnalysisResponse
    | FailedMatchingAnalysisResponse,
    Field(discriminator="status"),
]


class MissingProfileContext(RoleAPIModel):
    exists: Literal[False]
    version: None
    completed: Literal[False]


class ExistingProfileContext(RoleAPIModel):
    exists: Literal[True]
    version: TargetRoleVersion
    completed: bool


ProfileContext = Annotated[
    MissingProfileContext | ExistingProfileContext,
    Field(discriminator="exists"),
]


class TargetRoleResponse(RoleAPIModel):
    id: UUID
    title: RequiredText
    company: OptionalText
    recruitment_type: TargetRoleRecruitmentType | None
    location: OptionalText
    experience_range: TargetRoleExperienceRange | None
    preparation_status: TargetRolePreparationStatus
    created_at: datetime
    updated_at: datetime
    version: TargetRoleVersion
    job_description: JobDescriptionResponse
    job_description_analysis: JobDescriptionAnalysisResponse | None
    matching_analysis: MatchingAnalysisResponse | None

    @model_validator(mode="after")
    def validate_job_description_analysis(self) -> Self:
        if self.job_description.status == "ready":
            if self.job_description_analysis is None:
                raise ValueError("ready job description requires analysis")
            if (
                self.job_description.version
                != self.job_description_analysis.job_description_version
            ):
                raise ValueError(
                    "ready job description and analysis versions must match"
                )
        elif self.job_description_analysis is not None:
            raise ValueError(
                "non-ready job description cannot include analysis"
            )
        matching = self.matching_analysis
        if matching is not None and matching.status == "current":
            if self.job_description.status != "ready":
                raise ValueError(
                    "current matching analysis requires ready job description"
                )
            if self.job_description_analysis is None:
                raise ValueError(
                    "current matching analysis requires job description analysis"
                )
            if (
                matching.job_description_version
                != self.job_description.version
            ):
                raise ValueError(
                    "current matching analysis and job description versions must match"
                )
            if (
                matching.job_description_analysis_version
                != self.job_description_analysis.analysis_version
            ):
                raise ValueError(
                    "current matching analysis and job description analysis versions must match"
                )
        return self


class RolesPageResponse(RoleAPIModel):
    roles: list[TargetRoleResponse]
    current_role_id: UUID | None
    profile_context: ProfileContext

    @model_validator(mode="after")
    def validate_current_role(self) -> Self:
        if self.current_role_id is not None:
            current_role = next(
                (role for role in self.roles if role.id == self.current_role_id),
                None,
            )
            if current_role is None:
                raise ValueError("current_role_id must reference a role in roles")
            if current_role.preparation_status is TargetRolePreparationStatus.ARCHIVED:
                raise ValueError(
                    "current_role_id cannot reference an archived role"
                )

        for role in self.roles:
            matching = role.matching_analysis
            if matching is None or matching.status != "current":
                continue
            if not self.profile_context.exists:
                raise ValueError(
                    "current matching analysis requires existing profile context"
                )
            if matching.profile_version != self.profile_context.version:
                raise ValueError(
                    "current matching analysis and profile context versions must match"
                )
        return self


class TargetRoleDetailsRequest(RoleAPIModel):
    title: RequiredText
    company: OptionalText
    recruitment_type: TargetRoleRecruitmentType | None
    location: OptionalText
    experience_range: TargetRoleExperienceRange | None


class CreateTargetRoleRequest(TargetRoleDetailsRequest):
    preparation_status: ActiveTargetRolePreparationStatus


class UpdateTargetRoleRequest(TargetRoleDetailsRequest):
    version: TargetRoleVersion


class SetCurrentTargetRoleRequest(RoleAPIModel):
    version: TargetRoleVersion


class UpdatePreparationStatusRequest(RoleAPIModel):
    version: TargetRoleVersion
    preparation_status: ActiveTargetRolePreparationStatus


class ArchiveTargetRoleRequest(RoleAPIModel):
    version: TargetRoleVersion


class SaveJobDescriptionRequest(RoleAPIModel):
    version: TargetRoleVersion
    raw_text: RawJobDescription


class StartJobDescriptionParsingRequest(RoleAPIModel):
    version: TargetRoleVersion
    job_description_version: TargetRoleVersion


class JobDescriptionParsingStatusQuery(RoleAPIModel):
    version: TargetRoleVersion
    job_description_version: TargetRoleVersion


class StartMatchingAnalysisRequest(RoleAPIModel):
    version: TargetRoleVersion


class MatchingAnalysisStatusQuery(RoleAPIModel):
    version: TargetRoleVersion


class UpdateJobDescriptionAnalysisListModuleRequest(RoleAPIModel):
    version: TargetRoleVersion
    job_description_version: TargetRoleVersion
    analysis_version: TargetRoleVersion
    field: Literal[
        "responsibilities",
        "preferredQualifications",
        "softSkills",
        "businessDomains",
    ]
    value: AnalysisItemList


class UpdateJobDescriptionAnalysisQualificationRequirementsRequest(
    RoleAPIModel
):
    version: TargetRoleVersion
    job_description_version: TargetRoleVersion
    analysis_version: TargetRoleVersion
    field: Literal["qualificationRequirements"]
    value: QualificationRequirements


class UpdateJobDescriptionAnalysisRequiredSkillsRequest(RoleAPIModel):
    version: TargetRoleVersion
    job_description_version: TargetRoleVersion
    analysis_version: TargetRoleVersion
    field: Literal["requiredSkills"]
    value: RequiredSkillGroups


UpdateJobDescriptionAnalysisModuleRequest = Annotated[
    UpdateJobDescriptionAnalysisListModuleRequest
    | UpdateJobDescriptionAnalysisQualificationRequirementsRequest
    | UpdateJobDescriptionAnalysisRequiredSkillsRequest,
    Field(discriminator="field"),
]
