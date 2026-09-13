from sqlalchemy.ext.asyncio import AsyncSession

from riva.models.role import (
    HardSkills,
    JobDescriptionContent,
    JobDescriptionExtraction,
    JobRequirements,
    Role,
)
from riva.services.errors import ConflictError, NotFoundError
from riva.services.types import UNSET
from riva.tasks import (
    JobStatus,
    Task,
    TaskState,
    cancel_job,
    defer_job,
    get_job_status,
    get_task_state,
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
        extraction = await self._lock_extraction(role)
        if extraction.job_id is not None and await get_job_status(
            self.session, extraction.job_id
        ) in {JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.ABORTING}:
            raise ConflictError("Abort the active extraction before updating the JD.")
        jd = role.jd
        await self.session.refresh(jd)
        previous_content = {
            field: getattr(jd, field) for field in JobDescriptionContent.model_fields
        }
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
        if any(
            getattr(jd, field) != value for field, value in previous_content.items()
        ):
            jd.updated_at = role.updated_at = utc_now()
        extraction.job_id = None
        extraction.error_code = None
        await self.session.commit()
        return role

    async def extract_text(self, role: Role, *, text: str) -> None:
        extraction = await self._lock_extraction(role)
        if extraction.job_id is not None:
            await cancel_job(self.session, extraction.job_id, abort=True)
        extraction.job_id = await defer_job(
            self.session,
            Task.EXTRACT_JD_TEXT,
            role_id=str(role.id),
            text=text,
        )
        extraction.error_code = None
        await self.session.commit()

    async def get_extraction_state(self, role: Role) -> TaskState:
        # Keep the current job and its error stable while reading the job status.
        extraction = await self._lock_extraction(role, shared=True)
        return await get_task_state(
            self.session, extraction.job_id, extraction.error_code
        )

    async def retry_extraction(self, role: Role) -> None:
        extraction = await self._lock_extraction(role)
        if (
            extraction.job_id is None
            or await get_job_status(self.session, extraction.job_id)
            is not JobStatus.FAILED
        ):
            raise ConflictError("Only a failed JD extraction can be retried.")
        await retry_job(self.session, extraction.job_id)
        extraction.error_code = None
        await self.session.commit()

    async def abort_extraction(self, role: Role) -> None:
        extraction = await self._lock_extraction(role)
        if extraction.job_id is None:
            raise ConflictError("There is no active JD extraction to abort.")
        status = await get_job_status(self.session, extraction.job_id)
        if status in {JobStatus.QUEUED, JobStatus.RUNNING}:
            await cancel_job(self.session, extraction.job_id, abort=True)
        elif status is not JobStatus.ABORTING:
            raise ConflictError("Only an active JD extraction can be aborted.")
        await self.session.commit()

    async def _lock_extraction(
        self, role: Role, *, shared: bool = False
    ) -> JobDescriptionExtraction:
        extraction = await self.session.get(
            JobDescriptionExtraction,
            role.id,
            with_for_update={"read": shared},
            populate_existing=True,
        )
        if extraction is None:
            raise NotFoundError("Target role was not found.")
        return extraction
