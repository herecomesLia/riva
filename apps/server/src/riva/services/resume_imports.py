from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Callable
from copy import deepcopy
from datetime import datetime
from typing import Literal, cast
from uuid import UUID, uuid5

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.models import (
    CareerProfile,
    CareerProfileEducation,
    CareerProfileProjectExperience,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    ResumeDocument,
    ResumeImportDraft,
    ResumeParsingResult,
    User,
)
from riva.schemas.profile import (
    CareerProfileEducationInput,
    CareerProfileProjectExperienceInput,
    CareerProfileSkillInput,
    CareerProfileWorkExperienceInput,
    EmploymentType,
    ProfileSource,
)
from riva.schemas.resume_imports import (
    ResumeImportChangeSummary,
    ResumeImportDraftData,
    ResumeImportProtectedItem,
    ResumeImportSection,
    ResumeImportSkipReason,
    ResumeImportSkippedItem,
)
from riva.schemas.resume_parsing import ResumeParsingOutput
from riva.utils import utc_now


ResumeImportStateErrorCode = Literal[
    "resume_document_not_found",
    "resume_parsing_result_not_found",
    "resume_parsing_result_invalid",
    "resume_parsing_result_superseded",
    "resume_import_profile_invalid",
    "resume_import_draft_conflict",
    "resume_import_draft_not_found",
    "resume_import_draft_not_ready",
    "resume_import_draft_version_conflict",
    "resume_import_draft_invalid",
    "resume_import_profile_version_conflict",
    "resume_import_apply_conflict",
]

RESUME_DOCUMENT_NOT_FOUND: ResumeImportStateErrorCode = (
    "resume_document_not_found"
)
RESUME_PARSING_RESULT_NOT_FOUND: ResumeImportStateErrorCode = (
    "resume_parsing_result_not_found"
)
RESUME_PARSING_RESULT_INVALID: ResumeImportStateErrorCode = (
    "resume_parsing_result_invalid"
)
RESUME_PARSING_RESULT_SUPERSEDED: ResumeImportStateErrorCode = (
    "resume_parsing_result_superseded"
)
RESUME_IMPORT_PROFILE_INVALID: ResumeImportStateErrorCode = (
    "resume_import_profile_invalid"
)
RESUME_IMPORT_DRAFT_CONFLICT: ResumeImportStateErrorCode = (
    "resume_import_draft_conflict"
)
RESUME_IMPORT_DRAFT_NOT_FOUND: ResumeImportStateErrorCode = (
    "resume_import_draft_not_found"
)
RESUME_IMPORT_DRAFT_NOT_READY: ResumeImportStateErrorCode = (
    "resume_import_draft_not_ready"
)
RESUME_IMPORT_DRAFT_VERSION_CONFLICT: ResumeImportStateErrorCode = (
    "resume_import_draft_version_conflict"
)
RESUME_IMPORT_DRAFT_INVALID: ResumeImportStateErrorCode = (
    "resume_import_draft_invalid"
)
RESUME_IMPORT_PROFILE_VERSION_CONFLICT: ResumeImportStateErrorCode = (
    "resume_import_profile_version_conflict"
)
RESUME_IMPORT_APPLY_CONFLICT: ResumeImportStateErrorCode = (
    "resume_import_apply_conflict"
)

READY = "ready"
APPLIED = "applied"
SUPERSEDED = "superseded"

RESUME_IMPORT_NAMESPACE = UUID("6c0f5d7b-7dcb-4d8f-9f67-6f2b8a8f1f41")

_YEAR_PATTERN = re.compile(r"^[0-9]{4}$")
_MONTH_PATTERN = re.compile(r"^[0-9]{4}-(?:0[1-9]|1[0-2])$")
_SECTION_ORDER = {
    "education": 0,
    "workExperience": 1,
    "projectExperience": 2,
    "skills": 3,
}


