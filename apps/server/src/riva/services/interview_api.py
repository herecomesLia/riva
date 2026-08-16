from collections.abc import Callable
from typing import cast
from uuid import UUID

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.errors import APIError
from riva.core.language import InteractionLanguage
from riva.models import InterviewSession
from riva.schemas.interview import (
    InterviewConfiguration,
    InterviewDifficulty,
    InterviewDurationMinutes,
    InterviewOpeningSessionResponse,
    InterviewPageResponse,
    InterviewProgressResponse,
    InterviewRound,
    InterviewSetupAvailableResponse,
    InterviewSetupBlockedResponse,
    InterviewSetupResponse,
    InterviewTargetRoleResponse,
    StartInterviewRequest,
)
from riva.services.interview_sessions import (
    INTERVIEW_SESSION_NOT_FOUND,
    InterviewSessionService,
    InterviewSessionStateError,
    InterviewSetupContext,
)


InterviewSessionServiceFactory = Callable[[AsyncSession], InterviewSessionService]

INTERVIEW_OPENING_MESSAGES: dict[InteractionLanguage, str] = {
    "zh-CN": (
        "你好，我是本次模拟面试的面试官。接下来会围绕岗位经历、项目能力和求职动机连续提问，请尽量像正式面试一样作答。"
    ),
    "en": (
        "Hello, I am your interviewer for this session. We will discuss your experience, project capabilities, and motivation. Please answer as you would in a formal interview."
    ),
}

SUPPORTED_ROUNDS: tuple[InterviewRound, ...] = (
    InterviewRound.HR,
    InterviewRound.FIRST_BUSINESS,
    InterviewRound.TECHNICAL,
    InterviewRound.MANAGER,
    InterviewRound.FINAL,
    InterviewRound.COMPREHENSIVE,
)
AVAILABLE_DIFFICULTIES: tuple[InterviewDifficulty, ...] = (
    InterviewDifficulty.BASIC,
    InterviewDifficulty.PRESSURE,
)
AVAILABLE_DURATIONS: tuple[InterviewDurationMinutes, ...] = (
    InterviewDurationMinutes.FIFTEEN,
    InterviewDurationMinutes.THIRTY,
    InterviewDurationMinutes.FORTY_FIVE,
)


class InterviewAPIService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        interview_service_factory: InterviewSessionServiceFactory = (
            InterviewSessionService
        ),
    ) -> None:
        self.session = session
        self.interview_service_factory = interview_service_factory

    async def get_page(self, *, user_id: UUID) -> InterviewPageResponse:
        service = self._interview_service()
        setup = await service.get_setup(user_id=user_id)
        active_session = await service.get_active_session(user_id=user_id)
        return build_interview_page_response(setup, active_session)

    async def start_session(
        self,
        *,
        user_id: UUID,
        payload: StartInterviewRequest,
        interaction_language: InteractionLanguage,
    ) -> InterviewPageResponse:
        service = self._interview_service()
        try:
            await service.start_session(
                user_id=user_id,
                configuration=payload,
                interaction_language=interaction_language,
            )
            setup = await service.get_setup(user_id=user_id)
            active_session = await service.get_active_session(user_id=user_id)
            if active_session is None:
                raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND)
            return build_interview_page_response(setup, active_session)
        except InterviewSessionStateError as error:
            raise interview_session_state_api_error(error) from None

    def _interview_service(self) -> InterviewSessionService:
        return self.interview_service_factory(self.session)


def build_interview_page_response(
    setup: InterviewSetupContext,
    session: InterviewSession | None,
) -> InterviewPageResponse:
    return InterviewPageResponse(
        setup=build_interview_setup_response(setup),
        session=(
            None
            if session is None
            else build_interview_opening_session_response(session)
        ),
    )


def build_interview_setup_response(
    setup: InterviewSetupContext,
) -> InterviewSetupResponse:
    target_roles = [
        InterviewTargetRoleResponse(
            id=role.id,
            title=role.title,
            company=role.company,
            supported_rounds=SUPPORTED_ROUNDS,
        )
        for role in setup.target_roles
    ]
    default_role = next(
        (
            role
            for role in setup.target_roles
            if role.id == setup.current_target_role_id
        ),
        setup.target_roles[0] if setup.target_roles else None,
    )
    if setup.blocked_reason == "profileIncomplete":
        availability = InterviewSetupBlockedResponse(
            status="blocked",
            reason="profileIncomplete",
        )
    elif setup.blocked_reason == "jobDescriptionMissing":
        availability = InterviewSetupBlockedResponse(
            status="blocked",
            reason="jobDescriptionMissing",
        )
    else:
        availability = InterviewSetupAvailableResponse(status="available")

    return InterviewSetupResponse(
        availability=availability,
        target_roles=target_roles,
        available_difficulties=AVAILABLE_DIFFICULTIES,
        available_duration_minutes=AVAILABLE_DURATIONS,
        default_configuration={
            "target_role_id": None if default_role is None else default_role.id,
            "round": InterviewRound.TECHNICAL,
            "difficulty": InterviewDifficulty.PRESSURE,
            "duration_minutes": InterviewDurationMinutes.THIRTY,
        },
    )


def build_interview_opening_session_response(
    session: InterviewSession,
) -> InterviewOpeningSessionResponse:
    language = cast(InteractionLanguage, session.language)
    return InterviewOpeningSessionResponse(
        status="opening",
        session_id=session.id,
        language=language,
        version=session.version,
        configuration=InterviewConfiguration(
            target_role_id=session.target_role_id,
            round=InterviewRound(session.round),
            difficulty=InterviewDifficulty(session.difficulty),
            duration_minutes=InterviewDurationMinutes(session.duration_minutes),
        ),
        started_at=session.started_at,
        progress=InterviewProgressResponse(
            completed_main_questions=0,
            total_main_questions=session.total_main_questions,
            plan_revision=session.plan_revision,
        ),
        completed_questions=[],
        opening_message=INTERVIEW_OPENING_MESSAGES[language],
    )


def interview_session_state_api_error(
    error: InterviewSessionStateError,
) -> APIError:
    return APIError(
        status.HTTP_404_NOT_FOUND
        if error.code == INTERVIEW_SESSION_NOT_FOUND
        else status.HTTP_409_CONFLICT,
        error.code,
    )


__all__ = [
    "AVAILABLE_DIFFICULTIES",
    "AVAILABLE_DURATIONS",
    "INTERVIEW_OPENING_MESSAGES",
    "SUPPORTED_ROUNDS",
    "InterviewAPIService",
    "build_interview_opening_session_response",
    "build_interview_page_response",
    "build_interview_setup_response",
    "interview_session_state_api_error",
]
