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
        education: list[EducationEntry] | None = None,
        work_experiences: list[WorkExperienceEntry] | None = None,
        projects: list[ProjectEntry] | None = None,
        skills: list[NonBlankStr] | None = None,
    ) -> CareerProfile:
        profile = await self.get(user)
        next_work_experiences = (
            work_experiences
            if work_experiences is not None
            else profile.work_experiences
        )
        next_skills = skills if skills is not None else profile.skills
        if any(
            skill not in next_skills
            for work_experience in next_work_experiences
            for skill in work_experience.skills
        ):
            raise CareerProfileSkillMismatchError()

        if education is not None:
            profile.education = education
        if work_experiences is not None:
            profile.work_experiences = work_experiences
        if projects is not None:
            profile.projects = projects
        if skills is not None:
            profile.skills = skills

        await self.session.commit()
        return profile
