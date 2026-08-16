from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.models import (
    CareerProfile,
    CurrentTargetRole,
    InterviewSession,
    TargetRole,
    User,
)
from riva.schemas.interview import (
    InterviewConfiguration,
    InterviewDifficulty,
    InterviewDurationMinutes,
    InterviewRound,
)
from riva.core.language import InteractionLanguage
from riva.services.profile_completion import career_profile_fully_complete
from riva.utils import utc_now


InterviewSessionStateErrorCode = Literal[
    "interview_session_not_found",
    "interview_session_already_active",
    "interview_setup_profile_incomplete",
    "interview_setup_job_description_missing",
    "interview_target_role_unavailable",
    "interview_session_configuration_invalid",
]

INTERVIEW_SESSION_NOT_FOUND: InterviewSessionStateErrorCode = (
    "interview_session_not_found"
)
INTERVIEW_SESSION_ALREADY_ACTIVE: InterviewSessionStateErrorCode = (
    "interview_session_already_active"
)
INTERVIEW_SETUP_PROFILE_INCOMPLETE: InterviewSessionStateErrorCode = (
    "interview_setup_profile_incomplete"
)
INTERVIEW_SETUP_JOB_DESCRIPTION_MISSING: InterviewSessionStateErrorCode = (
    "interview_setup_job_description_missing"
)
INTERVIEW_TARGET_ROLE_UNAVAILABLE: InterviewSessionStateErrorCode = (
    "interview_target_role_unavailable"
)
INTERVIEW_SESSION_CONFIGURATION_INVALID: InterviewSessionStateErrorCode = (
    "interview_session_configuration_invalid"
)

InterviewSetupAvailabilityReason = Literal[
    "profileIncomplete",
    "jobDescriptionMissing",
]


@dataclass(frozen=True)
class InterviewSetupContext:
    target_roles: tuple[TargetRole, ...]
    current_target_role_id: UUID | None
    has_non_archived_role: bool
    profile_complete: bool
    blocked_reason: InterviewSetupAvailabilityReason | None


