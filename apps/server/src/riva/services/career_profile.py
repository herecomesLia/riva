from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.models.career_profile import (
    CareerProfile,
    CareerProfileExtraction,
    EducationEntry,
    ProjectEntry,
    WorkExperienceEntry,
)
from riva.models.types import NonBlankStr
from riva.models.user import User
from riva.services.errors import (
    ConflictError,
    DomainValidationError,
    NotFoundError,
)
from riva.services.types import UNSET, TaskState
from riva.tasks import (
    Task,
    TaskController,
    TaskErrorCode,
    TaskStatus,
)


class CareerProfileService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.tasks = TaskController(session)

    async def get(self, user: User) -> CareerProfile:
        profile = user.career_profile
        if profile is None:
            raise NotFoundError("Career profile was not found.")
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
        extraction = await self._lock_extraction(user)
        if await self.tasks.is_active(extraction.job_id):
            raise ConflictError(
                "Abort the active extraction before creating the career profile."
            )
        await self.session.refresh(user, attribute_names=["career_profile"])
        if user.career_profile is not None:
            raise ConflictError("Career profile already exists.")

        education = [] if education is None else education
        work_experiences = [] if work_experiences is None else work_experiences
        projects = [] if projects is None else projects
        skills = [] if skills is None else skills
        if any(
            skill not in skills
            for work_experience in work_experiences
            for skill in work_experience.skills
        ):
            raise DomainValidationError(
                "Work experience skills must exist in the career profile skills list."
            )

        profile = CareerProfile(
            education=education,
            work_experiences=work_experiences,
            projects=projects,
            skills=skills,
        )
        user.career_profile = profile
        self.session.add(profile)
        extraction.job_id = None
        extraction.error_code = None

        try:
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise ConflictError("Career profile already exists.") from exc

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
        extraction = await self._lock_extraction(user)
        if await self.tasks.is_active(extraction.job_id):
            raise ConflictError(
                "Abort the active extraction before updating the career profile."
            )
        await self.session.refresh(user, attribute_names=["career_profile"])
        profile = await self.get(user)
        await self.session.refresh(profile)

        next_work_experiences = (
            profile.work_experiences if work_experiences is UNSET else work_experiences
        )
        next_skills = profile.skills if skills is UNSET else skills
        if any(
            skill not in next_skills
            for work_experience in next_work_experiences
            for skill in work_experience.skills
        ):
            raise DomainValidationError(
                "Work experience skills must exist in the career profile skills list."
            )

        if education is not UNSET:
            profile.education = education
        if work_experiences is not UNSET:
            profile.work_experiences = work_experiences
        if projects is not UNSET:
            profile.projects = projects
        if skills is not UNSET:
            profile.skills = skills

        extraction.job_id = None
        extraction.error_code = None
        await self.session.commit()
        return profile

    async def extract_text(self, user: User, *, text: str) -> None:
        extraction = await self._lock_extraction(user)
        if await self.tasks.is_active(extraction.job_id):
            await self.tasks.abort(extraction.job_id)
        extraction.job_id = await self.tasks.start(
            Task.EXTRACT_CAREER_PROFILE_TEXT,
            user_id=str(user.id),
            text=text,
        )
        extraction.error_code = None
        await self.session.commit()

    async def get_extraction_state(self, user: User) -> TaskState:
        # Keep the current job and its error stable while reading the job status.
        extraction = await self._lock_extraction(user, shared=True)
        status = await self.tasks.get_status(extraction.job_id)
        return TaskState(
            status,
            (extraction.error_code or TaskErrorCode.SERVICE_UNAVAILABLE)
            if status is TaskStatus.FAILED
            else None,
        )

    async def retry_extraction(self, user: User) -> None:
        extraction = await self._lock_extraction(user)
        await self.tasks.retry(extraction.job_id)
        extraction.error_code = None
        await self.session.commit()

    async def abort_extraction(self, user: User) -> None:
        extraction = await self._lock_extraction(user)
        await self.tasks.abort(extraction.job_id)
        await self.session.commit()

    async def _lock_extraction(
        self, user: User, *, shared: bool = False
    ) -> CareerProfileExtraction:
        extraction = await self.session.get(
            CareerProfileExtraction,
            user.id,
            with_for_update={"read": shared},
            populate_existing=True,
        )
        if extraction is None:
            raise NotFoundError("Career profile extraction state was not found.")
        return extraction
