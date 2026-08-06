from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.models import (
    CareerProfile,
    CareerProfileEducation,
    CareerProfileProjectExperience,
    CareerProfileProjectSkill,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
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
    ProfileSource,
)
from riva.schemas.resume_imports import ResumeImportDraftData
from riva.services.resume_imports import (
    APPLIED,
    READY,
    RESUME_DOCUMENT_NOT_FOUND,
    RESUME_IMPORT_APPLY_CONFLICT,
    RESUME_IMPORT_DRAFT_INVALID,
    RESUME_IMPORT_DRAFT_NOT_FOUND,
    RESUME_IMPORT_DRAFT_NOT_READY,
    RESUME_IMPORT_DRAFT_VERSION_CONFLICT,
    RESUME_IMPORT_PROFILE_INVALID,
    RESUME_IMPORT_PROFILE_VERSION_CONFLICT,
    RESUME_PARSING_RESULT_NOT_FOUND,
    RESUME_PARSING_RESULT_SUPERSEDED,
    ResumeImportStateError,
    _parse_persisted_result,
    _require_aware_datetime,
    _validate_profile,
    build_resume_import_draft_data,
    canonicalize_resume_import_identity,
    resume_import_draft_data_from_model,
)
from riva.utils import utc_now


@dataclass(frozen=True)
class ResumeImportApplicationResult:
    profile: CareerProfile
    draft: ResumeImportDraft
    profile_created: bool
    profile_changed: bool


class ResumeImportApplicationService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        clock: Callable[[], datetime] = utc_now,
        profile_id_factory: Callable[[], UUID] = uuid4,
    ) -> None:
        self.session = session
        self.clock = clock
        self.profile_id_factory = profile_id_factory

    async def apply_draft(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
        draft_version: int,
    ) -> ResumeImportApplicationResult:
        try:
            _validate_requested_draft_version(draft_version)
            await self._lock_user(user_id)
            document = await self._load_document(user_id, resume_document_id)
            result = await self._load_result(user_id, resume_document_id)

            if document.parsing_run_id != result.source_agent_run_id:
                raise ResumeImportStateError(RESUME_PARSING_RESULT_SUPERSEDED)
            parsed_output = _parse_persisted_result(result)

            profile = await self._load_profile(user_id)
            draft = await self._load_draft(user_id, resume_document_id)
            if draft is None:
                raise ResumeImportStateError(RESUME_IMPORT_DRAFT_NOT_FOUND)

            _validate_draft_metadata(
                draft,
                user_id=user_id,
                resume_document_id=resume_document_id,
                draft_version=draft_version,
            )
            _validate_draft_status(draft.status)

            if draft.status == APPLIED:
                if (
                    draft.parsing_result_version != result.result_version
                    or draft.source_agent_run_id != result.source_agent_run_id
                ):
                    raise ResumeImportStateError(RESUME_IMPORT_APPLY_CONFLICT)
            elif (
                draft.parsing_result_version != result.result_version
                or draft.source_agent_run_id != result.source_agent_run_id
            ):
                raise ResumeImportStateError(RESUME_IMPORT_DRAFT_INVALID)

            draft_data = resume_import_draft_data_from_model(draft)

            if draft.status == APPLIED:
                _validate_summary_action(draft_data, profile_exists=True)
                _validate_applied_replay(draft, profile)
                if profile is not None:
                    _validate_profile(profile)
                await self.session.commit()
                await self.session.refresh(
                    profile,
                    attribute_names=["updated_at"],
                )
                return ResumeImportApplicationResult(
                    profile=profile,
                    draft=draft,
                    profile_created=False,
                    profile_changed=False,
                )

            _validate_ready_profile_snapshot(draft, profile)
            _validate_summary_action(
                draft_data,
                profile_exists=profile is not None,
            )
            _validate_recomputed_draft(
                user_id=user_id,
                parsed_output=parsed_output,
                profile=profile,
                persisted=draft_data,
            )

            profile_created = profile is None
            if profile is None:
                profile_id = self.profile_id_factory()
                if not isinstance(profile_id, UUID):
                    raise ResumeImportStateError(RESUME_IMPORT_APPLY_CONFLICT)
                profile = CareerProfile(
                    profile_id=profile_id,
                    user_id=user_id,
                    summary=None,
                    version=1,
                    education=[],
                    work_experiences=[],
                    project_experiences=[],
                    skills=[],
                )
                self.session.add(profile)

            before = _profile_business_snapshot(profile)
            apply_resume_import_draft_data(profile, draft_data)
            after = _profile_business_snapshot(profile)
            profile_changed = profile_created or before != after
            if profile_changed and not profile_created:
                profile.version += 1

            timestamp = self.clock()
            _require_aware_datetime(timestamp)
            draft.status = APPLIED
            draft.applied_profile_version = profile.version
            draft.applied_at = timestamp
            draft.updated_at = timestamp

            if profile_changed:
                await self._supersede_other_drafts(
                    user_id=user_id,
                    resume_document_id=resume_document_id,
                )

            await self.session.commit()
            await self.session.refresh(
                profile,
                attribute_names=["updated_at"],
            )
            return ResumeImportApplicationResult(
                profile=profile,
                draft=draft,
                profile_created=profile_created,
                profile_changed=profile_changed,
            )
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

    async def _supersede_other_drafts(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
    ) -> None:
        drafts = (
            await self.session.scalars(
                select(ResumeImportDraft)
                .where(
                    ResumeImportDraft.user_id == user_id,
                    ResumeImportDraft.resume_document_id != resume_document_id,
                    ResumeImportDraft.status == READY,
                )
                .with_for_update()
            )
        ).all()
        for draft in drafts:
            draft.status = "superseded"
            draft.applied_profile_version = None
            draft.applied_at = None


