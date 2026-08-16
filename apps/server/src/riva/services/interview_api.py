from collections.abc import Callable
from typing import cast
from uuid import UUID

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.errors import APIError
from riva.core.language import InteractionLanguage
from riva.models import InterviewSession
from riva.schemas.interview import (
    BeginInterviewQuestionsRequest,
    InterviewAnswerResponse,
    InterviewAnsweredFollowUpResponse,
    InterviewAwaitingFollowUpResponse,
    InterviewConfiguration,
    InterviewCandidateQuestionsSessionResponse,
    InterviewCompletedQuestionResponse,
    InterviewDifficulty,
    InterviewDurationMinutes,
    InterviewAwaitingQuestionResponse,
    InterviewGeneratingQuestionSessionResponse,
    InterviewGeneratingTurnQuestionResponse,
    InterviewGeneratingTurnSessionResponse,
    InterviewFollowUpQuestionResponse,
    InterviewFollowUpSessionResponse,
    InterviewOpeningSessionResponse,
    InterviewPageResponse,
    InterviewProgressResponse,
    InterviewQuestionResponse,
    InterviewQuestionSessionResponse,
    InterviewQuestionType,
    InterviewRound,
    RetryInterviewTurnRequest,
    SubmitInterviewAnswerRequest,
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
from riva.services.interview_planning import (
    INTERVIEW_PLANNER_MODEL_NOT_CONFIGURED,
    INTERVIEW_PLANNING_SESSION_NOT_FOUND,
    InterviewPlanningService,
    InterviewPlanningStateError,
)
from riva.services.interview_turn import (
    INTERVIEW_TURN_MODEL_NOT_CONFIGURED,
    INTERVIEW_TURN_SESSION_NOT_FOUND,
    InterviewTurnService,
    InterviewTurnStateError,
)


InterviewSessionServiceFactory = Callable[[AsyncSession], InterviewSessionService]
InterviewPlanningServiceFactory = Callable[..., InterviewPlanningService]
InterviewTurnServiceFactory = Callable[..., InterviewTurnService]

INTERVIEW_OPENING_MESSAGES: dict[InteractionLanguage, str] = {
    "zh-CN": (
        "你好，我是本次模拟面试的面试官。接下来会围绕岗位经历、项目能力和求职动机连续提问，请尽量像正式面试一样作答。"
    ),
    "en": (
        "Hello, I am your interviewer for this session. We will discuss your experience, project capabilities, and motivation. Please answer as you would in a formal interview."
    ),
}
CANDIDATE_QUESTIONS_PROMPTS: dict[InteractionLanguage, str] = {
    "zh-CN": "正式问题已经完成。现在你可以向面试官提问。",
    "en": "The formal questions are complete. You may now ask the interviewer questions.",
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
        interview_planning_service_factory: InterviewPlanningServiceFactory = (
            InterviewPlanningService
        ),
        interview_turn_service_factory: InterviewTurnServiceFactory = (
            InterviewTurnService
        ),
        llm_model: str | None = None,
    ) -> None:
        self.session = session
        self.interview_service_factory = interview_service_factory
        self.interview_planning_service_factory = (
            interview_planning_service_factory
        )
        self.interview_turn_service_factory = interview_turn_service_factory
        self.llm_model = llm_model

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

    async def begin_questions(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: BeginInterviewQuestionsRequest,
    ) -> InterviewPageResponse:
        try:
            planner = self._planning_service()
            await planner.begin_questions(
                user_id=user_id,
                session_id=session_id,
                version=payload.version,
            )
            interview_service = self._interview_service()
            setup = await interview_service.get_setup(user_id=user_id)
            active_session = await interview_service.get_active_session(
                user_id=user_id
            )
            if active_session is None or active_session.id != session_id:
                raise InterviewPlanningStateError(
                    INTERVIEW_PLANNING_SESSION_NOT_FOUND
                )
            return build_interview_page_response(setup, active_session)
        except InterviewPlanningStateError as error:
            raise interview_planning_state_api_error(error) from None
        except InterviewSessionStateError as error:
            raise interview_session_state_api_error(error) from None

    async def submit_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: SubmitInterviewAnswerRequest,
    ) -> InterviewPageResponse:
        try:
            turn = self._turn_service()
            await turn.submit_answer(
                user_id=user_id,
                session_id=session_id,
                version=payload.version,
                target=payload.target,
                question_id=payload.question_id,
                content=payload.content,
                follow_up_question_id=getattr(
                    payload,
                    "follow_up_question_id",
                    None,
                ),
            )
            return await self._page_for_session(user_id, session_id)
        except InterviewTurnStateError as error:
            raise interview_turn_state_api_error(error) from None
        except InterviewSessionStateError as error:
            raise interview_session_state_api_error(error) from None

    async def retry_turn(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: RetryInterviewTurnRequest,
    ) -> InterviewPageResponse:
        try:
            await self._turn_service().retry_turn(
                user_id=user_id,
                session_id=session_id,
                version=payload.version,
            )
            return await self._page_for_session(user_id, session_id)
        except InterviewTurnStateError as error:
            raise interview_turn_state_api_error(error) from None
        except InterviewSessionStateError as error:
            raise interview_session_state_api_error(error) from None

    def _interview_service(self) -> InterviewSessionService:
        return self.interview_service_factory(self.session)

    def _planning_service(self) -> InterviewPlanningService:
        if self.llm_model is None:
            return self.interview_planning_service_factory(self.session)
        return self.interview_planning_service_factory(
            self.session,
            llm_model=self.llm_model,
        )

    def _turn_service(self) -> InterviewTurnService:
        if self.llm_model is None:
            return self.interview_turn_service_factory(self.session)
        return self.interview_turn_service_factory(
            self.session,
            llm_model=self.llm_model,
        )

    async def _page_for_session(
        self,
        user_id: UUID,
        session_id: UUID,
    ) -> InterviewPageResponse:
        interview_service = self._interview_service()
        setup = await interview_service.get_setup(user_id=user_id)
        active_session = await interview_service.get_active_session(user_id=user_id)
        if active_session is None or active_session.id != session_id:
            raise InterviewTurnStateError(INTERVIEW_TURN_SESSION_NOT_FOUND)
        return build_interview_page_response(setup, active_session)


