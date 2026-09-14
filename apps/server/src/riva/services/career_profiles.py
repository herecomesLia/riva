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
    JobStatus,
    Task,
    TaskErrorCode,
    TaskStatus,
    cancel_job,
    defer_job,
    get_job_status,
    get_task_status,
    retry_job,
)


class CareerProfileService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

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
        if extraction.job_id is not None and await get_job_status(
            self.session, extraction.job_id
        ) in {JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.ABORTING}:
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
        if extraction.job_id is not None and await get_job_status(
            self.session, extraction.job_id
        ) in {JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.ABORTING}:
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
        if extraction.job_id is not None:
            await cancel_job(self.session, extraction.job_id, abort=True)
        extraction.job_id = await defer_job(
            self.session,
            Task.EXTRACT_CAREER_PROFILE_TEXT,
            user_id=str(user.id),
            text=text,
        )
        extraction.error_code = None
        await self.session.commit()

    async def get_extraction_state(self, user: User) -> TaskState:
        # Keep the current job and its error stable while reading the job status.
        extraction = await self._lock_extraction(user, shared=True)
        status = await get_task_status(self.session, extraction.job_id)
        return TaskState(
            status,
            (extraction.error_code or TaskErrorCode.INTERNAL_ERROR)
            if status is TaskStatus.FAILED
            else None,
        )

    async def retry_extraction(self, user: User) -> None:
        extraction = await self._lock_extraction(user)
        if (
            extraction.job_id is None
            or await get_job_status(self.session, extraction.job_id)
            is not JobStatus.FAILED
        ):
            raise ConflictError(
                "Only a failed career profile extraction can be retried."
            )
        await retry_job(self.session, extraction.job_id)
        extraction.error_code = None
        await self.session.commit()

    async def abort_extraction(self, user: User) -> None:
        extraction = await self._lock_extraction(user)
        if extraction.job_id is None:
            raise ConflictError(
                "There is no active career profile extraction to abort."
            )
        status = await get_job_status(self.session, extraction.job_id)
        if status in {JobStatus.QUEUED, JobStatus.RUNNING}:
            await cancel_job(self.session, extraction.job_id, abort=True)
        elif status is not JobStatus.ABORTING:
            raise ConflictError(
                "Only an active career profile extraction can be aborted."
            )
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