class ResumeImportStateError(RuntimeError):
    safe_message = "The resume import state is invalid."

    def __init__(self, code: ResumeImportStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


def resume_import_draft_data_from_model(
    draft: ResumeImportDraft,
) -> ResumeImportDraftData:
    """Validate and convert persisted draft JSON into the domain model."""
    try:
        return ResumeImportDraftData.model_validate(
            {
                "summary": draft.summary,
                "summary_action": draft.summary_action,
                "education": draft.education,
                "work_experiences": draft.work_experiences,
                "project_experiences": draft.project_experiences,
                "skills": draft.skills,
                "unresolved_items": draft.unresolved_items,
                "skipped_items": draft.skipped_items,
                "protected_items": draft.protected_items,
                "change_summary": draft.change_summary,
            }
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise ResumeImportStateError(RESUME_IMPORT_DRAFT_INVALID) from None


def canonicalize_resume_import_identity(value: str | None) -> str:
    """Return the stable text form used by import identities."""
    if value is None:
        return ""
    if not isinstance(value, str):
        raise TypeError("identity components must be strings or None")
    normalized = unicodedata.normalize("NFC", value)
    normalized = re.sub(r"\s+", " ", normalized.strip())
    return normalized.casefold()


def build_resume_import_item_id(
    *,
    user_id: UUID,
    section: ResumeImportSection,
    identity_key: str,
    occurrence: int,
) -> UUID:
    """Build the stable ID used by a resume import candidate."""
    if occurrence < 0:
        raise ValueError("occurrence must be non-negative")
    if not isinstance(identity_key, str):
        raise TypeError("identity_key must be a string")

    name = json.dumps(
        [str(user_id), section, identity_key, occurrence],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return uuid5(RESUME_IMPORT_NAMESPACE, name)


def build_resume_import_draft_data(
    *,
    user_id: UUID,
    result: ResumeParsingOutput,
    profile: CareerProfile | None,
) -> ResumeImportDraftData:
    """Convert a validated parsing output into an import-only draft."""
    _validate_profile(profile)

    skill_ids_by_name: dict[str, UUID] = {}
    skills: list[CareerProfileSkillInput] = []
    identity_occurrences: dict[tuple[str, str], int] = {}

    for skill_name in result.skills:
        skill_key = canonicalize_resume_import_identity(skill_name)
        if skill_key in skill_ids_by_name:
            continue
        skill_id = _next_item_id(
            user_id=user_id,
            section="skills",
            identity_key=skill_key,
            occurrences=identity_occurrences,
        )
        try:
            skill = CareerProfileSkillInput(id=skill_id, name=skill_name)
        except (TypeError, ValueError, ValidationError):
            raise ResumeImportStateError(RESUME_PARSING_RESULT_INVALID) from None
        skill_ids_by_name[skill_key] = skill_id
        skills.append(skill)

    skipped_items: list[ResumeImportSkippedItem] = []
    education: list[CareerProfileEducationInput] = []
    for source_index, item in enumerate(result.education):
        identity_key = _identity_key(
            item.school,
            item.degree,
            item.major,
            item.start_date,
            item.end_date,
            item.is_current,
        )
        item_id = _next_item_id(
            user_id=user_id,
            section="education",
            identity_key=identity_key,
            occurrences=identity_occurrences,
        )
        reasons = _education_work_date_reasons(item)
        if reasons:
            skipped_items.append(
                _skipped_item("education", source_index, reasons)
            )
            continue

        try:
            education.append(
                CareerProfileEducationInput(
                    id=item_id,
                    school=item.school,
                    degree=item.degree,
                    major=item.major,
                    start_date=cast(str, item.start_date),
                    end_date=cast(str | None, item.end_date),
                    is_current=cast(bool, item.is_current),
                )
            )
        except (TypeError, ValueError, ValidationError):
            skipped_items.append(
                _skipped_item(
                    "education",
                    source_index,
                    ["profile_schema_invalid"],
                )
            )

    work_experiences: list[CareerProfileWorkExperienceInput] = []
    for source_index, item in enumerate(result.work_experiences):
        identity_key = _identity_key(
            item.company,
            item.title,
            item.start_date,
            item.end_date,
            item.is_current,
        )
        item_id = _next_item_id(
            user_id=user_id,
            section="workExperience",
            identity_key=identity_key,
            occurrences=identity_occurrences,
        )
        reasons = _education_work_date_reasons(item)
        if item.employment_type is None:
            reasons = _append_reason(reasons, "employment_type_unknown")
        if reasons:
            skipped_items.append(
                _skipped_item("workExperience", source_index, reasons)
            )
            continue

        try:
            work_experiences.append(
                CareerProfileWorkExperienceInput(
                    id=item_id,
                    company=item.company,
                    title=item.title,
                    employment_type=cast(EmploymentType, item.employment_type),
                    location=item.location,
                    start_date=cast(str, item.start_date),
                    end_date=cast(str | None, item.end_date),
                    is_current=cast(bool, item.is_current),
                    responsibilities=list(item.responsibilities),
                    achievements=list(item.achievements),
                    skill_ids=_skill_ids(
                        item.skills,
                        skill_ids_by_name,
                    ),
                )
            )
        except ResumeImportStateError:
            raise
        except (TypeError, ValueError, ValidationError):
            skipped_items.append(
                _skipped_item(
                    "workExperience",
                    source_index,
                    ["profile_schema_invalid"],
                )
            )

    project_experiences: list[CareerProfileProjectExperienceInput] = []
    for source_index, item in enumerate(result.project_experiences):
        identity_key = _identity_key(
            item.name,
            item.role,
            item.start_date,
            item.end_date,
            item.is_current,
        )
        item_id = _next_item_id(
            user_id=user_id,
            section="projectExperience",
            identity_key=identity_key,
            occurrences=identity_occurrences,
        )
        reasons = _project_date_reasons(item)
        if reasons:
            skipped_items.append(
                _skipped_item("projectExperience", source_index, reasons)
            )
            continue

        try:
            project_experiences.append(
                CareerProfileProjectExperienceInput(
                    id=item_id,
                    name=item.name,
                    role=item.role,
                    start_date=cast(str, item.start_date),
                    end_date=cast(str | None, item.end_date),
                    responsibilities=list(item.responsibilities),
                    achievements=list(item.achievements),
                    skill_ids=_skill_ids(
                        item.skills,
                        skill_ids_by_name,
                    ),
                    project_url=item.project_url,
                )
            )
        except ResumeImportStateError:
            raise
        except (TypeError, ValueError, ValidationError):
            skipped_items.append(
                _skipped_item(
                    "projectExperience",
                    source_index,
                    ["profile_schema_invalid"],
                )
            )

    protected_items = _protected_items(
        profile,
        education,
        work_experiences,
        project_experiences,
        skills,
    )
    change_summary = _change_summary(
        profile,
        education,
        work_experiences,
        project_experiences,
        skills,
    )

    summary_action: Literal["set", "preserve", "none"]
    if result.summary is None:
        summary_action = "none"
    elif profile is None or profile.summary is None or not profile.summary.strip():
        summary_action = "set"
    else:
        summary_action = "preserve"

    return ResumeImportDraftData(
        summary=result.summary,
        summary_action=summary_action,
        education=education,
        work_experiences=work_experiences,
        project_experiences=project_experiences,
        skills=skills,
        unresolved_items=list(result.unresolved_items),
        skipped_items=skipped_items,
        protected_items=protected_items,
        change_summary=change_summary,
    )


class ResumeImportDraftService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.clock = clock

    async def build_draft(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
    ) -> ResumeImportDraft:
        try:
            await self._lock_user(user_id)
            document = await self._load_document(user_id, resume_document_id)
            result = await self._load_result(user_id, document.id)

            if document.parsing_run_id != result.source_agent_run_id:
                raise ResumeImportStateError(RESUME_PARSING_RESULT_SUPERSEDED)
            parsed_output = _parse_persisted_result(result)

            profile = await self._load_profile(user_id)
            draft = await self._load_draft(user_id, document.id)
            if draft is not None and _same_draft_source(draft, result, profile):
                if draft.status in (READY, APPLIED):
                    await self.session.commit()
                    return draft
                if draft.status not in (SUPERSEDED,):
                    raise ResumeImportStateError(RESUME_IMPORT_DRAFT_CONFLICT)

            if draft is None:
                conflict = await self._find_source_conflict(
                    result.source_agent_run_id,
                    document.id,
                )
                if conflict is not None:
                    raise ResumeImportStateError(RESUME_IMPORT_DRAFT_CONFLICT)

            data = build_resume_import_draft_data(
                user_id=user_id,
                result=parsed_output,
                profile=profile,
            )
            timestamp = self.clock()
            _require_aware_datetime(timestamp)
            values = data.model_dump(mode="json", by_alias=False)

            if draft is None:
                draft = ResumeImportDraft(
                    resume_document_id=document.id,
                    user_id=user_id,
                    parsing_result_version=result.result_version,
                    source_agent_run_id=result.source_agent_run_id,
                    base_profile_id=(
                        profile.profile_id if profile is not None else None
                    ),
                    base_profile_version=profile.version if profile else None,
                    draft_version=1,
                    status=READY,
                    summary=cast(str | None, values["summary"]),
                    summary_action=cast(str, values["summary_action"]),
                    education=_copy_json_list(values["education"]),
                    work_experiences=_copy_json_list(
                        values["work_experiences"]
                    ),
                    project_experiences=_copy_json_list(
                        values["project_experiences"]
                    ),
                    skills=_copy_json_list(values["skills"]),
                    unresolved_items=_copy_string_list(
                        values["unresolved_items"]
                    ),
                    skipped_items=_copy_json_list(values["skipped_items"]),
                    protected_items=_copy_json_list(
                        values["protected_items"]
                    ),
                    change_summary=_copy_json_dict(values["change_summary"]),
                    applied_profile_version=None,
                    applied_at=None,
                    created_at=timestamp,
                    updated_at=timestamp,
                )
                self.session.add(draft)
            else:
                conflict = await self._find_source_conflict(
                    result.source_agent_run_id,
                    document.id,
                )
                if conflict is not None:
                    raise ResumeImportStateError(RESUME_IMPORT_DRAFT_CONFLICT)

                draft.parsing_result_version = result.result_version
                draft.source_agent_run_id = result.source_agent_run_id
                draft.base_profile_id = (
                    profile.profile_id if profile is not None else None
                )
                draft.base_profile_version = profile.version if profile else None
                draft.draft_version += 1
                draft.status = READY
                draft.summary = cast(str | None, values["summary"])
                draft.summary_action = cast(str, values["summary_action"])
                draft.education = _copy_json_list(values["education"])
                draft.work_experiences = _copy_json_list(
                    values["work_experiences"]
                )
                draft.project_experiences = _copy_json_list(
                    values["project_experiences"]
                )
                draft.skills = _copy_json_list(values["skills"])
                draft.unresolved_items = _copy_string_list(
                    values["unresolved_items"]
                )
                draft.skipped_items = _copy_json_list(values["skipped_items"])
                draft.protected_items = _copy_json_list(
                    values["protected_items"]
                )
                draft.change_summary = _copy_json_dict(values["change_summary"])
                draft.applied_profile_version = None
                draft.applied_at = None
                draft.updated_at = timestamp

            await self.session.commit()
            return draft
        except BaseException:
            await self.session.rollback()
            raise

    async def _lock_user(self, user_id: UUID) -> None:
        user = await self.session.scalar(
            select(User.id).where(User.id == user_id).with_for_update()
        )
        if user is None:
            raise ResumeImportStateError(RESUME_DOCUMENT_NOT_FOUND)

    async def _load_document(
        self,
        user_id: UUID,
        resume_document_id: UUID,
    ) -> ResumeDocument:
        document = await self.session.scalar(
            select(ResumeDocument)
            .where(
                ResumeDocument.user_id == user_id,
                ResumeDocument.id == resume_document_id,
            )
            .with_for_update()
        )
        if document is None:
            raise ResumeImportStateError(RESUME_DOCUMENT_NOT_FOUND)
        if document.user_id != user_id or document.id != resume_document_id:
            raise ResumeImportStateError(RESUME_DOCUMENT_NOT_FOUND)
        return document

    async def _load_result(
        self,
        user_id: UUID,
        resume_document_id: UUID,
    ) -> ResumeParsingResult:
        result = await self.session.scalar(
            select(ResumeParsingResult)
            .where(
                ResumeParsingResult.user_id == user_id,
                ResumeParsingResult.resume_document_id == resume_document_id,
            )
            .with_for_update()
        )
        if result is None:
            raise ResumeImportStateError(RESUME_PARSING_RESULT_NOT_FOUND)
        if result.user_id != user_id or result.resume_document_id != resume_document_id:
            raise ResumeImportStateError(RESUME_PARSING_RESULT_NOT_FOUND)
        return result

    async def _load_profile(self, user_id: UUID) -> CareerProfile | None:
        return await self.session.scalar(
            select(CareerProfile)
            .options(
                selectinload(CareerProfile.education),
                selectinload(CareerProfile.skills),
                selectinload(CareerProfile.work_experiences).selectinload(
                    CareerProfileWorkExperience.skill_links
                ),
                selectinload(CareerProfile.project_experiences).selectinload(
                    CareerProfileProjectExperience.skill_links
                ),
            )
            .where(CareerProfile.user_id == user_id)
            .with_for_update()
        )

    async def _load_draft(
        self,
        user_id: UUID,
        resume_document_id: UUID,
    ) -> ResumeImportDraft | None:
        return await self.session.scalar(
            select(ResumeImportDraft)
            .where(
                ResumeImportDraft.user_id == user_id,
                ResumeImportDraft.resume_document_id == resume_document_id,
            )
            .with_for_update()
        )

    async def _find_source_conflict(
        self,
        source_agent_run_id: UUID,
        resume_document_id: UUID,
    ) -> ResumeImportDraft | None:
        return await self.session.scalar(
            select(ResumeImportDraft)
            .where(
                ResumeImportDraft.source_agent_run_id == source_agent_run_id,
                ResumeImportDraft.resume_document_id != resume_document_id,
            )
            .with_for_update()
        )


def _parse_persisted_result(result: ResumeParsingResult) -> ResumeParsingOutput:
    if not isinstance(result.result_version, int) or isinstance(
        result.result_version, bool
    ) or result.result_version < 1:
        raise ResumeImportStateError(RESUME_PARSING_RESULT_INVALID)

    try:
        return ResumeParsingOutput.model_validate(
            {
                "summary": result.summary,
                "education": result.education,
                "work_experiences": result.work_experiences,
                "project_experiences": result.project_experiences,
                "skills": result.skills,
                "unresolved_items": result.unresolved_items,
            }
        )
    except (TypeError, ValueError, ValidationError):
        raise ResumeImportStateError(RESUME_PARSING_RESULT_INVALID) from None


def _require_aware_datetime(value: object) -> None:
    if not isinstance(value, datetime):
        raise ValueError("clock must return a datetime")
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")


def _same_draft_source(
    draft: ResumeImportDraft,
    result: ResumeParsingResult,
    profile: CareerProfile | None,
) -> bool:
    parsing_source_matches = (
        draft.parsing_result_version == result.result_version
        and draft.source_agent_run_id == result.source_agent_run_id
    )

    if draft.status == READY:
        return parsing_source_matches and (
            draft.base_profile_id == (profile.profile_id if profile else None)
            and draft.base_profile_version == (profile.version if profile else None)
        )

    if draft.status == APPLIED:
        if (
            profile is None
            or not isinstance(draft.applied_profile_version, int)
            or isinstance(draft.applied_profile_version, bool)
            or draft.applied_profile_version < 1
        ):
            raise ResumeImportStateError(RESUME_IMPORT_DRAFT_CONFLICT)
        if (
            draft.base_profile_id is not None
            and profile.profile_id != draft.base_profile_id
        ):
            raise ResumeImportStateError(RESUME_IMPORT_DRAFT_CONFLICT)

        return parsing_source_matches and (
            profile.version == draft.applied_profile_version
        )

    if draft.status == SUPERSEDED:
        return False

    raise ResumeImportStateError(RESUME_IMPORT_DRAFT_CONFLICT)


def _copy_json_list(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        raise ResumeImportStateError(RESUME_PARSING_RESULT_INVALID)
    return cast(list[dict[str, object]], deepcopy(value))


def _copy_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        raise ResumeImportStateError(RESUME_PARSING_RESULT_INVALID)
    return cast(list[str], deepcopy(value))


def _copy_json_dict(value: object) -> dict[str, int]:
    if not isinstance(value, dict):
        raise ResumeImportStateError(RESUME_PARSING_RESULT_INVALID)
    return cast(dict[str, int], deepcopy(value))


def _identity_key(*values: object) -> str:
    canonical_values: list[object] = []
    for value in values:
        if value is None or isinstance(value, str):
            canonical_values.append(canonicalize_resume_import_identity(value))
        elif isinstance(value, bool):
            canonical_values.append(value)
        else:
            raise ValueError("identity components must be scalar values")
    return json.dumps(
        canonical_values,
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _next_item_id(
    *,
    user_id: UUID,
    section: ResumeImportSection,
    identity_key: str,
    occurrences: dict[tuple[str, str], int],
) -> UUID:
    occurrence_key = (section, identity_key)
    occurrence = occurrences.get(occurrence_key, 0)
    occurrences[occurrence_key] = occurrence + 1
    return build_resume_import_item_id(
        user_id=user_id,
        section=section,
        identity_key=identity_key,
        occurrence=occurrence,
    )


def _skill_ids(
    skill_names: list[str],
    skill_ids_by_name: dict[str, UUID],
) -> list[UUID]:
    ids: list[UUID] = []
    for skill_name in skill_names:
        skill_key = canonicalize_resume_import_identity(skill_name)
        skill_id = skill_ids_by_name.get(skill_key)
        if skill_id is None:
            raise ResumeImportStateError(RESUME_PARSING_RESULT_INVALID)
        if skill_id not in ids:
            ids.append(skill_id)
    return ids


def _append_reason(
    reasons: list[ResumeImportSkipReason],
    reason: ResumeImportSkipReason,
) -> list[ResumeImportSkipReason]:
    if reason not in reasons:
        return [*reasons, reason]
    return reasons


def _date_reason(
    value: object,
    *,
    missing: ResumeImportSkipReason,
    precision: ResumeImportSkipReason,
) -> ResumeImportSkipReason | None:
    if value is None:
        return missing
    if not isinstance(value, str):
        return "profile_schema_invalid"
    if _MONTH_PATTERN.fullmatch(value):
        return None
    if _YEAR_PATTERN.fullmatch(value):
        return precision
    return "profile_schema_invalid"


def _education_work_date_reasons(item: object) -> list[ResumeImportSkipReason]:
    reasons: list[ResumeImportSkipReason] = []
    start_date = getattr(item, "start_date", None)
    end_date = getattr(item, "end_date", None)
    is_current = getattr(item, "is_current", None)

    start_reason = _date_reason(
        start_date,
        missing="start_date_missing",
        precision="start_date_precision_insufficient",
    )
    if start_reason is not None:
        reasons = _append_reason(reasons, start_reason)

    if is_current is None or not isinstance(is_current, bool):
        reasons = _append_reason(reasons, "current_status_unknown")
    elif is_current:
        if end_date is not None:
            reasons = _append_reason(reasons, "profile_schema_invalid")
    elif end_date is None:
        reasons = _append_reason(reasons, "end_date_missing")
    else:
        end_reason = _date_reason(
            end_date,
            missing="end_date_missing",
            precision="end_date_precision_insufficient",
        )
        if end_reason is not None:
            reasons = _append_reason(reasons, end_reason)

    if (
        isinstance(start_date, str)
        and isinstance(end_date, str)
        and _MONTH_PATTERN.fullmatch(start_date)
        and _MONTH_PATTERN.fullmatch(end_date)
        and end_date < start_date
    ):
        reasons = _append_reason(reasons, "profile_schema_invalid")
    return reasons


def _project_date_reasons(item: object) -> list[ResumeImportSkipReason]:
    reasons: list[ResumeImportSkipReason] = []
    start_date = getattr(item, "start_date", None)
    end_date = getattr(item, "end_date", None)
    is_current = getattr(item, "is_current", None)

    start_reason = _date_reason(
        start_date,
        missing="start_date_missing",
        precision="start_date_precision_insufficient",
    )
    if start_reason is not None:
        reasons = _append_reason(reasons, start_reason)

    end_reason = _date_reason(
        end_date,
        missing="end_date_missing",
        precision="end_date_precision_insufficient",
    )
    if end_date is not None and end_reason is not None:
        reasons = _append_reason(reasons, end_reason)

    if is_current is True and end_date is not None:
        reasons = _append_reason(reasons, "profile_schema_invalid")
    if (
        isinstance(start_date, str)
        and isinstance(end_date, str)
        and _MONTH_PATTERN.fullmatch(start_date)
        and _MONTH_PATTERN.fullmatch(end_date)
        and end_date < start_date
    ):
        reasons = _append_reason(reasons, "profile_schema_invalid")
    return reasons


def _skipped_item(
    section: ResumeImportSection,
    source_index: int,
    reasons: list[ResumeImportSkipReason],
) -> ResumeImportSkippedItem:
    return ResumeImportSkippedItem(
        section=section,
        source_index=source_index,
        reasons=reasons,
    )


def _validate_profile(profile: CareerProfile | None) -> None:
    if profile is None:
        return

    try:
        if profile.summary is not None and not isinstance(profile.summary, str):
            raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID)

        sections = (
            profile.education,
            profile.work_experiences,
            profile.project_experiences,
            profile.skills,
        )
        for section in sections:
            ids = [item.id for item in section]
            if len(ids) != len(set(ids)):
                raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID)
            for item in section:
                _profile_source(item.source)

        skill_names = [
            canonicalize_resume_import_identity(skill.name)
            for skill in profile.skills
        ]
        if len(skill_names) != len(set(skill_names)):
            raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID)

        skill_ids = {skill.id for skill in profile.skills}
        for experience in (*profile.work_experiences, *profile.project_experiences):
            link_ids = [link.skill_id for link in experience.skill_links]
            if len(link_ids) != len(set(link_ids)) or not set(link_ids) <= skill_ids:
                raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID)
    except ResumeImportStateError:
        raise
    except (AttributeError, TypeError, ValueError):
        raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID) from None


