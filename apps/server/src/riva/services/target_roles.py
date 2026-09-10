from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.models.target_role import (
    JobDescription,
    RecruitmentTrack,
    TargetRole,
)
from riva.models.user import User
from riva.services.errors import ConflictError, NotFoundError
from riva.services.types import UNSET
from riva.tasks import cancel_job


class TargetRoleService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list(self, user: User) -> list[TargetRole]:
        result = await self.session.scalars(
            select(TargetRole)
            .options(selectinload(TargetRole.jd))
            .where(TargetRole.user_id == user.id)
            .order_by(TargetRole.created_at.desc(), TargetRole.id.desc())
        )
        return list(result)

    async def get(self, user: User, target_role_id: UUID) -> TargetRole:
        role = await self.session.scalar(
            select(TargetRole)
            .options(selectinload(TargetRole.jd))
            .where(
                TargetRole.id == target_role_id,
                TargetRole.user_id == user.id,
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
    ) -> TargetRole:
        role = TargetRole(
            user_id=user.id,
            title=title,
            company=company,
            recruitment_track=recruitment_track,
            location=location,
        )
        role.jd = JobDescription() if jd is None else jd
        self.session.add(role)
        await self.session.commit()
        return role

    async def update(
        self,
        user: User,
        target_role_id: UUID,
        *,
        title: str | UNSET = UNSET,
        company: str | None | UNSET = UNSET,
        recruitment_track: RecruitmentTrack | None | UNSET = UNSET,
        location: str | None | UNSET = UNSET,
    ) -> TargetRole:
        role = await self.get(user, target_role_id)
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

    async def set_active(self, user: User, target_role_id: UUID) -> None:
        role = await self.get(user, target_role_id)
        if role.is_archived:
            raise ConflictError("An archived target role cannot be activated.")
        user.active_target_role_id = role.id
        await self.session.commit()

    async def archive(self, user: User, target_role_id: UUID) -> TargetRole:
        role = await self.get(user, target_role_id)
        if user.active_target_role_id == role.id:
            user.active_target_role_id = None
        role.is_archived = True
        await self.session.commit()
        return role

    async def restore(self, user: User, target_role_id: UUID) -> TargetRole:
        role = await self.get(user, target_role_id)
        role.is_archived = False
        await self.session.commit()
        return role

    async def delete(self, user: User, target_role_id: UUID) -> None:
        role = await self.get(user, target_role_id)
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
        if user.active_target_role_id == role.id:
            user.active_target_role_id = None
        await self.session.delete(role)
        await self.session.commit()
