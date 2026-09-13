from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.models.career_profile import CareerProfile
from riva.models.role import (
    JobDescription,
    RecruitmentTrack,
    Role,
    RoleMatching,
)
from riva.models.user import User
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
        jd = await self.session.get(
            JobDescription,
            role.id,
            with_for_update=True,
            populate_existing=True,
        )
        if jd is None:
            raise NotFoundError("Target role was not found.")
        if jd.extraction_job_id is not None:
            await cancel_job(self.session, jd.extraction_job_id, abort=True)
        matching = await self._lock_matching(role)
        if matching.job_id is not None and await get_job_status(
            self.session, matching.job_id
        ) in {JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.ABORTING}:
            await cancel_job(self.session, matching.job_id, abort=True)
        if user.active_role_id == role.id:
            user.active_role_id = None
        await self.session.delete(role)
        await self.session.commit()

    async def start_matching_analysis(self, user: User, role_id: UUID) -> None:
        role = await self.get(user, role_id)
        # Match deletion's JD -> matching lock order. Keep extraction dispatch
        # from changing the JD task state until this dispatch is committed.
        jd = await self.session.get(
            JobDescription, role.id, with_for_update=True, populate_existing=True
        )
        if jd is None:
            raise NotFoundError("Job description was not found.")
        matching = await self._lock_matching(role)
        if await self.session.get(CareerProfile, user.id) is None:
            raise NotFoundError("Career profile was not found.")
        if jd.extraction_job_id is not None and await get_job_status(
            self.session, jd.extraction_job_id
        ) in {JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.ABORTING}:
            raise ConflictError(
                "Finish or abort the active JD extraction before matching."
            )
        if matching.job_id is not None:
            await cancel_job(self.session, matching.job_id, abort=True)
        matching.job_id = await defer_job(
            self.session, Task.ANALYZE_ROLE_MATCHING, role_id=str(role.id)
        )
        matching.error_code = None
        await self.session.commit()

    async def get_matching_analysis_state(self, user: User, role_id: UUID) -> TaskState:
        role = await self.get(user, role_id)
        matching = await self._lock_matching(role, shared=True)
        if matching.job_id is None:
            return TaskState(TaskStatus.IDLE)
        status = await get_job_status(self.session, matching.job_id)
        if status is JobStatus.FAILED:
            return TaskState(
                TaskStatus.FAILED, matching.error_code or TaskErrorCode.INTERNAL_ERROR
            )
        return TaskState(
            {
                JobStatus.QUEUED: TaskStatus.QUEUED,
                JobStatus.RUNNING: TaskStatus.RUNNING,
                JobStatus.ABORTING: TaskStatus.ABORTING,
            }.get(status, TaskStatus.IDLE)
        )

    async def abort_matching_analysis(self, user: User, role_id: UUID) -> None:
        role = await self.get(user, role_id)
        matching = await self._lock_matching(role)
        if matching.job_id is None:
            raise ConflictError("There is no active role matching analysis to abort.")
        status = await get_job_status(self.session, matching.job_id)
        if status in {JobStatus.QUEUED, JobStatus.RUNNING}:
            await cancel_job(self.session, matching.job_id, abort=True)
        elif status is not JobStatus.ABORTING:
            raise ConflictError("Only an active role matching analysis can be aborted.")
        await self.session.commit()

    async def _lock_matching(self, role: Role, *, shared: bool = False) -> RoleMatching:
        matching = await self.session.get(
            RoleMatching,
            role.id,
            with_for_update={"read": shared},
            populate_existing=True,
        )
        if matching is None:
            raise NotFoundError("Role matching resource was not found.")
        return matching
