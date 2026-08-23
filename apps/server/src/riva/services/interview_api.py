from collections.abc import Callable
from typing import cast
from uuid import UUID

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.errors import APIError
from riva.core.language import InteractionLanguage
from riva.integrations import LLMProvider
from riva.models import (
    InterviewCandidateQuestion,
    InterviewCandidateQuestionExchange,
    InterviewReview,
    InterviewSession,
)
from riva.schemas.interview import (
    BeginInterviewQuestionsRequest,
    EndInterviewRequest,
    FinishInterviewRequest,
    GetInterviewCompleteReviewResponse,
    GetInterviewPartialReviewResponse,
    GetInterviewReviewResponse,
    GetInterviewUnavailableReviewResponse,
    InterviewAnsweredFollowUpResponse,
    InterviewAnsweredQuestionResponse,
    InterviewAnswerResponse,
    InterviewAwaitingFollowUpResponse,
    InterviewAwaitingQuestionResponse,
    InterviewCandidateQuestionExchangeResponse,
    InterviewCandidateQuestionFeedbackResponse,
    InterviewCandidateQuestionResponse,
    InterviewCandidateQuestionsSessionResponse,
    InterviewCompletedQuestionResponse,
    InterviewCompletedSessionResponse,
    InterviewCompleteReviewResponse,
    InterviewCompleteReviewStateResponse,
    InterviewCompletionReason,
    InterviewConfiguration,
    InterviewDifficulty,
    InterviewDurationMinutes,
    InterviewFollowUpQuestionResponse,
    InterviewFollowUpSessionResponse,
    InterviewOpeningSessionResponse,
    InterviewPageResponse,
    InterviewPartialReviewResponse,
    InterviewPartialReviewStateResponse,
    InterviewProgressResponse,
    InterviewQuestionResponse,
    InterviewQuestionSessionResponse,
    InterviewQuestionType,
    InterviewRound,
    InterviewSessionReviewResponse,
    InterviewSetupAvailableResponse,
    InterviewSetupBlockedResponse,
    InterviewSetupResponse,
    InterviewTargetRoleResponse,
    InterviewUnavailableReviewResponse,
    StartInterviewRequest,
    SubmitCandidateQuestionRequest,
    SubmitInterviewAnswerRequest,
)
from riva.services.interview_candidate_questions import (
    INTERVIEW_CANDIDATE_QUESTION_MODEL_NOT_CONFIGURED,
    INTERVIEW_CANDIDATE_QUESTION_SESSION_NOT_FOUND,
    InterviewCandidateQuestionService,
    InterviewCandidateQuestionStateError,
)
from riva.services.interview_completion import (
    INTERVIEW_COMPLETION_MODEL_NOT_CONFIGURED,
    INTERVIEW_COMPLETION_SESSION_NOT_FOUND,
    InterviewCompletionService,
    InterviewCompletionStateError,
)
from riva.services.interview_planning import (
    INTERVIEW_PLANNER_MODEL_NOT_CONFIGURED,
    INTERVIEW_PLANNING_SESSION_NOT_FOUND,
    InterviewPlanningService,
    InterviewPlanningStateError,
)
from riva.services.interview_review import (
    INTERVIEW_REVIEW_MODEL_NOT_CONFIGURED,
    INTERVIEW_REVIEW_SESSION_NOT_FOUND,
    InterviewReviewService,
    InterviewReviewStateError,
)
from riva.services.interview_sessions import (
    INTERVIEW_SESSION_NOT_FOUND,
    InterviewSessionService,
    InterviewSessionStateError,
    InterviewSetupContext,
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
InterviewCandidateQuestionServiceFactory = Callable[
    ..., InterviewCandidateQuestionService
]
InterviewCompletionServiceFactory = Callable[..., InterviewCompletionService]
InterviewReviewServiceFactory = Callable[..., InterviewReviewService]

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
        interview_candidate_question_service_factory: InterviewCandidateQuestionServiceFactory = (
            InterviewCandidateQuestionService
        ),
        interview_completion_service_factory: InterviewCompletionServiceFactory = (
            InterviewCompletionService
        ),
        interview_review_service_factory: InterviewReviewServiceFactory = (
            InterviewReviewService
        ),
        llm_provider: LLMProvider | None = None,
        llm_model: str | None = None,
    ) -> None:
        self.session = session
        self.interview_service_factory = interview_service_factory
        self.interview_planning_service_factory = interview_planning_service_factory
        self.interview_turn_service_factory = interview_turn_service_factory
        self.interview_candidate_question_service_factory = (
            interview_candidate_question_service_factory
        )
        self.interview_completion_service_factory = interview_completion_service_factory
        self.interview_review_service_factory = interview_review_service_factory
        self.llm_provider = llm_provider
        self.llm_model = llm_model

    async def get_page(self, *, user_id: UUID) -> InterviewPageResponse:
        service = self._interview_service()
        setup = await service.get_setup(user_id=user_id)
        get_current_session = getattr(
            service,
            "get_current_session",
            service.get_active_session,
        )
        current_session = await get_current_session(user_id=user_id)
        return build_interview_page_response(setup, current_session)

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
            active_session = await interview_service.get_active_session(user_id=user_id)
            if active_session is None or active_session.id != session_id:
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_SESSION_NOT_FOUND)
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

    async def submit_candidate_question(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: SubmitCandidateQuestionRequest,
    ) -> InterviewPageResponse:
        try:
            await self._candidate_question_service().submit_question(
                user_id=user_id,
                session_id=session_id,
                version=payload.version,
                content=payload.content,
            )
            return await self._page_for_session(user_id, session_id)
        except InterviewCandidateQuestionStateError as error:
            raise interview_candidate_question_state_api_error(error) from None
        except InterviewSessionStateError as error:
            raise interview_session_state_api_error(error) from None

    async def finish_session(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: FinishInterviewRequest,
    ) -> InterviewPageResponse:
        try:
            await self._completion_service().finish(
                user_id=user_id,
                session_id=session_id,
                version=payload.version,
            )
            return await self._page_for_session(user_id, session_id)
        except InterviewCompletionStateError as error:
            raise interview_completion_state_api_error(error) from None
        except InterviewSessionStateError as error:
            raise interview_session_state_api_error(error) from None

    async def end_session(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: EndInterviewRequest,
    ) -> InterviewPageResponse:
        try:
            await self._completion_service().end(
                user_id=user_id,
                session_id=session_id,
                version=payload.version,
            )
            return await self._page_for_session(user_id, session_id)
        except InterviewCompletionStateError as error:
            raise interview_completion_state_api_error(error) from None
        except InterviewSessionStateError as error:
            raise interview_session_state_api_error(error) from None

    async def get_review(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
    ) -> GetInterviewReviewResponse:
        try:
            (
                interview_session,
                review,
            ) = await self._review_service().get_completed_review(
                user_id=user_id,
                session_id=session_id,
            )
            return build_interview_review_response(interview_session, review)
        except InterviewReviewStateError as error:
            raise interview_review_state_api_error(error) from None

    def _interview_service(self) -> InterviewSessionService:
        return self.interview_service_factory(self.session)

    def _planning_service(self) -> InterviewPlanningService:
        if self.llm_model is None:
            return self.interview_planning_service_factory(self.session)
        return self.interview_planning_service_factory(
            self.session,
            llm_provider=self.llm_provider,
            llm_model=self.llm_model,
        )

    def _turn_service(self) -> InterviewTurnService:
        if self.llm_model is None:
            return self.interview_turn_service_factory(self.session)
        return self.interview_turn_service_factory(
            self.session,
            llm_provider=self.llm_provider,
            llm_model=self.llm_model,
        )

    def _candidate_question_service(self) -> InterviewCandidateQuestionService:
        if self.llm_model is None:
            return self.interview_candidate_question_service_factory(self.session)
        return self.interview_candidate_question_service_factory(
            self.session,
            llm_provider=self.llm_provider,
            llm_model=self.llm_model,
        )

    def _completion_service(self) -> InterviewCompletionService:
        if self.llm_model is None:
            return self.interview_completion_service_factory(self.session)
        return self.interview_completion_service_factory(
            self.session,
            llm_provider=self.llm_provider,
            llm_model=self.llm_model,
        )

    def _review_service(self) -> InterviewReviewService:
        if self.llm_model is None:
            return self.interview_review_service_factory(self.session)
        return self.interview_review_service_factory(
            self.session,
            llm_provider=self.llm_provider,
            llm_model=self.llm_model,
        )

    async def _page_for_session(
        self,
        user_id: UUID,
        session_id: UUID,
    ) -> InterviewPageResponse:
        interview_service = self._interview_service()
        setup = await interview_service.get_setup(user_id=user_id)
        get_current_session = getattr(
            interview_service,
            "get_current_session",
            interview_service.get_active_session,
        )
        current_session = await get_current_session(user_id=user_id)
        if current_session is None or current_session.id != session_id:
            raise InterviewTurnStateError(INTERVIEW_TURN_SESSION_NOT_FOUND)
        return build_interview_page_response(setup, current_session)


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
    elif setup.blocked_reason == "noTargetRoles":
        availability = InterviewSetupBlockedResponse(
            status="blocked",
            reason="noTargetRoles",
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
    | InterviewQuestionSessionResponse
    | InterviewFollowUpSessionResponse
    | InterviewCandidateQuestionsSessionResponse
    | InterviewCompletedSessionResponse
):
    if session.status == "opening":
        return build_interview_opening_session_response(session)
    questions = sorted(
        list(getattr(session, "questions", ())),
        key=lambda question: question.order,
    )
    completed_questions = _completed_questions(questions)
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
            prompt=CANDIDATE_QUESTIONS_PROMPTS[
                cast(InteractionLanguage, session.language)
            ],
            exchanges=_candidate_exchange_responses(session),
        )
    if session.status == "completed":
        review = getattr(session, "review", None)
        if (
            review is None
            or session.completed_at is None
            or session.completion_reason is None
        ):
            raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND)
        return InterviewCompletedSessionResponse(
            status="completed",
            session_id=session.id,
            language=cast(InteractionLanguage, session.language),
            version=session.version,
            configuration=_session_configuration_response(session),
            started_at=session.started_at,
            progress=_session_progress_response(session),
            completed_questions=completed_questions,
            completion_reason=cast(
                InterviewCompletionReason,
                session.completion_reason,
            ),
            completed_at=session.completed_at,
            candidate_question_exchanges=_candidate_exchange_responses(session),
            review=_review_state_response(review),
            question_details=list(review.question_details),
        )
    raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND)