def apply_resume_import_draft_data(
    profile: CareerProfile,
    draft: ResumeImportDraftData,
) -> None:
    """Merge validated resume data into a loaded profile in place."""
    _validate_summary_action(draft, profile_exists=True)
    if draft.summary_action == "set":
        profile.summary = draft.summary

    draft_skill_ids = merge_resume_import_skills(profile, draft.skills)
    merge_resume_import_education(profile, draft.education)
    merge_resume_import_work_experiences(
        profile,
        draft.work_experiences,
        draft_skill_ids,
    )
    merge_resume_import_project_experiences(
        profile,
        draft.project_experiences,
        draft_skill_ids,
    )


def merge_resume_import_skills(
    profile: CareerProfile,
    draft_skills: list[CareerProfileSkillInput],
) -> dict[UUID, UUID]:
    current = list(profile.skills)
    _validate_current_items(current)
    current_by_name: dict[str, CareerProfileSkill] = {}
    current_ids: set[UUID] = set()
    for skill in current:
        key = canonicalize_resume_import_identity(skill.name)
        if key in current_by_name or skill.id in current_ids:
            raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID)
        current_by_name[key] = skill
        current_ids.add(skill.id)

    persisted_ids: dict[UUID, UUID] = {}
    appended: list[CareerProfileSkill] = []
    for draft_skill in draft_skills:
        key = canonicalize_resume_import_identity(draft_skill.name)
        existing = current_by_name.get(key)
        if existing is not None:
            if draft_skill.id in current_ids and draft_skill.id != existing.id:
                raise ResumeImportStateError(RESUME_IMPORT_APPLY_CONFLICT)
            persisted_ids[draft_skill.id] = existing.id
            if (
                _profile_source_value(existing.source)
                == ProfileSource.RESUME_EXTRACTED.value
            ):
                existing.name = draft_skill.name
                existing.normalized_name = key
            continue

        if draft_skill.id in current_ids:
            raise ResumeImportStateError(RESUME_IMPORT_APPLY_CONFLICT)
        skill = CareerProfileSkill(
            id=draft_skill.id,
            career_profile_id=profile.profile_id,
            position=0,
            name=draft_skill.name,
            normalized_name=key,
            source=ProfileSource.RESUME_EXTRACTED.value,
        )
        appended.append(skill)
        current_ids.add(skill.id)
        persisted_ids[draft_skill.id] = skill.id

    profile.skills = current + appended
    _reposition(profile.skills)
    return persisted_ids