def _profile_source(source: object) -> str:
    value = source.value if isinstance(source, ProfileSource) else source
    if value not in {
        ProfileSource.RESUME_EXTRACTED.value,
        ProfileSource.USER_EDITED.value,
        ProfileSource.USER_ADDED.value,
    }:
        raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID)
    return cast(str, value)


def _protected_items(
    profile: CareerProfile | None,
    education: list[CareerProfileEducationInput],
    work_experiences: list[CareerProfileWorkExperienceInput],
    project_experiences: list[CareerProfileProjectExperienceInput],
    skills: list[CareerProfileSkillInput],
) -> list[ResumeImportProtectedItem]:
    if profile is None:
        return []

    protected: list[ResumeImportProtectedItem] = []
    current_by_id = {
        "education": {item.id: item for item in profile.education},
        "workExperience": {
            item.id: item for item in profile.work_experiences
        },
        "projectExperience": {
            item.id: item for item in profile.project_experiences
        },
    }
    draft_skill_names = {
        canonicalize_resume_import_identity(item.name) for item in skills
    }
    draft_skill_names_by_id = {
        item.id: canonicalize_resume_import_identity(item.name)
        for item in skills
    }
    for section, candidates in (
        ("education", education),
        ("workExperience", work_experiences),
        ("projectExperience", project_experiences),
    ):
        for candidate in candidates:
            current = current_by_id[section].get(candidate.id)
            if current is not None and _profile_source(current.source) in {
                ProfileSource.USER_EDITED.value,
                ProfileSource.USER_ADDED.value,
            }:
                protected.append(
                    ResumeImportProtectedItem(
                        section=section,
                        item_id=candidate.id,
                        source=_profile_source(current.source),
                    )
                )

    current_by_skill_name = {
        canonicalize_resume_import_identity(item.name): item
        for item in profile.skills
    }
    for candidate in skills:
        current = current_by_skill_name.get(
            canonicalize_resume_import_identity(candidate.name)
        )
        if current is not None and _profile_source(current.source) in {
            ProfileSource.USER_EDITED.value,
            ProfileSource.USER_ADDED.value,
        }:
            protected.append(
                ResumeImportProtectedItem(
                    section="skills",
                    item_id=current.id,
                    source=_profile_source(current.source),
                )
            )

    return sorted(
        protected,
        key=lambda item: (_SECTION_ORDER[item.section], str(item.item_id)),
    )