def build_interview_page_response(
    setup: InterviewSetupContext,
    session: InterviewSession | None,
) -> InterviewPageResponse:
    return InterviewPageResponse(
        setup=build_interview_setup_response(setup),
        session=None if session is None else build_interview_session_response(session),
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


def build_interview_session_response(
    session: InterviewSession,
) -> (
    InterviewOpeningSessionResponse
    | InterviewGeneratingQuestionSessionResponse
    | InterviewQuestionSessionResponse
    | InterviewGeneratingTurnSessionResponse
    | InterviewFollowUpSessionResponse
    | InterviewCandidateQuestionsSessionResponse
):
    if session.status == "opening":
        return build_interview_opening_session_response(session)
    questions = sorted(
        list(getattr(session, "questions", ())),
        key=lambda question: question.order,
    )
    completed_questions = _completed_questions(questions)
    if session.status == "generatingQuestion":
        planning_run = getattr(session, "planning_run", None)
        generation_status = (
            "failed"
            if _status_value(getattr(planning_run, "status", None)) == "failed"
            else "generating"
        )
        return InterviewGeneratingQuestionSessionResponse(
            status="generatingQuestion",
            session_id=session.id,
            language=cast(InteractionLanguage, session.language),
            version=session.version,
            configuration=_session_configuration_response(session),
            started_at=session.started_at,
            progress=_session_progress_response(session),
            completed_questions=completed_questions,
            generation_status=generation_status,
        )
    if session.status == "question":
        question = _active_question(questions)
        if question is None:
            raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND)
        return InterviewQuestionSessionResponse(
            status="question",
            session_id=session.id,
            language=cast(InteractionLanguage, session.language),
            version=session.version,
            configuration=_session_configuration_response(session),
            started_at=session.started_at,
            progress=_session_progress_response(session),
            completed_questions=completed_questions,
            current_question=InterviewAwaitingQuestionResponse(
                status="awaitingAnswer",
                question=_question_response(question),
                answer=None,
            ),
        )
    if session.status == "generatingTurn":
        question = _active_question(questions)
        answer = None if question is None else getattr(question, "answer", None)
        if question is None or answer is None:
            raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND)
        return InterviewGeneratingTurnSessionResponse(
            status="generatingTurn",
            session_id=session.id,
            language=cast(InteractionLanguage, session.language),
            version=session.version,
            configuration=_session_configuration_response(session),
            started_at=session.started_at,
            progress=_session_progress_response(session),
            completed_questions=completed_questions,
            generation_status=_turn_generation_status(session),
            current_question=_current_answered_question_response(
                question,
                answer,
            ),
        )
    if session.status == "followUp":
        question = _active_question(questions)
        if question is None:
            raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND)
        answer = getattr(question, "answer", None)
        follow_up = _pending_follow_up(question)
        if answer is None or follow_up is None:
            raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND)
        return InterviewFollowUpSessionResponse(
            status="followUp",
            session_id=session.id,
            language=cast(InteractionLanguage, session.language),
            version=session.version,
            configuration=_session_configuration_response(session),
            started_at=session.started_at,
            progress=_session_progress_response(session),
            completed_questions=completed_questions,
            current_question=_current_answered_question_response(
                question,
                answer,
            ),
            current_follow_up=InterviewAwaitingFollowUpResponse(
                status="awaitingAnswer",
                question=_follow_up_question_response(follow_up),
                answer=None,
            ),
        )
    if session.status == "candidateQuestions":
        return InterviewCandidateQuestionsSessionResponse(
            status="candidateQuestions",
            session_id=session.id,
            language=cast(InteractionLanguage, session.language),
            version=session.version,
            configuration=_session_configuration_response(session),
            started_at=session.started_at,
            progress=_session_progress_response(session),
            completed_questions=completed_questions,
            prompt=CANDIDATE_QUESTIONS_PROMPTS[cast(InteractionLanguage, session.language)],
            exchanges=[],
        )
    raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND)