def merge_resume_import_education(
    profile: CareerProfile,
    draft_education: list[CareerProfileEducationInput],
) -> None:
    current = list(profile.education)
    _validate_current_items(current)
    current_by_id = _current_by_id(current)
    merged = list(current)
    for item in draft_education:
        existing = current_by_id.get(item.id)
        if existing is None:
            merged.append(
                CareerProfileEducation(
                    id=item.id,
                    career_profile_id=profile.profile_id,
                    position=0,
                    school=item.school,
                    degree=item.degree,
                    major=item.major,
                    start_date=item.start_date,
                    end_date=item.end_date,
                    is_current=item.is_current,
                    source=ProfileSource.RESUME_EXTRACTED.value,
                )
            )
            continue
        if (
            _profile_source_value(existing.source)
            != ProfileSource.RESUME_EXTRACTED.value
        ):
            continue
        _update_education(existing, item)

    profile.education = merged
    _reposition(profile.education)


def merge_resume_import_work_experiences(
    profile: CareerProfile,
    draft_work_experiences: list[CareerProfileWorkExperienceInput],
    draft_skill_ids: dict[UUID, UUID],
) -> None:
    current = list(profile.work_experiences)
    _validate_current_items(current)
    current_by_id = _current_by_id(current)
    skills_by_id = {skill.id: skill for skill in profile.skills}
    merged = list(current)
    for item in draft_work_experiences:
        existing = current_by_id.get(item.id)
        if existing is None:
            experience = CareerProfileWorkExperience(
                id=item.id,
                career_profile_id=profile.profile_id,
                position=0,
                company=item.company,
                title=item.title,
                employment_type=item.employment_type.value,
                location=item.location,
                start_date=item.start_date,
                end_date=item.end_date,
                is_current=item.is_current,
                responsibilities=list(item.responsibilities),
                achievements=list(item.achievements),
                source=ProfileSource.RESUME_EXTRACTED.value,
            )
            experience.skill_links = reconcile_work_skill_links(
                profile_id=profile.profile_id,
                experience=experience,
                draft_skill_ids=item.skill_ids,
                persisted_skill_ids=draft_skill_ids,
                skills_by_id=skills_by_id,
            )
            merged.append(experience)
            continue
        if (
            _profile_source_value(existing.source)
            != ProfileSource.RESUME_EXTRACTED.value
        ):
            continue
        _update_work_experience(existing, item)
        existing.skill_links = reconcile_work_skill_links(
            profile_id=profile.profile_id,
            experience=existing,
            draft_skill_ids=item.skill_ids,
            persisted_skill_ids=draft_skill_ids,
            skills_by_id=skills_by_id,
        )

    profile.work_experiences = merged
    _reposition(profile.work_experiences)


def merge_resume_import_project_experiences(
    profile: CareerProfile,
    draft_project_experiences: list[CareerProfileProjectExperienceInput],
    draft_skill_ids: dict[UUID, UUID],
) -> None:
    current = list(profile.project_experiences)
    _validate_current_items(current)
    current_by_id = _current_by_id(current)
    skills_by_id = {skill.id: skill for skill in profile.skills}
    merged = list(current)
    for item in draft_project_experiences:
        existing = current_by_id.get(item.id)
        if existing is None:
            project = CareerProfileProjectExperience(
                id=item.id,
                career_profile_id=profile.profile_id,
                position=0,
                name=item.name,
                role=item.role,
                start_date=item.start_date,
                end_date=item.end_date,
                responsibilities=list(item.responsibilities),
                achievements=list(item.achievements),
                project_url=(
                    str(item.project_url) if item.project_url is not None else None
                ),
                source=ProfileSource.RESUME_EXTRACTED.value,
            )
            project.skill_links = reconcile_project_skill_links(
                profile_id=profile.profile_id,
                project=project,
                draft_skill_ids=item.skill_ids,
                persisted_skill_ids=draft_skill_ids,
                skills_by_id=skills_by_id,
            )
            merged.append(project)
            continue
        if (
            _profile_source_value(existing.source)
            != ProfileSource.RESUME_EXTRACTED.value
        ):
            continue
        _update_project_experience(existing, item)
        existing.skill_links = reconcile_project_skill_links(
            profile_id=profile.profile_id,
            project=existing,
            draft_skill_ids=item.skill_ids,
            persisted_skill_ids=draft_skill_ids,
            skills_by_id=skills_by_id,
        )

    profile.project_experiences = merged
    _reposition(profile.project_experiences)


