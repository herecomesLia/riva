from sqlalchemy.ext.asyncio import AsyncSession

from riva.models.role import (
    HardSkills,
    JobDescription,
    JobRequirements,
    Role,
)
from riva.services.errors import ConflictError, NotFoundError
from riva.services.types import UNSET
from riva.tasks import (
    JobStatus,
    Task,
    TaskErrorCode,
    TaskState,
    TaskStatus,
    cancel_job,
    defer_job,
    get_job_status,
    retry_job,
)
from riva.utils import utc_now


class JobDescriptionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def update(
        self,
        role: Role,
        *,
        responsibilities: list[str] | UNSET = UNSET,
        requirements: JobRequirements | UNSET = UNSET,
        hard_skills: HardSkills | UNSET = UNSET,
        soft_skills: list[str] | UNSET = UNSET,
        preferred_qualifications: list[str] | UNSET = UNSET,
        business_domains: list[str] | UNSET = UNSET,
    ) -> Role:
        jd = await self._lock_jd(role)
        if jd.extraction_job_id is not None and await get_job_status(
            self.session, jd.extraction_job_id
        ) in {JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.ABORTING}:
            raise ConflictError("Abort the active extraction before updating the JD.")
        if responsibilities is not UNSET:
            jd.responsibilities = responsibilities
        if requirements is not UNSET:
            jd.requirements = requirements
        if hard_skills is not UNSET:
            jd.hard_skills = hard_skills
        if soft_skills is not UNSET:
            jd.soft_skills = soft_skills
        if preferred_qualifications is not UNSET:
            jd.preferred_qualifications = preferred_qualifications
        if business_domains is not UNSET:
            jd.business_domains = business_domains
        jd.extraction_job_id = None
        jd.extraction_error_code = None
        role.updated_at = utc_now()
        await self.session.commit()
        return role

    async def extract_text(self, role: Role, *, text: str) -> None:
        jd = await self._lock_jd(role)
        if jd.extraction_job_id is not None:
            await cancel_job(self.session, jd.extraction_job_id, abort=True)
        jd.extraction_job_id = await defer_job(
            self.session,
            Task.EXTRACT_JD_TEXT,
            role_id=str(role.id),
            text=text,
        )
        jd.extraction_error_code = None
        await self.session.commit()

    async def get_extraction_state(self, role: Role) -> TaskState:
        # Keep the current job and its error stable while reading the job status.
        jd = await self._lock_jd(role, shared=True)
        if jd.extraction_job_id is None:
            return TaskState(TaskStatus.IDLE)
        status = await get_job_status(self.session, jd.extraction_job_id)
        if status is JobStatus.FAILED:
            return TaskState(
                TaskStatus.FAILED,
                jd.extraction_error_code or TaskErrorCode.INTERNAL_ERROR,
            )
        return TaskState(
            {
                JobStatus.QUEUED: TaskStatus.QUEUED,
                JobStatus.RUNNING: TaskStatus.RUNNING,
                JobStatus.ABORTING: TaskStatus.ABORTING,
            }.get(status, TaskStatus.IDLE)
        )

    async def retry_extraction(self, role: Role) -> None:
        jd = await self._lock_jd(role)
        if (
            jd.extraction_job_id is None
            or await get_job_status(self.session, jd.extraction_job_id)
            is not JobStatus.FAILED
        ):
            raise ConflictError("Only a failed JD extraction can be retried.")
        await retry_job(self.session, jd.extraction_job_id)
        jd.extraction_error_code = None
        await self.session.commit()

    async def abort_extraction(self, role: Role) -> None:
        jd = await self._lock_jd(role)
        if jd.extraction_job_id is None:
            raise ConflictError("There is no active JD extraction to abort.")
        status = await get_job_status(self.session, jd.extraction_job_id)
        if status in {JobStatus.QUEUED, JobStatus.RUNNING}:
            await cancel_job(self.session, jd.extraction_job_id, abort=True)
        elif status is not JobStatus.ABORTING:
            raise ConflictError("Only an active JD extraction can be aborted.")
        await self.session.commit()

    async def _lock_jd(self, role: Role, *, shared: bool = False) -> JobDescription:
        jd = await self.session.get(
            JobDescription,
            role.id,
            with_for_update={"read": shared},
            populate_existing=True,
        )
        if jd is None:
            raise NotFoundError("Target role was not found.")
        return jd