def _change_summary(
    profile: CareerProfile | None,
    education: list[CareerProfileEducationInput],
    work_experiences: list[CareerProfileWorkExperienceInput],
    project_experiences: list[CareerProfileProjectExperienceInput],
    skills: list[CareerProfileSkillInput],
) -> ResumeImportChangeSummary:
    if profile is None:
        return ResumeImportChangeSummary(
            new_items=(
                len(education)
                + len(work_experiences)
                + len(project_experiences)
                + len(skills)
            ),
            changed_items=0,
            missing_items=0,
        )

    new_items = 0
    changed_items = 0

    current_by_id = {
        "education": {item.id: item for item in profile.education},
        "workExperience": {
            item.id: item for item in profile.work_experiences
        },
        "projectExperience": {
            item.id: item for item in profile.project_experiences
        },
    }
    draft_skill_names = {
        canonicalize_resume_import_identity(item.name) for item in skills
    }
    draft_skill_names_by_id = {
        item.id: canonicalize_resume_import_identity(item.name)
        for item in skills
    }
    for section, candidates in (
        ("education", education),
        ("workExperience", work_experiences),
        ("projectExperience", project_experiences),
    ):
        for candidate in candidates:
            current = current_by_id[section].get(candidate.id)
            if current is None:
                new_items += 1
            elif _profile_source(current.source) == ProfileSource.RESUME_EXTRACTED.value:
                if _candidate_changed(
                    section,
                    current,
                    candidate,
                    profile,
                    draft_skill_names_by_id,
                ):
                    changed_items += 1

    current_by_skill_name = {
        canonicalize_resume_import_identity(item.name): item
        for item in profile.skills
    }
    for candidate in skills:
        current = current_by_skill_name.get(
            canonicalize_resume_import_identity(candidate.name)
        )
        if current is None:
            new_items += 1
        elif _profile_source(current.source) == ProfileSource.RESUME_EXTRACTED.value:
            if current.name != candidate.name:
                changed_items += 1

    missing_items = 0
    for section, current_items in (
        ("education", profile.education),
        ("workExperience", profile.work_experiences),
        ("projectExperience", profile.project_experiences),
    ):
        candidate_ids = {
            item.id
            for item in {
                "education": education,
                "workExperience": work_experiences,
                "projectExperience": project_experiences,
            }[section]
        }
        missing_items += sum(
            1
            for item in current_items
            if _profile_source(item.source)
            == ProfileSource.RESUME_EXTRACTED.value
            and item.id not in candidate_ids
        )
    missing_items += sum(
        1
        for item in profile.skills
        if _profile_source(item.source) == ProfileSource.RESUME_EXTRACTED.value
        and canonicalize_resume_import_identity(item.name)
        not in draft_skill_names
    )

    return ResumeImportChangeSummary(
        new_items=new_items,
        changed_items=changed_items,
        missing_items=missing_items,
    )


