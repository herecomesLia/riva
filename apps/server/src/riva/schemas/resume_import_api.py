from datetime import datetime
from typing import Literal, Self

from pydantic import ConfigDict, Field, ValidationError, model_validator

from riva.schemas.base import APIModel
from riva.schemas.job_description_parsing import AnalysisItemList
from riva.schemas.profile import (
    MAX_SECTION_ITEMS,
    MAX_SKILLS,
    CareerProfileEducationInput,
    CareerProfileProjectExperienceInput,
    CareerProfileResponse,
    CareerProfileSkillInput,
    CareerProfileWorkExperienceInput,
    StandardUUID,
    Summary,
)
from riva.schemas.resume_imports import (
    ResumeImportDraftData,
    ResumeImportProtectedSource,
    ResumeImportSection,
    ResumeImportSkipReason,
    ResumeImportSummaryAction,
)

ResumeImportDraftStatus = Literal["ready", "applied", "superseded"]


class _ResumeImportAPIModel(APIModel):
    model_config = ConfigDict(extra="forbid")


class ResumeImportSkippedItemResponse(_ResumeImportAPIModel):
    section: ResumeImportSection
    source_index: int = Field(ge=0)
    reasons: list[ResumeImportSkipReason] = Field(min_length=1)


class ResumeImportProtectedItemResponse(_ResumeImportAPIModel):
    section: ResumeImportSection
    item_id: StandardUUID
    source: ResumeImportProtectedSource


class ResumeImportChangeSummaryResponse(_ResumeImportAPIModel):
    new_items: int = Field(ge=0)
    changed_items: int = Field(ge=0)
    missing_items: int = Field(ge=0)


class ResumeImportDraftResponse(_ResumeImportAPIModel):
    resume_document_id: StandardUUID
    parsing_result_version: int = Field(ge=1)
    draft_version: int = Field(ge=1)
    status: ResumeImportDraftStatus

    base_profile_id: StandardUUID | None
    base_profile_version: int | None = Field(default=None, ge=1)

    applied_profile_version: int | None = Field(default=None, ge=1)
    applied_at: datetime | None
    can_apply: bool

    summary: Summary
    summary_action: ResumeImportSummaryAction
    education: list[CareerProfileEducationInput] = Field(max_length=MAX_SECTION_ITEMS)
    work_experiences: list[CareerProfileWorkExperienceInput] = Field(
        max_length=MAX_SECTION_ITEMS
    )
    project_experiences: list[CareerProfileProjectExperienceInput] = Field(
        max_length=MAX_SECTION_ITEMS
    )
    skills: list[CareerProfileSkillInput] = Field(max_length=MAX_SKILLS)
    unresolved_items: AnalysisItemList
    skipped_items: list[ResumeImportSkippedItemResponse]
    protected_items: list[ResumeImportProtectedItemResponse]
    change_summary: ResumeImportChangeSummaryResponse

    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def validate_state_and_contents(self) -> Self:
        _require_aware(self.created_at)
        _require_aware(self.updated_at)
        if self.applied_at is not None:
            _require_aware(self.applied_at)
        if self.updated_at < self.created_at:
            raise ValueError("updated_at cannot be before created_at")

        if (self.base_profile_id is None) != (self.base_profile_version is None):
            raise ValueError("base profile fields must be provided together")

        if self.summary_action == "set" and (
            self.summary is None or not self.summary.strip()
        ):
            raise ValueError("set drafts require a summary")
        if self.summary_action == "preserve" and self.summary is None:
            raise ValueError("preserve drafts require a summary")
        if self.summary_action == "none" and self.summary is not None:
            raise ValueError("none drafts cannot contain a summary")

        if self.status == "ready":
            if (
                not self.can_apply
                or self.applied_profile_version is not None
                or self.applied_at is not None
            ):
                raise ValueError("ready draft state is invalid")
        elif self.status == "applied":
            if (
                self.can_apply
                or self.applied_profile_version is None
                or self.applied_at is None
            ):
                raise ValueError("applied draft state is invalid")
        elif self.status == "superseded":
            if (
                self.can_apply
                or self.applied_profile_version is not None
                or self.applied_at is not None
            ):
                raise ValueError("superseded draft state is invalid")

        try:
            ResumeImportDraftData.model_validate(_draft_data_payload(self))
        except TypeError, ValueError, ValidationError:
            raise ValueError("draft contents are invalid") from None
        return self


class ResumeImportApplicationRequest(_ResumeImportAPIModel):
    draft_version: int = Field(ge=1)


class ResumeImportApplicationResponse(_ResumeImportAPIModel):
    draft: ResumeImportDraftResponse
    profile: CareerProfileResponse
    profile_created: bool
    profile_changed: bool


def _draft_data_payload(
    draft: ResumeImportDraftResponse,
) -> dict[str, object]:
    return {
        "summary": draft.summary,
        "summary_action": draft.summary_action,
        "education": _dump_models(draft.education),
        "work_experiences": _dump_models(draft.work_experiences),
        "project_experiences": _dump_models(draft.project_experiences),
        "skills": _dump_models(draft.skills),
        "unresolved_items": list(draft.unresolved_items),
        "skipped_items": _dump_models(draft.skipped_items),
        "protected_items": _dump_models(draft.protected_items),
        "change_summary": draft.change_summary.model_dump(
            mode="python",
            by_alias=False,
        ),
    }


def _dump_models(values: list[object]) -> list[object]:
    return [
        value.model_dump(mode="python", by_alias=False)
        if isinstance(value, APIModel)
        else value
        for value in values
    ]


def _require_aware(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamps must be timezone-aware")


__all__ = [
    "ResumeImportApplicationRequest",
    "ResumeImportApplicationResponse",
    "ResumeImportChangeSummaryResponse",
    "ResumeImportDraftResponse",
    "ResumeImportDraftStatus",
    "ResumeImportProtectedItemResponse",
    "ResumeImportSkippedItemResponse",
]