def _candidate_question_response(
    question: InterviewCandidateQuestion,
) -> InterviewCandidateQuestionResponse:
    return InterviewCandidateQuestionResponse(
        id=question.id,
        content=question.content,
        submitted_at=question.submitted_at,
    )


def _candidate_exchange_response(
    exchange: InterviewCandidateQuestionExchange,
) -> InterviewCandidateQuestionExchangeResponse:
    return InterviewCandidateQuestionExchangeResponse(
        question=_candidate_question_response(exchange.question),
        interviewer_answer=exchange.interviewer_answer,
        feedback=InterviewCandidateQuestionFeedbackResponse(
            summary=exchange.feedback_summary,
            strengths=list(exchange.strengths),
            improvement_suggestions=list(exchange.improvement_suggestions),
            suggested_alternatives=list(exchange.suggested_alternatives),
        ),
    )


def _candidate_exchange_responses(
    session: InterviewSession,
) -> list[InterviewCandidateQuestionExchangeResponse]:
    exchanges = sorted(
        list(getattr(session, "candidate_question_exchanges", ())),
        key=lambda exchange: (
            getattr(getattr(exchange, "question", None), "order", 0),
            exchange.created_at,
            exchange.id,
        ),
    )
    try:
        return [_candidate_exchange_response(exchange) for exchange in exchanges]
    except AttributeError, TypeError, ValueError:
        raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND) from None