def _candidate_changed(
    section: str,
    current: object,
    candidate: object,
    profile: CareerProfile,
    draft_skill_names_by_id: dict[UUID, str],
) -> bool:
    skill_names_by_id = {
        item.id: canonicalize_resume_import_identity(item.name)
        for item in profile.skills
    }
    if section == "education":
        current_item = cast(CareerProfileEducation, current)
        candidate_item = cast(CareerProfileEducationInput, candidate)
        return (
            current_item.school,
            current_item.degree,
            current_item.major,
            current_item.start_date,
            current_item.end_date,
            current_item.is_current,
        ) != (
            candidate_item.school,
            candidate_item.degree,
            candidate_item.major,
            candidate_item.start_date,
            candidate_item.end_date,
            candidate_item.is_current,
        )
    if section == "workExperience":
        current_item = cast(CareerProfileWorkExperience, current)
        candidate_item = cast(CareerProfileWorkExperienceInput, candidate)
        return (
            current_item.company,
            current_item.title,
            current_item.employment_type,
            current_item.location,
            current_item.start_date,
            current_item.end_date,
            current_item.is_current,
            list(current_item.responsibilities),
            list(current_item.achievements),
            _current_skill_names(current_item, skill_names_by_id),
        ) != (
            candidate_item.company,
            candidate_item.title,
            candidate_item.employment_type.value,
            candidate_item.location,
            candidate_item.start_date,
            candidate_item.end_date,
            candidate_item.is_current,
            list(candidate_item.responsibilities),
            list(candidate_item.achievements),
            [
                draft_skill_names_by_id.get(skill_id, "")
                for skill_id in candidate_item.skill_ids
            ],
        )
    current_item = cast(CareerProfileProjectExperience, current)
    candidate_item = cast(CareerProfileProjectExperienceInput, candidate)
    return (
        current_item.name,
        current_item.role,
        current_item.start_date,
        current_item.end_date,
        list(current_item.responsibilities),
        list(current_item.achievements),
        _current_skill_names(current_item, skill_names_by_id),
        current_item.project_url,
    ) != (
        candidate_item.name,
        candidate_item.role,
        candidate_item.start_date,
        candidate_item.end_date,
        list(candidate_item.responsibilities),
        list(candidate_item.achievements),
        [
            draft_skill_names_by_id.get(skill_id, "")
            for skill_id in candidate_item.skill_ids
        ],
        str(candidate_item.project_url)
        if candidate_item.project_url is not None
        else None,
    )