def _validate_requested_draft_version(draft_version: object) -> None:
    if (
        not isinstance(draft_version, int)
        or isinstance(draft_version, bool)
        or draft_version < 1
    ):
        raise ResumeImportStateError(RESUME_IMPORT_DRAFT_VERSION_CONFLICT)


def _validate_draft_metadata(
    draft: ResumeImportDraft,
    *,
    user_id: UUID,
    resume_document_id: UUID,
    draft_version: int,
) -> None:
    if draft.draft_version != draft_version:
        raise ResumeImportStateError(RESUME_IMPORT_DRAFT_VERSION_CONFLICT)
    if (
        draft.user_id != user_id
        or draft.resume_document_id != resume_document_id
    ):
        raise ResumeImportStateError(RESUME_IMPORT_DRAFT_INVALID)


def _validate_draft_status(status: object) -> None:
    if status == "superseded":
        raise ResumeImportStateError(RESUME_IMPORT_DRAFT_NOT_READY)
    if status not in {READY, APPLIED}:
        raise ResumeImportStateError(RESUME_IMPORT_DRAFT_INVALID)


def _validate_recomputed_draft(
    *,
    user_id: UUID,
    parsed_output: object,
    profile: CareerProfile | None,
    persisted: ResumeImportDraftData,
) -> None:
    try:
        expected = build_resume_import_draft_data(
            user_id=user_id,
            result=parsed_output,
            profile=profile,
        )
    except ResumeImportStateError:
        raise
    except (TypeError, ValueError, ValidationError):
        raise ResumeImportStateError(RESUME_IMPORT_DRAFT_INVALID) from None
    if _stable_model_json(expected) != _stable_model_json(persisted):
        raise ResumeImportStateError(RESUME_IMPORT_DRAFT_INVALID)


def _stable_model_json(value: ResumeImportDraftData) -> str:
    return json.dumps(
        value.model_dump(mode="json", by_alias=False),
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _validate_ready_profile_snapshot(
    draft: ResumeImportDraft,
    profile: CareerProfile | None,
) -> None:
    if (draft.base_profile_id is None) != (draft.base_profile_version is None):
        raise ResumeImportStateError(RESUME_IMPORT_DRAFT_INVALID)
    if draft.base_profile_id is None:
        if profile is not None:
            raise ResumeImportStateError(RESUME_IMPORT_PROFILE_VERSION_CONFLICT)
        return
    if profile is None:
        raise ResumeImportStateError(RESUME_IMPORT_PROFILE_VERSION_CONFLICT)
    if (
        profile.profile_id != draft.base_profile_id
        or profile.version != draft.base_profile_version
    ):
        raise ResumeImportStateError(RESUME_IMPORT_PROFILE_VERSION_CONFLICT)


def _validate_applied_replay(
    draft: ResumeImportDraft,
    profile: CareerProfile | None,
) -> None:
    if profile is None:
        raise ResumeImportStateError(RESUME_IMPORT_APPLY_CONFLICT)
    if (draft.base_profile_id is None) != (draft.base_profile_version is None):
        raise ResumeImportStateError(RESUME_IMPORT_APPLY_CONFLICT)
    if (
        not isinstance(draft.applied_profile_version, int)
        or isinstance(draft.applied_profile_version, bool)
        or draft.applied_profile_version < 1
        or draft.applied_at is None
        or profile.version != draft.applied_profile_version
    ):
        raise ResumeImportStateError(RESUME_IMPORT_APPLY_CONFLICT)
    if (
        draft.base_profile_id is not None
        and profile.profile_id != draft.base_profile_id
    ):
        raise ResumeImportStateError(RESUME_IMPORT_APPLY_CONFLICT)


def _validate_summary_action(
    draft: ResumeImportDraftData,
    *,
    profile_exists: bool,
) -> None:
    if draft.summary_action == "set":
        if draft.summary is None or not draft.summary.strip():
            raise ResumeImportStateError(RESUME_IMPORT_DRAFT_INVALID)
    elif draft.summary_action == "preserve":
        if not profile_exists:
            raise ResumeImportStateError(RESUME_IMPORT_DRAFT_INVALID)
    elif draft.summary_action != "none":
        raise ResumeImportStateError(RESUME_IMPORT_DRAFT_INVALID)


def _profile_source_value(source: object) -> str:
    value = source.value if isinstance(source, ProfileSource) else source
    if value not in {
        ProfileSource.RESUME_EXTRACTED.value,
        ProfileSource.USER_EDITED.value,
        ProfileSource.USER_ADDED.value,
    }:
        raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID)
    return str(value)