def _current_candidate_question(
    session: InterviewSession,
) -> InterviewCandidateQuestion | None:
    questions = sorted(
        list(getattr(session, "candidate_questions", ())),
        key=lambda question: question.order,
    )
    for question in reversed(questions):
        if getattr(question, "exchange", None) is None:
            return question
    return None


def _review_state_response(
    review: InterviewReview,
) -> InterviewSessionReviewResponse:
    try:
        status_value = str(review.status)
        if status_value == "unavailable":
            return InterviewUnavailableReviewResponse(
                status="unavailable",
                reason="insufficientAnswers",
            )
        if review.review is None:
            raise ValueError
        if status_value == "partial":
            return InterviewPartialReviewStateResponse(
                status="partial",
                review=InterviewPartialReviewResponse.model_validate(review.review),
            )
        if status_value == "complete":
            return InterviewCompleteReviewStateResponse(
                status="complete",
                review=InterviewCompleteReviewResponse.model_validate(review.review),
            )
    except TypeError, ValueError:
        pass
    raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND)


def build_interview_review_response(
    session: InterviewSession,
    review: InterviewReview,
) -> GetInterviewReviewResponse:
    if session.completed_at is None or session.completion_reason is None:
        raise InterviewReviewStateError(INTERVIEW_REVIEW_SESSION_NOT_FOUND)
    question_details = list(review.question_details)
    completion_reason = cast(
        InterviewCompletionReason,
        session.completion_reason,
    )
    if review.status == "unavailable":
        return GetInterviewUnavailableReviewResponse(
            status="unavailable",
            reason="insufficientAnswers",
            session_id=session.id,
            completion_reason=completion_reason,
            question_details=question_details,
        )
    if review.review is None:
        raise InterviewReviewStateError(INTERVIEW_REVIEW_SESSION_NOT_FOUND)
    if review.status == "partial":
        return GetInterviewPartialReviewResponse(
            status="partial",
            review=InterviewPartialReviewResponse.model_validate(review.review),
            session_id=session.id,
            completion_reason=completion_reason,
            question_details=question_details,
        )
    if review.status == "complete":
        return GetInterviewCompleteReviewResponse(
            status="complete",
            review=InterviewCompleteReviewResponse.model_validate(review.review),
            session_id=session.id,
            completion_reason=completion_reason,
            question_details=question_details,
        )
    raise InterviewReviewStateError(INTERVIEW_REVIEW_SESSION_NOT_FOUND)


