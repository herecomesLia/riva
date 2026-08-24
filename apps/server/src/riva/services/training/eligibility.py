from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.models import CareerProfile, CurrentTargetRole, TargetRole
from riva.services.profile.content import has_required_content, parse_content

TrainingRoleEligibilityBlockedReason = Literal[
    "noTargetRoles",
    "profileIncomplete",
    "jobDescriptionMissing",
]


@dataclass(frozen=True)
class TrainingRoleEligibilityContext:
    target_roles: tuple[TargetRole, ...]
    current_target_role_id: UUID | None
    has_non_archived_role: bool
    profile_complete: bool
    blocked_reason: TrainingRoleEligibilityBlockedReason | None


class TrainingRoleEligibilityService:
    """Resolve the target roles that can enter a training setup page."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_training_available_target_roles(
        self,
        *,
        user_id: UUID,
    ) -> TrainingRoleEligibilityContext:
        profile = await self._profile(user_id)
        roles = tuple(
            role
            for role in (
                await self.session.scalars(
                    select(TargetRole)
                    .options(selectinload(TargetRole.job_description_analysis))
                    .where(
                        TargetRole.user_id == user_id,
                        TargetRole.preparation_status != "archived",
                    )
                    .order_by(TargetRole.created_at.asc(), TargetRole.id.asc())
                )
            ).all()
            if role.preparation_status != "archived"
        )
        jd_ready_roles = tuple(
            role for role in roles if self._job_description_ready(role)
        )
        current_target_role_id = await self.session.scalar(
            select(CurrentTargetRole.role_id).where(
                CurrentTargetRole.user_id == user_id
            )
        )
        profile_complete = profile is not None and has_required_content(
            parse_content(profile.content)
        )

        if not roles:
            blocked_reason: TrainingRoleEligibilityBlockedReason | None = (
                "noTargetRoles"
            )
        elif not profile_complete:
            blocked_reason = "profileIncomplete"
        elif not jd_ready_roles:
            blocked_reason = "jobDescriptionMissing"
        else:
            blocked_reason = None
        return TrainingRoleEligibilityContext(
            target_roles=jd_ready_roles,
            current_target_role_id=current_target_role_id,
            has_non_archived_role=bool(roles),
            profile_complete=profile_complete,
            blocked_reason=blocked_reason,
        )

    async def _profile(self, user_id: UUID) -> CareerProfile | None:
        return await self.session.scalar(
            select(CareerProfile).where(CareerProfile.user_id == user_id)
        )

    @staticmethod
    def _job_description_ready(role: TargetRole) -> bool:
        analysis = role.job_description_analysis
        return bool(
            role.job_description_status == "saved"
            and role.raw_job_description is not None
            and role.raw_job_description.strip()
            and role.job_description_version is not None
            and analysis is not None
            and analysis.job_description_version == role.job_description_version
        )