def _validate_current_items(items: list[object]) -> None:
    ids: set[UUID] = set()
    for item in items:
        item_id = getattr(item, "id", None)
        if not isinstance(item_id, UUID) or item_id in ids:
            raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID)
        ids.add(item_id)
        _profile_source_value(getattr(item, "source", None))


def _current_by_id(items: list[object]) -> dict[UUID, object]:
    return {item.id: item for item in items}


def _reposition(items: list[object]) -> None:
    for position, item in enumerate(items):
        item.position = position


def _update_education(
    current: CareerProfileEducation,
    draft: CareerProfileEducationInput,
) -> None:
    current.school = draft.school
    current.degree = draft.degree
    current.major = draft.major
    current.start_date = draft.start_date
    current.end_date = draft.end_date
    current.is_current = draft.is_current


def _update_work_experience(
    current: CareerProfileWorkExperience,
    draft: CareerProfileWorkExperienceInput,
) -> None:
    current.company = draft.company
    current.title = draft.title
    current.employment_type = draft.employment_type.value
    current.location = draft.location
    current.start_date = draft.start_date
    current.end_date = draft.end_date
    current.is_current = draft.is_current
    current.responsibilities = list(draft.responsibilities)
    current.achievements = list(draft.achievements)


def _update_project_experience(
    current: CareerProfileProjectExperience,
    draft: CareerProfileProjectExperienceInput,
) -> None:
    current.name = draft.name
    current.role = draft.role
    current.start_date = draft.start_date
    current.end_date = draft.end_date
    current.responsibilities = list(draft.responsibilities)
    current.achievements = list(draft.achievements)
    current.project_url = (
        str(draft.project_url) if draft.project_url is not None else None
    )


def _mapped_skill_ids(
    draft_skill_ids: list[UUID],
    persisted_skill_ids: dict[UUID, UUID],
    skills_by_id: dict[UUID, CareerProfileSkill],
) -> list[UUID]:
    mapped: list[UUID] = []
    for draft_skill_id in draft_skill_ids:
        persisted_skill_id = persisted_skill_ids.get(draft_skill_id)
        if (
            not isinstance(persisted_skill_id, UUID)
            or persisted_skill_id not in skills_by_id
        ):
            raise ResumeImportStateError(RESUME_IMPORT_APPLY_CONFLICT)
        mapped.append(persisted_skill_id)
    return mapped


def reconcile_work_skill_links(
    *,
    profile_id: UUID,
    experience: CareerProfileWorkExperience,
    draft_skill_ids: list[UUID],
    persisted_skill_ids: dict[UUID, UUID],
    skills_by_id: dict[UUID, CareerProfileSkill],
) -> list[CareerProfileWorkSkill]:
    mapped_skill_ids = _mapped_skill_ids(
        draft_skill_ids,
        persisted_skill_ids,
        skills_by_id,
    )
    if len(mapped_skill_ids) != len(set(mapped_skill_ids)):
        raise ResumeImportStateError(RESUME_IMPORT_APPLY_CONFLICT)

    existing_by_skill_id: dict[UUID, CareerProfileWorkSkill] = {}
    experience_id = getattr(experience, "id", None)
    if not isinstance(profile_id, UUID) or not isinstance(experience_id, UUID):
        raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID)
    try:
        existing_links = list(experience.skill_links)
    except (AttributeError, TypeError):
        raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID) from None
    existing_link_ids: set[UUID] = set()
    for link in existing_links:
        link_id = getattr(link, "id", None)
        skill_id = getattr(link, "skill_id", None)
        if (
            not isinstance(link_id, UUID)
            or not isinstance(skill_id, UUID)
            or link_id in existing_link_ids
            or skill_id in existing_by_skill_id
            or skill_id not in skills_by_id
            or getattr(link, "work_experience_id", None) != experience_id
            or getattr(link, "career_profile_id", None) != profile_id
        ):
            raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID)
        existing_link_ids.add(link_id)
        existing_by_skill_id[skill_id] = link

    reconciled: list[CareerProfileWorkSkill] = []
    for position, skill_id in enumerate(mapped_skill_ids):
        link = existing_by_skill_id.get(skill_id)
        if link is None:
            link = CareerProfileWorkSkill(
                id=uuid4(),
                career_profile_id=profile_id,
                work_experience_id=experience_id,
                skill_id=skill_id,
            )
            link.skill = skills_by_id[skill_id]
        link.position = position
        reconciled.append(link)
    return reconciled