def _session_configuration_response(
    session: InterviewSession,
) -> InterviewConfiguration:
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
    except AttributeError, TypeError, ValueError:
        raise InterviewSessionStateError(INTERVIEW_SESSION_NOT_FOUND) from None


def _answer_response(answer: object) -> InterviewAnswerResponse:
    try:
        return InterviewAnswerResponse(
            id=answer.id,
            content=answer.content,
            submitted_at=answer.submitted_at,
        )
    except AttributeError, TypeError, ValueError:
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
    except AttributeError, TypeError, ValueError:
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
) -> InterviewAnsweredQuestionResponse:
    follow_ups = [
        _answered_follow_up_response(follow_up)
        for follow_up in sorted(
            list(getattr(question, "follow_up_questions", ())),
            key=lambda item: item.order,
        )
        if getattr(follow_up, "answer", None) is not None
    ]
    return InterviewAnsweredQuestionResponse(
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


def interview_candidate_question_state_api_error(
    error: InterviewCandidateQuestionStateError,
) -> APIError:
    if error.code == INTERVIEW_CANDIDATE_QUESTION_SESSION_NOT_FOUND:
        return APIError(status.HTTP_404_NOT_FOUND, error.code)
    if error.code == INTERVIEW_CANDIDATE_QUESTION_MODEL_NOT_CONFIGURED:
        return APIError(status.HTTP_503_SERVICE_UNAVAILABLE, error.code)
    return APIError(status.HTTP_409_CONFLICT, error.code)


def interview_completion_state_api_error(
    error: InterviewCompletionStateError,
) -> APIError:
    if error.code == INTERVIEW_COMPLETION_SESSION_NOT_FOUND:
        return APIError(status.HTTP_404_NOT_FOUND, error.code)
    if error.code == INTERVIEW_COMPLETION_MODEL_NOT_CONFIGURED:
        return APIError(status.HTTP_503_SERVICE_UNAVAILABLE, error.code)
    return APIError(status.HTTP_409_CONFLICT, error.code)


def interview_review_state_api_error(
    error: InterviewReviewStateError,
) -> APIError:
    if error.code == INTERVIEW_REVIEW_SESSION_NOT_FOUND:
        return APIError(status.HTTP_404_NOT_FOUND, error.code)
    if error.code == INTERVIEW_REVIEW_MODEL_NOT_CONFIGURED:
        return APIError(status.HTTP_503_SERVICE_UNAVAILABLE, error.code)
    return APIError(status.HTTP_409_CONFLICT, error.code)


__all__ = [
    "AVAILABLE_DIFFICULTIES",
    "AVAILABLE_DURATIONS",
    "INTERVIEW_OPENING_MESSAGES",
    "SUPPORTED_ROUNDS",
    "InterviewAPIService",
    "build_interview_review_response",
    "build_interview_opening_session_response",
    "build_interview_page_response",
    "build_interview_session_response",
    "build_interview_setup_response",
    "interview_planning_state_api_error",
    "interview_candidate_question_state_api_error",
    "interview_completion_state_api_error",
    "interview_review_state_api_error",
    "interview_session_state_api_error",
    "interview_turn_state_api_error",
]
