from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.models.career_profile import (
    CareerProfile,
    EducationEntry,
    ProjectEntry,
    WorkExperienceEntry,
)
from riva.models.types import NonBlankStr
from riva.models.user import User
from riva.services.errors import (
    CareerProfileAlreadyExistsError,
    CareerProfileNotFoundError,
    CareerProfileSkillMismatchError,
)
from riva.services.types import UNSET


class CareerProfileService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, user: User) -> CareerProfile:
        profile = user.career_profile
        if profile is None:
            raise CareerProfileNotFoundError()
        return profile

    async def create(
        self,
        user: User,
        *,
        education: list[EducationEntry] | None = None,
        work_experiences: list[WorkExperienceEntry] | None = None,
        projects: list[ProjectEntry] | None = None,
        skills: list[NonBlankStr] | None = None,
    ) -> CareerProfile:
        if user.career_profile is not None:
            raise CareerProfileAlreadyExistsError()

        education = [] if education is None else education
        work_experiences = [] if work_experiences is None else work_experiences
        projects = [] if projects is None else projects
        skills = [] if skills is None else skills
        if any(
            skill not in skills
            for work_experience in work_experiences
            for skill in work_experience.skills
        ):
            raise CareerProfileSkillMismatchError()

        profile = CareerProfile(
            education=education,
            work_experiences=work_experiences,
            projects=projects,
            skills=skills,
        )
        user.career_profile = profile
        self.session.add(profile)

        try:
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise CareerProfileAlreadyExistsError() from exc

        return profile

    async def update(
        self,
        user: User,
        *,
        education: list[EducationEntry] | UNSET = UNSET,
        work_experiences: list[WorkExperienceEntry] | UNSET = UNSET,
        projects: list[ProjectEntry] | UNSET = UNSET,
        skills: list[NonBlankStr] | UNSET = UNSET,
    ) -> CareerProfile:
        profile = await self.get(user)
        if (
            education is UNSET
            and work_experiences is UNSET
            and projects is UNSET
            and skills is UNSET
        ):
            return profile

        next_work_experiences = (
            profile.work_experiences if work_experiences is UNSET else work_experiences
        )
        next_skills = profile.skills if skills is UNSET else skills
        if any(
            skill not in next_skills
            for work_experience in next_work_experiences
            for skill in work_experience.skills
        ):
            raise CareerProfileSkillMismatchError()

        if education is not UNSET:
            profile.education = education
        if work_experiences is not UNSET:
            profile.work_experiences = work_experiences
        if projects is not UNSET:
            profile.projects = projects
        if skills is not UNSET:
            profile.skills = skills

        await self.session.commit()
        return profile
