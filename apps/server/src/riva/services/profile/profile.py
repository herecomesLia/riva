from uuid import UUID, uuid4

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
    User,
)
from riva.services.errors import DomainConflictError
from riva.services.profile.types import (
    CareerProfileEducationInput,
    CareerProfileProjectExperienceInput,
    CareerProfilePutRequest,
    CareerProfileSkillInput,
    CareerProfileWorkExperienceInput,
    ProfileSource,
)


class CareerProfileService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_profile(self, user: User) -> CareerProfile | None:
        return await self._find_by_user_id(user.id)

    async def replace_profile(
        self,
        user: User,
        payload: CareerProfilePutRequest,
    ) -> CareerProfile:
        try:
            await self._lock_user(user.id)
            profile = await self._find_by_user_id(user.id, for_update=True)
            self._validate_version(profile, payload.version)

            if profile is None:
                profile = CareerProfile(
                    profile_id=uuid4(),
                    user_id=user.id,
                    summary=payload.summary,
                    version=1,
                )
                self.session.add(profile)
            else:
                profile.summary = payload.summary
                profile.version += 1

            self._sync_skills(profile, payload.skills)
            self._sync_education(profile, payload.education)
            self._sync_work_experiences(profile, payload.work_experiences)
            self._sync_project_experiences(
                profile,
                payload.project_experiences,
            )

            await self.session.commit()
            await self.session.refresh(profile, attribute_names=["updated_at"])
            return profile
        except Exception:
            await self.session.rollback()
            raise

    async def _lock_user(self, user_id: UUID) -> None:
        await self.session.execute(
            select(User.id).where(User.id == user_id).with_for_update()
        )

    async def _find_by_user_id(
        self,
        user_id: UUID,
        *,
        for_update: bool = False,
    ) -> CareerProfile | None:
        statement = (
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
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    @staticmethod
    def _validate_version(
        profile: CareerProfile | None,
        requested_version: int | None,
    ) -> None:
        if (
            (profile is None and requested_version is not None)
            or (profile is not None and requested_version is None)
            or (
                profile is not None
                and requested_version is not None
                and profile.version != requested_version
            )
        ):
            raise DomainConflictError("profile_version_conflict")

    @staticmethod
    def _sync_skills(
        profile: CareerProfile,
        requested: list[CareerProfileSkillInput],
    ) -> None:
        existing = {skill.id: skill for skill in profile.skills}
        synchronized: list[CareerProfileSkill] = []

        for position, item in enumerate(requested):
            skill = existing.get(item.id)
            if skill is None:
                skill = CareerProfileSkill(
                    id=item.id,
                    career_profile_id=profile.profile_id,
                    source=ProfileSource.USER_ADDED.value,
                )
            else:
                skill.source = _source_after_change(
                    skill.source,
                    skill.name != item.name,
                )

            skill.position = position
            skill.name = item.name
            skill.normalized_name = item.name.casefold()
            synchronized.append(skill)

        profile.skills = synchronized

    @staticmethod
    def _sync_education(
        profile: CareerProfile,
        requested: list[CareerProfileEducationInput],
    ) -> None:
        existing = {item.id: item for item in profile.education}
        synchronized: list[CareerProfileEducation] = []

        for position, item in enumerate(requested):
            education = existing.get(item.id)
            if education is None:
                education = CareerProfileEducation(
                    id=item.id,
                    career_profile_id=profile.profile_id,
                    source=ProfileSource.USER_ADDED.value,
                )
            else:
                education.source = _source_after_change(
                    education.source,
                    _education_changed(education, item),
                )

            education.position = position
            education.school = item.school
            education.degree = item.degree
            education.major = item.major
            education.start_date = item.start_date
            education.end_date = item.end_date
            education.is_current = item.is_current
            synchronized.append(education)

        profile.education = synchronized

    @staticmethod
    def _sync_work_experiences(
        profile: CareerProfile,
        requested: list[CareerProfileWorkExperienceInput],
    ) -> None:
        existing = {item.id: item for item in profile.work_experiences}
        skills = {skill.id: skill for skill in profile.skills}
        synchronized: list[CareerProfileWorkExperience] = []

        for position, item in enumerate(requested):
            experience = existing.get(item.id)
            if experience is None:
                experience = CareerProfileWorkExperience(
                    id=item.id,
                    career_profile_id=profile.profile_id,
                    source=ProfileSource.USER_ADDED.value,
                )
            else:
                experience.source = _source_after_change(
                    experience.source,
                    _work_experience_changed(experience, item),
                )

            experience.position = position
            experience.company = item.company
            experience.title = item.title
            experience.employment_type = item.employment_type.value
            experience.location = item.location
            experience.start_date = item.start_date
            experience.end_date = item.end_date
            experience.is_current = item.is_current
            experience.responsibilities = list(item.responsibilities)
            experience.achievements = list(item.achievements)
            experience.skill_links = _sync_work_skill_links(
                profile.profile_id,
                experience,
                item.skill_ids,
                skills,
            )
            synchronized.append(experience)

        profile.work_experiences = synchronized

    @staticmethod
    def _sync_project_experiences(
        profile: CareerProfile,
        requested: list[CareerProfileProjectExperienceInput],
    ) -> None:
        existing = {item.id: item for item in profile.project_experiences}
        skills = {skill.id: skill for skill in profile.skills}
        synchronized: list[CareerProfileProjectExperience] = []

        for position, item in enumerate(requested):
            project = existing.get(item.id)
            if project is None:
                project = CareerProfileProjectExperience(
                    id=item.id,
                    career_profile_id=profile.profile_id,
                    source=ProfileSource.USER_ADDED.value,
                )
            else:
                project.source = _source_after_change(
                    project.source,
                    _project_experience_changed(project, item),
                )

            project.position = position
            project.name = item.name
            project.role = item.role
            project.start_date = item.start_date
            project.end_date = item.end_date
            project.responsibilities = list(item.responsibilities)
            project.achievements = list(item.achievements)
            project.project_url = (
                str(item.project_url) if item.project_url is not None else None
            )
            project.skill_links = _sync_project_skill_links(
                profile.profile_id,
                project,
                item.skill_ids,
                skills,
            )
            synchronized.append(project)

        profile.project_experiences = synchronized


def _source_after_change(source: str, changed: bool) -> str:
    if source == ProfileSource.RESUME_EXTRACTED.value and changed:
        return ProfileSource.USER_EDITED.value
    return source


def _education_changed(
    current: CareerProfileEducation,
    requested: CareerProfileEducationInput,
) -> bool:
    return (
        current.school,
        current.degree,
        current.major,
        current.start_date,
        current.end_date,
        current.is_current,
    ) != (
        requested.school,
        requested.degree,
        requested.major,
        requested.start_date,
        requested.end_date,
        requested.is_current,
    )


def _work_experience_changed(
    current: CareerProfileWorkExperience,
    requested: CareerProfileWorkExperienceInput,
) -> bool:
    return (
        current.company,
        current.title,
        current.employment_type,
        current.location,
        current.start_date,
        current.end_date,
        current.is_current,
        current.responsibilities,
        current.achievements,
        current.skill_ids,
    ) != (
        requested.company,
        requested.title,
        requested.employment_type.value,
        requested.location,
        requested.start_date,
        requested.end_date,
        requested.is_current,
        requested.responsibilities,
        requested.achievements,
        requested.skill_ids,
    )


def _project_experience_changed(
    current: CareerProfileProjectExperience,
    requested: CareerProfileProjectExperienceInput,
) -> bool:
    return (
        current.name,
        current.role,
        current.start_date,
        current.end_date,
        current.responsibilities,
        current.achievements,
        current.skill_ids,
        current.project_url,
    ) != (
        requested.name,
        requested.role,
        requested.start_date,
        requested.end_date,
        requested.responsibilities,
        requested.achievements,
        requested.skill_ids,
        str(requested.project_url) if requested.project_url is not None else None,
    )


def _sync_work_skill_links(
    profile_id: UUID,
    experience: CareerProfileWorkExperience,
    requested_skill_ids: list[UUID],
    skills: dict[UUID, CareerProfileSkill],
) -> list[CareerProfileWorkSkill]:
    existing = {link.skill_id: link for link in experience.skill_links}
    synchronized: list[CareerProfileWorkSkill] = []

    for position, skill_id in enumerate(requested_skill_ids):
        link = existing.get(skill_id)
        if link is None:
            link = CareerProfileWorkSkill(
                id=uuid4(),
                career_profile_id=profile_id,
                work_experience_id=experience.id,
                skill_id=skill_id,
            )
        link.position = position
        link.skill = skills[skill_id]
        synchronized.append(link)

    return synchronized


def _sync_project_skill_links(
    profile_id: UUID,
    project: CareerProfileProjectExperience,
    requested_skill_ids: list[UUID],
    skills: dict[UUID, CareerProfileSkill],
) -> list[CareerProfileProjectSkill]:
    existing = {link.skill_id: link for link in project.skill_links}
    synchronized: list[CareerProfileProjectSkill] = []

    for position, skill_id in enumerate(requested_skill_ids):
        link = existing.get(skill_id)
        if link is None:
            link = CareerProfileProjectSkill(
                id=uuid4(),
                career_profile_id=profile_id,
                project_experience_id=project.id,
                skill_id=skill_id,
            )
        link.position = position
        link.skill = skills[skill_id]
        synchronized.append(link)

    return synchronized
