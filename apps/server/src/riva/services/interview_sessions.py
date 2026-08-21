from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.core.language import InteractionLanguage
from riva.models import (
    InterviewCandidateQuestion,
    InterviewCandidateQuestionExchange,
    InterviewFollowUpQuestion,
    InterviewQuestion,
    InterviewSession,
    User,
)
from riva.schemas.interview import (
    InterviewConfiguration,
    InterviewDifficulty,
    InterviewDurationMinutes,
    InterviewRound,
)
from riva.services.training_role_eligibility import (
    TrainingRoleEligibilityBlockedReason,
    TrainingRoleEligibilityContext,
    TrainingRoleEligibilityService,
)
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

InterviewSetupAvailabilityReason = TrainingRoleEligibilityBlockedReason
InterviewSetupContext = TrainingRoleEligibilityContext


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
        return await TrainingRoleEligibilityService(
            self.session
        ).get_training_available_target_roles(
            user_id=user_id,
        )

    async def get_active_session(
        self,
        *,
        user_id: UUID,
    ) -> InterviewSession | None:
        return await self.session.scalar(
            select(InterviewSession)
            .options(*self._session_load_options())
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

    async def get_current_session(
        self,
        *,
        user_id: UUID,
    ) -> InterviewSession | None:
        return await self.session.scalar(
            select(InterviewSession)
            .options(*self._session_load_options())
            .where(InterviewSession.user_id == user_id)
            .order_by(
                InterviewSession.created_at.desc(),
                InterviewSession.id.desc(),
            )
            .limit(1)
        )

    @staticmethod
    def _session_load_options():
        return (
            selectinload(InterviewSession.planning_run),
            selectinload(InterviewSession.turn_run),
            selectinload(InterviewSession.candidate_answer_run),
            selectinload(InterviewSession.review_run),
            selectinload(InterviewSession.candidate_questions).selectinload(
                InterviewCandidateQuestion.exchange
            ),
            selectinload(InterviewSession.candidate_question_exchanges).selectinload(
                InterviewCandidateQuestionExchange.question
            ),
            selectinload(InterviewSession.review),
            selectinload(InterviewSession.questions).selectinload(
                InterviewQuestion.answer
            ),
            selectinload(InterviewSession.questions)
            .selectinload(InterviewQuestion.follow_up_questions)
            .selectinload(InterviewFollowUpQuestion.answer),
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
                raise InterviewSessionStateError(INTERVIEW_TARGET_ROLE_UNAVAILABLE)
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

    async def _lock_user(self, user_id: UUID) -> None:
        await self.session.execute(
            select(User.id).where(User.id == user_id).with_for_update()
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
            raise InterviewSessionStateError(INTERVIEW_SESSION_CONFIGURATION_INVALID)
        if configuration.difficulty not in tuple(InterviewDifficulty):
            raise InterviewSessionStateError(INTERVIEW_SESSION_CONFIGURATION_INVALID)
        if configuration.duration_minutes not in tuple(InterviewDurationMinutes):
            raise InterviewSessionStateError(INTERVIEW_SESSION_CONFIGURATION_INVALID)
        if interaction_language not in ("zh-CN", "en"):
            raise InterviewSessionStateError(INTERVIEW_SESSION_CONFIGURATION_INVALID)

    @staticmethod
    def _require_setup_available(setup: InterviewSetupContext) -> None:
        if setup.blocked_reason == "profileIncomplete":
            raise InterviewSessionStateError(INTERVIEW_SETUP_PROFILE_INCOMPLETE)
        if setup.blocked_reason == "jobDescriptionMissing":
            raise InterviewSessionStateError(INTERVIEW_SETUP_JOB_DESCRIPTION_MISSING)


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
