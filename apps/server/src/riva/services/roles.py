from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.models.career_profile import CareerProfile
from riva.models.role import (
    JobDescription,
    JobDescriptionExtraction,
    RecruitmentTrack,
    Role,
    RoleMatching,
    RoleMatchingAnalysis,
)
from riva.models.user import User
from riva.services.errors import ConflictError, NotFoundError
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
)


class RoleService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list(self, user: User) -> list[Role]:
        result = await self.session.scalars(
            select(Role)
            .options(selectinload(Role.jd), selectinload(Role.matching))
            .where(Role.user_id == user.id)
            .order_by(Role.created_at.desc(), Role.id.desc())
        )
        return list(result)

    async def get(self, user: User, role_id: UUID) -> Role:
        role = await self.session.scalar(
            select(Role)
            .options(selectinload(Role.jd), selectinload(Role.matching))
            .where(
                Role.id == role_id,
                Role.user_id == user.id,
            )
        )
        if role is None:
            raise NotFoundError("Target role was not found.")
        return role

    async def create(
        self,
        user: User,
        *,
        title: str,
        company: str | None = None,
        recruitment_track: RecruitmentTrack | None = None,
        location: str | None = None,
        jd: JobDescription | None = None,
    ) -> Role:
        role = Role(
            user_id=user.id,
            title=title,
            company=company,
            recruitment_track=recruitment_track,
            location=location,
        )
        role.jd = JobDescription() if jd is None else jd
        role.matching = RoleMatching()
        role.jd_extraction = JobDescriptionExtraction()
        role.matching_analysis = RoleMatchingAnalysis()
        self.session.add(role)
        await self.session.commit()
        return role

    async def update(
        self,
        user: User,
        role_id: UUID,
        *,
        title: str | UNSET = UNSET,
        company: str | None | UNSET = UNSET,
        recruitment_track: RecruitmentTrack | None | UNSET = UNSET,
        location: str | None | UNSET = UNSET,
    ) -> Role:
        role = await self.get(user, role_id)
        if title is not UNSET:
            role.title = title
        if company is not UNSET:
            role.company = company
        if recruitment_track is not UNSET:
            role.recruitment_track = recruitment_track
        if location is not UNSET:
            role.location = location
        await self.session.commit()
        return role

    async def set_active(self, user: User, role_id: UUID) -> None:
        role = await self.get(user, role_id)
        if role.is_archived:
            raise ConflictError("An archived target role cannot be activated.")
        user.active_role_id = role.id
        await self.session.commit()

    async def archive(self, user: User, role_id: UUID) -> Role:
        role = await self.get(user, role_id)
        if user.active_role_id == role.id:
            user.active_role_id = None
        role.is_archived = True
        await self.session.commit()
        return role

    async def restore(self, user: User, role_id: UUID) -> Role:
        role = await self.get(user, role_id)
        role.is_archived = False
        await self.session.commit()
        return role

    async def delete(self, user: User, role_id: UUID) -> None:
        role = await self.get(user, role_id)
        extraction = await self.session.get(
            JobDescriptionExtraction,
            role.id,
            with_for_update=True,
            populate_existing=True,
        )
        if extraction is None:
            raise NotFoundError("Target role was not found.")
        if extraction.job_id is not None:
            await cancel_job(self.session, extraction.job_id, abort=True)
        analysis = await self._lock_matching_analysis(role)
        if analysis.job_id is not None and await get_job_status(
            self.session, analysis.job_id
        ) in {JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.ABORTING}:
            await cancel_job(self.session, analysis.job_id, abort=True)
        if user.active_role_id == role.id:
            user.active_role_id = None
        await self.session.delete(role)
        await self.session.commit()

    async def start_matching_analysis(self, user: User, role_id: UUID) -> None:
        role = await self.get(user, role_id)
        # Match deletion's extraction -> analysis lock order. Keep extraction dispatch
        # from changing the JD task state until this dispatch is committed.
        extraction = await self.session.get(
            JobDescriptionExtraction,
            role.id,
            with_for_update=True,
            populate_existing=True,
        )
        if extraction is None:
            raise NotFoundError("Job description was not found.")
        analysis = await self._lock_matching_analysis(role)
        if await self.session.get(CareerProfile, user.id) is None:
            raise NotFoundError("Career profile was not found.")
        if extraction.job_id is not None and await get_job_status(
            self.session, extraction.job_id
        ) in {JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.ABORTING}:
            raise ConflictError(
                "Finish or abort the active JD extraction before matching."
            )
        if analysis.job_id is not None:
            await cancel_job(self.session, analysis.job_id, abort=True)
        analysis.job_id = await defer_job(
            self.session, Task.ANALYZE_ROLE_MATCHING, role_id=str(role.id)
        )
        analysis.error_code = None
        await self.session.commit()

    async def get_matching_analysis_state(self, user: User, role_id: UUID) -> TaskState:
        role = await self.get(user, role_id)
        analysis = await self._lock_matching_analysis(role, shared=True)
        status = await get_task_status(self.session, analysis.job_id)
        return TaskState(
            status,
            (analysis.error_code or TaskErrorCode.INTERNAL_ERROR)
            if status is TaskStatus.FAILED
            else None,
        )

    async def abort_matching_analysis(self, user: User, role_id: UUID) -> None:
        role = await self.get(user, role_id)
        analysis = await self._lock_matching_analysis(role)
        if analysis.job_id is None:
            raise ConflictError("There is no active role matching analysis to abort.")
        status = await get_job_status(self.session, analysis.job_id)
        if status in {JobStatus.QUEUED, JobStatus.RUNNING}:
            await cancel_job(self.session, analysis.job_id, abort=True)
        elif status is not JobStatus.ABORTING:
            raise ConflictError("Only an active role matching analysis can be aborted.")
        await self.session.commit()

    async def _lock_matching_analysis(
        self, role: Role, *, shared: bool = False
    ) -> RoleMatchingAnalysis:
        analysis = await self.session.get(
            RoleMatchingAnalysis,
            role.id,
            with_for_update={"read": shared},
            populate_existing=True,
        )
        if analysis is None:
            raise NotFoundError("Role matching resource was not found.")
        return analysis