def _session_configuration_response(session: InterviewSession) -> InterviewConfiguration:
    return InterviewConfiguration(
        target_role_id=session.target_role_id,
        round=InterviewRound(session.round),
        difficulty=InterviewDifficulty(session.difficulty),
        duration_minutes=InterviewDurationMinutes(session.duration_minutes),
    )


def _session_progress_response(session: InterviewSession) -> InterviewProgressResponse:
    questions = list(getattr(session, "questions", ()))
    return InterviewProgressResponse(
        completed_main_questions=sum(
            1 for question in questions if getattr(question, "completed_at", None)
        ),
        total_main_questions=session.total_main_questions,
        plan_revision=session.plan_revision,
    )


def _active_question(questions: list[object]) -> object | None:
    active = [
        question
        for question in questions
        if getattr(question, "completed_at", None) is None
    ]
    return active[-1] if active else None


def _question_response(question: object) -> InterviewQuestionResponse:
    try:
        return InterviewQuestionResponse(
            id=question.id,
            prompt=question.prompt,
            type=InterviewQuestionType(question.question_type),
            assessed_capabilities=list(question.assessed_capabilities),
            order=question.order,
        )
    except (AttributeError, TypeError, ValueError):
        raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND) from None


def _answer_response(answer: object) -> InterviewAnswerResponse:
    try:
        return InterviewAnswerResponse(
            id=answer.id,
            content=answer.content,
            submitted_at=answer.submitted_at,
        )
    except (AttributeError, TypeError, ValueError):
        raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND) from None


def _follow_up_question_response(
    follow_up: object,
) -> InterviewFollowUpQuestionResponse:
    try:
        return InterviewFollowUpQuestionResponse(
            id=follow_up.id,
            parent_question_id=follow_up.parent_question_id,
            prompt=follow_up.prompt,
            order=follow_up.order,
            created_at=follow_up.created_at,
        )
    except (AttributeError, TypeError, ValueError):
        raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND) from None