def _current_skill_names(
    experience: CareerProfileWorkExperience | CareerProfileProjectExperience,
    skill_names_by_id: dict[UUID, str],
) -> list[str]:
    names: list[str] = []
    for link in experience.skill_links:
        name = skill_names_by_id.get(link.skill_id)
        if name is None:
            raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID)
        names.append(name)
    return names


__all__ = [
    "APPLIED",
    "READY",
    "RESUME_DOCUMENT_NOT_FOUND",
    "RESUME_IMPORT_DRAFT_CONFLICT",
    "RESUME_IMPORT_DRAFT_INVALID",
    "RESUME_IMPORT_DRAFT_NOT_FOUND",
    "RESUME_IMPORT_DRAFT_NOT_READY",
    "RESUME_IMPORT_DRAFT_VERSION_CONFLICT",
    "RESUME_IMPORT_APPLY_CONFLICT",
    "RESUME_IMPORT_NAMESPACE",
    "RESUME_IMPORT_PROFILE_INVALID",
    "RESUME_IMPORT_PROFILE_VERSION_CONFLICT",
    "RESUME_PARSING_RESULT_INVALID",
    "RESUME_PARSING_RESULT_NOT_FOUND",
    "RESUME_PARSING_RESULT_SUPERSEDED",
    "ResumeImportDraftService",
    "ResumeImportStateError",
    "build_resume_import_draft_data",
    "build_resume_import_item_id",
    "canonicalize_resume_import_identity",
    "resume_import_draft_data_from_model",
]
