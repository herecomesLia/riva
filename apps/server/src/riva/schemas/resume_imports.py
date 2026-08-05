from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from riva.schemas.job_description_parsing import AnalysisItemList
from riva.schemas.profile import (
    MAX_SECTION_ITEMS,
    MAX_SKILLS,
    CareerProfileEducationInput,
    CareerProfileProjectExperienceInput,
    CareerProfileSkillInput,
    CareerProfileWorkExperienceInput,
    StandardUUID,
    Summary as ProfileSummary,
)


ResumeImportSection = Literal[
    "education",
    "workExperience",
    "projectExperience",
    "skills",
    "summary",
]
ResumeImportSkipReason = Literal[
    "start_date_missing",
    "start_date_precision_insufficient",
    "end_date_missing",
    "end_date_precision_insufficient",
    "current_status_unknown",
    "employment_type_unknown",
    "profile_schema_invalid",
]


class _ResumeImportModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ResumeImportSkippedItem(_ResumeImportModel):
    section: ResumeImportSection
    source_index: int = Field(ge=0)
    reasons: list[ResumeImportSkipReason] = Field(min_length=1)

    @field_validator("reasons", mode="before")
    @classmethod
    def deduplicate_reasons(cls, value: object) -> object:
        if not isinstance(value, list):
            return value

        deduplicated: list[object] = []
        for reason in value:
            if reason not in deduplicated:
                deduplicated.append(reason)
        return deduplicated


class ResumeImportProtectedItem(_ResumeImportModel):
    section: ResumeImportSection
    item_id: StandardUUID
    source: Literal["userEdited", "userAdded"]


class ResumeImportChangeSummary(_ResumeImportModel):
    new_items: int = Field(ge=0)
    changed_items: int = Field(ge=0)
    missing_items: int = Field(ge=0)


class ResumeImportDraftData(_ResumeImportModel):
    summary: ProfileSummary
    summary_action: Literal["set", "preserve", "none"]
    education: list[CareerProfileEducationInput] = Field(
        max_length=MAX_SECTION_ITEMS
    )
    work_experiences: list[CareerProfileWorkExperienceInput] = Field(
        max_length=MAX_SECTION_ITEMS
    )
    project_experiences: list[CareerProfileProjectExperienceInput] = Field(
        max_length=MAX_SECTION_ITEMS
    )
    skills: list[CareerProfileSkillInput] = Field(max_length=MAX_SKILLS)
    unresolved_items: AnalysisItemList
    skipped_items: list[ResumeImportSkippedItem]
    protected_items: list[ResumeImportProtectedItem]
    change_summary: ResumeImportChangeSummary

    @model_validator(mode="after")
    def validate_draft_references(self) -> Self:
        for section in (
            self.education,
            self.work_experiences,
            self.project_experiences,
            self.skills,
        ):
            ids = [item.id for item in section]
            if len(ids) != len(set(ids)):
                raise ValueError("draft item ids must be unique within each section")

        skill_ids = {skill.id for skill in self.skills}
        referenced_skill_ids = {
            skill_id
            for experience in (*self.work_experiences, *self.project_experiences)
            for skill_id in experience.skill_ids
        }
        if not referenced_skill_ids <= skill_ids:
            raise ValueError("draft experience skill_ids must reference draft skills")

        skill_names = [skill.name.casefold() for skill in self.skills]
        if len(skill_names) != len(set(skill_names)):
            raise ValueError("draft skill names must be unique")

        protected_keys = [
            (item.section, item.item_id) for item in self.protected_items
        ]
        if len(protected_keys) != len(set(protected_keys)):
            raise ValueError("draft protected items must be unique")

        skipped_keys = [
            (item.section, item.source_index) for item in self.skipped_items
        ]
        if len(skipped_keys) != len(set(skipped_keys)):
            raise ValueError("draft skipped items must be unique")

        return self


__all__ = [
    "ResumeImportChangeSummary",
    "ResumeImportDraftData",
    "ResumeImportProtectedItem",
    "ResumeImportSection",
    "ResumeImportSkipReason",
    "ResumeImportSkippedItem",
]