def _answered_follow_up_response(
    follow_up: object,
) -> InterviewAnsweredFollowUpResponse:
    answer = getattr(follow_up, "answer", None)
    if answer is None:
        raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND)
    return InterviewAnsweredFollowUpResponse(
        status="answered",
        question=_follow_up_question_response(follow_up),
        answer=_answer_response(answer),
    )


def _current_answered_question_response(
    question: object,
    answer: object,
) -> InterviewGeneratingTurnQuestionResponse:
    follow_ups = [
        _answered_follow_up_response(follow_up)
        for follow_up in sorted(
            list(getattr(question, "follow_up_questions", ())),
            key=lambda item: item.order,
        )
        if getattr(follow_up, "answer", None) is not None
    ]
    return InterviewGeneratingTurnQuestionResponse(
        question=_question_response(question),
        answer=_answer_response(answer),
        answered_follow_ups=follow_ups,
    )


def _pending_follow_up(question: object) -> object | None:
    follow_ups = sorted(
        list(getattr(question, "follow_up_questions", ())),
        key=lambda item: item.order,
    )
    for follow_up in reversed(follow_ups):
        if getattr(follow_up, "answer", None) is None:
            return follow_up
    return None


def _completed_questions(
    questions: list[object],
) -> list[InterviewCompletedQuestionResponse]:
    result: list[InterviewCompletedQuestionResponse] = []
    for question in questions:
        completed_at = getattr(question, "completed_at", None)
        if completed_at is None:
            continue
        answer = getattr(question, "answer", None)
        if answer is None:
            raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND)
        result.append(
            InterviewCompletedQuestionResponse(
                question=_question_response(question),
                answer=_answer_response(answer),
                follow_ups=[
                    _answered_follow_up_response(follow_up)
                    for follow_up in sorted(
                        list(getattr(question, "follow_up_questions", ())),
                        key=lambda item: item.order,
                    )
                    if getattr(follow_up, "answer", None) is not None
                ],
                completed_at=completed_at,
            )
        )
    return result


def _turn_generation_status(session: InterviewSession) -> str:
    turn_run = getattr(session, "turn_run", None)
    return (
        "failed"
        if _status_value(getattr(turn_run, "status", None)) == "failed"
        else "generating"
    )


def _status_value(status_value: object) -> str:
    return str(getattr(status_value, "value", status_value))


def interview_session_state_api_error(
    error: InterviewSessionStateError,
) -> APIError:
    return APIError(
        status.HTTP_404_NOT_FOUND
        if error.code == INTERVIEW_SESSION_NOT_FOUND
        else status.HTTP_409_CONFLICT,
        error.code,
    )


def interview_planning_state_api_error(
    error: InterviewPlanningStateError,
) -> APIError:
    if error.code in {
        INTERVIEW_PLANNING_SESSION_NOT_FOUND,
        INTERVIEW_SESSION_NOT_FOUND,
    }:
        return APIError(status.HTTP_404_NOT_FOUND, error.code)
    if error.code == INTERVIEW_PLANNER_MODEL_NOT_CONFIGURED:
        return APIError(status.HTTP_503_SERVICE_UNAVAILABLE, error.code)
    return APIError(status.HTTP_409_CONFLICT, error.code)


def interview_turn_state_api_error(
    error: InterviewTurnStateError,
) -> APIError:
    if error.code in {
        INTERVIEW_TURN_SESSION_NOT_FOUND,
        INTERVIEW_SESSION_NOT_FOUND,
    }:
        return APIError(status.HTTP_404_NOT_FOUND, error.code)
    if error.code == INTERVIEW_TURN_MODEL_NOT_CONFIGURED:
        return APIError(status.HTTP_503_SERVICE_UNAVAILABLE, error.code)
    return APIError(status.HTTP_409_CONFLICT, error.code)


__all__ = [
    "AVAILABLE_DIFFICULTIES",
    "AVAILABLE_DURATIONS",
    "INTERVIEW_OPENING_MESSAGES",
    "SUPPORTED_ROUNDS",
    "InterviewAPIService",
    "build_interview_opening_session_response",
    "build_interview_page_response",
    "build_interview_session_response",
    "build_interview_setup_response",
    "interview_planning_state_api_error",
    "interview_session_state_api_error",
    "interview_turn_state_api_error",
]