def reconcile_project_skill_links(
    *,
    profile_id: UUID,
    project: CareerProfileProjectExperience,
    draft_skill_ids: list[UUID],
    persisted_skill_ids: dict[UUID, UUID],
    skills_by_id: dict[UUID, CareerProfileSkill],
) -> list[CareerProfileProjectSkill]:
    mapped_skill_ids = _mapped_skill_ids(
        draft_skill_ids,
        persisted_skill_ids,
        skills_by_id,
    )
    if len(mapped_skill_ids) != len(set(mapped_skill_ids)):
        raise ResumeImportStateError(RESUME_IMPORT_APPLY_CONFLICT)

    existing_by_skill_id: dict[UUID, CareerProfileProjectSkill] = {}
    project_id = getattr(project, "id", None)
    if not isinstance(profile_id, UUID) or not isinstance(project_id, UUID):
        raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID)
    try:
        existing_links = list(project.skill_links)
    except (AttributeError, TypeError):
        raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID) from None
    existing_link_ids: set[UUID] = set()
    for link in existing_links:
        link_id = getattr(link, "id", None)
        skill_id = getattr(link, "skill_id", None)
        if (
            not isinstance(link_id, UUID)
            or not isinstance(skill_id, UUID)
            or link_id in existing_link_ids
            or skill_id in existing_by_skill_id
            or skill_id not in skills_by_id
            or getattr(link, "project_experience_id", None) != project_id
            or getattr(link, "career_profile_id", None) != profile_id
        ):
            raise ResumeImportStateError(RESUME_IMPORT_PROFILE_INVALID)
        existing_link_ids.add(link_id)
        existing_by_skill_id[skill_id] = link

    reconciled: list[CareerProfileProjectSkill] = []
    for position, skill_id in enumerate(mapped_skill_ids):
        link = existing_by_skill_id.get(skill_id)
        if link is None:
            link = CareerProfileProjectSkill(
                id=uuid4(),
                career_profile_id=profile_id,
                project_experience_id=project_id,
                skill_id=skill_id,
            )
            link.skill = skills_by_id[skill_id]
        link.position = position
        reconciled.append(link)
    return reconciled


def _profile_business_snapshot(
    profile: CareerProfile,
) -> tuple[object, ...]:
    return (
        profile.summary,
        tuple(
            (
                item.id,
                item.position,
                item.school,
                item.degree,
                item.major,
                item.start_date,
                item.end_date,
                item.is_current,
                _profile_source_value(item.source),
            )
            for item in profile.education
        ),
        tuple(
            (
                item.id,
                item.position,
                item.company,
                item.title,
                item.employment_type,
                item.location,
                item.start_date,
                item.end_date,
                item.is_current,
                tuple(item.responsibilities),
                tuple(item.achievements),
                tuple(link.skill_id for link in item.skill_links),
                _profile_source_value(item.source),
            )
            for item in profile.work_experiences
        ),
        tuple(
            (
                item.id,
                item.position,
                item.name,
                item.role,
                item.start_date,
                item.end_date,
                tuple(item.responsibilities),
                tuple(item.achievements),
                tuple(link.skill_id for link in item.skill_links),
                item.project_url,
                _profile_source_value(item.source),
            )
            for item in profile.project_experiences
        ),
        tuple(
            (
                item.id,
                item.position,
                item.name,
                item.normalized_name,
                _profile_source_value(item.source),
            )
            for item in profile.skills
        ),
    )


__all__ = [
    "ResumeImportApplicationResult",
    "ResumeImportApplicationService",
    "apply_resume_import_draft_data",
    "merge_resume_import_education",
    "merge_resume_import_project_experiences",
    "merge_resume_import_skills",
    "merge_resume_import_work_experiences",
    "reconcile_project_skill_links",
    "reconcile_work_skill_links",
]