class InterviewSessionStateError(RuntimeError):
    safe_message = "The interview session state is invalid."

    def __init__(self, code: InterviewSessionStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


class InterviewSessionService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.clock = clock

    async def get_setup(self, *, user_id: UUID) -> InterviewSetupContext:
        profile = await self._profile(user_id)
        roles = [
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
        ]
        eligible_roles = tuple(
            role for role in roles if self._job_description_ready(role)
        )
        current_target_role_id = await self.session.scalar(
            select(CurrentTargetRole.role_id).where(
                CurrentTargetRole.user_id == user_id
            )
        )
        profile_complete = profile is not None and career_profile_fully_complete(
            profile
        )

        if not roles:
            blocked_reason = None
        elif not profile_complete:
            blocked_reason = "profileIncomplete"
        elif not eligible_roles:
            blocked_reason = "jobDescriptionMissing"
        else:
            blocked_reason = None

        return InterviewSetupContext(
            target_roles=eligible_roles,
            current_target_role_id=current_target_role_id,
            has_non_archived_role=bool(roles),
            profile_complete=profile_complete,
            blocked_reason=blocked_reason,
        )

    async def get_active_session(
        self,
        *,
        user_id: UUID,
    ) -> InterviewSession | None:
        return await self.session.scalar(
            select(InterviewSession)
            .where(
                InterviewSession.user_id == user_id,
                InterviewSession.status != "completed",
            )
            .order_by(
                InterviewSession.created_at.desc(),
                InterviewSession.id.desc(),
            )
            .limit(1)
        )

    async def start_session(
        self,
        *,
        user_id: UUID,
        configuration: InterviewConfiguration,
        interaction_language: InteractionLanguage,
    ) -> InterviewSession:
        try:
            await self._lock_user(user_id)
            active = await self.get_active_session(user_id=user_id)
            if active is not None:
                if self._same_intent(
                    active,
                    configuration=configuration,
                    language=interaction_language,
                ):
                    await self.session.commit()
                    return active
                raise InterviewSessionStateError(INTERVIEW_SESSION_ALREADY_ACTIVE)

            setup = await self.get_setup(user_id=user_id)
            self._require_setup_available(setup)
            target_role = next(
                (
                    role
                    for role in setup.target_roles
                    if role.id == configuration.target_role_id
                ),
                None,
            )
            if target_role is None:
                raise InterviewSessionStateError(
                    INTERVIEW_TARGET_ROLE_UNAVAILABLE
                )
            self._validate_configuration(configuration, interaction_language)

            now = self.clock()
            interview_session = InterviewSession(
                user_id=user_id,
                target_role_id=target_role.id,
                language=interaction_language,
                version=1,
                status="opening",
                round=configuration.round.value,
                difficulty=configuration.difficulty.value,
                duration_minutes=int(configuration.duration_minutes),
                started_at=now,
                created_at=now,
                updated_at=now,
                plan_revision=0,
                total_main_questions=None,
            )
            self.session.add(interview_session)
            await self.session.flush()
            await self.session.commit()
            return interview_session
        except InterviewSessionStateError:
            await self.session.rollback()
            raise
        except Exception:
            await self.session.rollback()
            raise

    async def _profile(self, user_id: UUID) -> CareerProfile | None:
        return await self.session.scalar(
            select(CareerProfile)
            .options(
                selectinload(CareerProfile.education),
                selectinload(CareerProfile.work_experiences),
                selectinload(CareerProfile.project_experiences),
                selectinload(CareerProfile.skills),
            )
            .where(CareerProfile.user_id == user_id)
        )

    async def _lock_user(self, user_id: UUID) -> None:
        await self.session.execute(
            select(User.id).where(User.id == user_id).with_for_update()
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

    @staticmethod
    def _same_intent(
        session: InterviewSession,
        *,
        configuration: InterviewConfiguration,
        language: str,
    ) -> bool:
        return (
            session.target_role_id == configuration.target_role_id
            and session.round == configuration.round.value
            and session.difficulty == configuration.difficulty.value
            and session.duration_minutes == int(configuration.duration_minutes)
            and session.language == language
        )

    @staticmethod
    def _validate_configuration(
        configuration: InterviewConfiguration,
        interaction_language: InteractionLanguage,
    ) -> None:
        if configuration.round not in tuple(InterviewRound):
            raise InterviewSessionStateError(
                INTERVIEW_SESSION_CONFIGURATION_INVALID
            )
        if configuration.difficulty not in tuple(InterviewDifficulty):
            raise InterviewSessionStateError(
                INTERVIEW_SESSION_CONFIGURATION_INVALID
            )
        if configuration.duration_minutes not in tuple(InterviewDurationMinutes):
            raise InterviewSessionStateError(
                INTERVIEW_SESSION_CONFIGURATION_INVALID
            )
        if interaction_language not in ("zh-CN", "en"):
            raise InterviewSessionStateError(
                INTERVIEW_SESSION_CONFIGURATION_INVALID
            )

    @staticmethod
    def _require_setup_available(setup: InterviewSetupContext) -> None:
        if setup.blocked_reason == "profileIncomplete":
            raise InterviewSessionStateError(INTERVIEW_SETUP_PROFILE_INCOMPLETE)
        if setup.blocked_reason == "jobDescriptionMissing":
            raise InterviewSessionStateError(
                INTERVIEW_SETUP_JOB_DESCRIPTION_MISSING
            )


__all__ = [
    "INTERVIEW_SESSION_ALREADY_ACTIVE",
    "INTERVIEW_SESSION_CONFIGURATION_INVALID",
    "INTERVIEW_SESSION_NOT_FOUND",
    "INTERVIEW_SETUP_JOB_DESCRIPTION_MISSING",
    "INTERVIEW_SETUP_PROFILE_INCOMPLETE",
    "INTERVIEW_TARGET_ROLE_UNAVAILABLE",
    "InterviewSessionService",
    "InterviewSessionStateError",
    "InterviewSessionStateErrorCode",
    "InterviewSetupContext",
]
