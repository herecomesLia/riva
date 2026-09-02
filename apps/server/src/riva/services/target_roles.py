from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.models.target_role import (
    HardSkills,
    JobDescription,
    JobRequirements,
    RecruitmentTrack,
    TargetRole,
)
from riva.models.user import User
from riva.services.errors import ConflictError, NotFoundError
from riva.services.types import UNSET
from riva.utils import utc_now


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
            raise ConflictError("The active target role cannot be archived.")
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
        if user.active_target_role_id == role.id:
            user.active_target_role_id = None
        await self.session.delete(role)
        await self.session.commit()

    async def update_jd(
        self,
        user: User,
        target_role_id: UUID,
        *,
        responsibilities: list[str] | UNSET = UNSET,
        requirements: JobRequirements | UNSET = UNSET,
        hard_skills: HardSkills | UNSET = UNSET,
        soft_skills: list[str] | UNSET = UNSET,
        preferred_qualifications: list[str] | UNSET = UNSET,
        business_domains: list[str] | UNSET = UNSET,
    ) -> TargetRole:
        role = await self.get(user, target_role_id)
        if responsibilities is not UNSET:
            role.jd.responsibilities = responsibilities
        if requirements is not UNSET:
            role.jd.requirements = requirements
        if hard_skills is not UNSET:
            role.jd.hard_skills = hard_skills
        if soft_skills is not UNSET:
            role.jd.soft_skills = soft_skills
        if preferred_qualifications is not UNSET:
            role.jd.preferred_qualifications = preferred_qualifications
        if business_domains is not UNSET:
            role.jd.business_domains = business_domains
        role.updated_at = utc_now()
        await self.session.commit()
        return role
