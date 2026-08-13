from collections.abc import Callable
from uuid import UUID

from fastapi import status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.errors import APIError
from riva.core.language import InteractionLanguage
from riva.models import PracticeAnswer, PracticeFollowUpQuestion, QuestionCard
from riva.schemas.evaluation import PracticeEvaluationFollowUpCompletionReason
from riva.schemas.practice_sessions import (
    ContinuePracticeQuestionRequest,
    CurrentPracticeSessionResponse,
    PracticeActiveSessionResponse,
    PracticeAnswerResponse,
    PracticeAnsweredFollowUpExchangeResponse,
    PracticeAnsweringFollowUpResponse,
    PracticeAnsweringResponse,
    PracticeAllAnsweredCompletionResponse,
    PracticeAwaitingFollowUpExchangeResponse,
    PracticeCompletedFollowUpCompletionResponse,
    PracticeEvaluationResponse,
    PracticeEvaluatingResponse,
    PracticeFollowUpQuestionResponse,
    PracticeGeneratingFollowUpResponse,
    PracticeGeneratingQuestionResponse,
    PracticeGuidanceNotRequestedResponse,
    PracticeNoFollowUpRequiredCompletionResponse,
    PracticeQuestionResponse,
    PracticeReferenceAnswerNotRequestedResponse,
    PracticeReviewContentResponse,
    PracticeReviewResponse,
    PracticeSessionSelection,
    RefreshPracticeEvaluationRequest,
    RefreshPracticeFollowUpGenerationRequest,
    RefreshPracticeQuestionGenerationRequest,
    StartPracticeSessionRequest,
    SubmitFollowUpAnswerRequest,
    SubmitPrimaryAnswerRequest,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.services.practice_sessions import (
    PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE,
    PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE,
    PRACTICE_REVIEW_GENERATION_UNAVAILABLE,
    PRACTICE_SESSION_NOT_FOUND,
    PRACTICE_SESSION_STATE_CONFLICT,
    PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
    PracticeAnsweredFollowUpExchangeContext,
    PracticeSessionService,
    PracticeSessionStateError,
    PracticePrimaryAnswerWorkflowContext,
    PracticeReviewWorkflowContext,
    PracticePublicWorkflowContext,
    PracticeSessionWorkflowContext,
)
from riva.services.evaluation_generation import (
    practice_evaluation_output_from_artifact,
)
from riva.services.recommendation_generation import (
    practice_recommendation_output_from_artifact,
)
from riva.services.review_generation import practice_review_output_from_artifact


PRACTICE_EVALUATION_GENERATION_UNAVAILABLE = (
    "practice_evaluation_generation_unavailable"
)

PracticeSessionServiceFactory = Callable[..., PracticeSessionService]


class PracticeAPIService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: str | None = None,
        llm_model: str | None = None,
        practice_service_factory: PracticeSessionServiceFactory = (
            PracticeSessionService
        ),
    ) -> None:
        self.session = session
        self.llm_provider = (llm_provider or "").strip().lower()
        self.llm_model = (llm_model or "").strip()
        self.practice_service_factory = practice_service_factory

    async def start_session(
        self,
        *,
        user_id: UUID,
        payload: StartPracticeSessionRequest,
        interaction_language: InteractionLanguage,
    ) -> PracticeActiveSessionResponse:
        try:
            self._require_llm_configuration(
                PRACTICE_QUESTION_GENERATION_UNAVAILABLE
            )
            context = await self._practice_service().start_session(
                user_id=user_id,
                selection=PracticeSessionSelection.model_validate(
                    payload.model_dump(mode="python", by_alias=False)
                ),
                interaction_language=interaction_language,
            )
            return build_practice_session_response(context)
        except PracticeSessionStateError as error:
            raise practice_session_state_api_error(error) from None

    async def refresh_question_generation(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: RefreshPracticeQuestionGenerationRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().refresh_question_generation(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
            )
            return build_practice_session_response(context)
        except PracticeSessionStateError as error:
            raise practice_session_state_api_error(error) from None

    async def continue_to_next_question(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: ContinuePracticeQuestionRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().continue_to_next_question(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
            )
            return build_practice_session_response(context)
        except PracticeSessionStateError as error:
            raise practice_session_state_api_error(error) from None

    async def submit_primary_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: SubmitPrimaryAnswerRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            self._require_llm_configuration(
                PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE
            )
            context = await self._practice_service().submit_primary_answer(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
                content=payload.content,
            )
            return build_practice_session_response(context)
        except PracticeSessionStateError as error:
            raise practice_session_state_api_error(error) from None

    async def submit_follow_up_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: SubmitFollowUpAnswerRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().submit_follow_up_answer(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
                follow_up_question_id=payload.follow_up_question_id,
                content=payload.content,
            )
            return build_practice_session_response(context)
        except PracticeSessionStateError as error:
            raise practice_session_state_api_error(error) from None

    async def refresh_follow_up_generation(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: RefreshPracticeFollowUpGenerationRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().refresh_follow_up_generation(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
            )
            return build_practice_session_response(context)
        except PracticeSessionStateError as error:
            raise practice_session_state_api_error(error) from None

    async def refresh_evaluation(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: RefreshPracticeEvaluationRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().refresh_evaluation_generation(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
            )
            return build_practice_session_response(context)
        except PracticeSessionStateError as error:
            raise practice_session_state_api_error(error) from None

    async def get_session(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().get_session_context(
                user_id=user_id,
                session_id=session_id,
            )
            return build_practice_session_response(context)
        except PracticeSessionStateError as error:
            raise practice_session_state_api_error(error) from None

    async def get_current_session(
        self,
        *,
        user_id: UUID,
    ) -> CurrentPracticeSessionResponse:
        try:
            context = await self._practice_service().get_active_session_context(
                user_id=user_id,
            )
            return CurrentPracticeSessionResponse(
                session=(
                    build_practice_session_response(context)
                    if context is not None
                    else None
                )
            )
        except PracticeSessionStateError as error:
            raise practice_session_state_api_error(error) from None

    def _practice_service(self) -> PracticeSessionService:
        return self.practice_service_factory(
            self.session,
            llm_model=self.llm_model,
        )

    def _require_llm_configuration(self, error_code: str) -> str:
        if self.llm_provider != "qwen" or not self.llm_model:
            raise APIError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                error_code,
            )
        return self.llm_model


PracticeSessionAPIService = PracticeAPIService


def build_practice_session_response(
    context: PracticePublicWorkflowContext,
) -> PracticeActiveSessionResponse:
    try:
        base = {
            "session_id": context.session.id,
            "language": context.session.language,
            "version": context.session.version,
            "selection": PracticeSessionSelection(
                target_role_id=context.session.target_role_id,
                question_type=QuestionCardQuestionType(
                    context.attempt.question_type
                ),
                difficulty=QuestionCardDifficulty(context.attempt.difficulty),
                source=context.session.source,
                prioritize_weaknesses=context.session.prioritize_weaknesses,
            ),
            "started_at": context.session.started_at,
            "attempt_id": context.attempt.id,
            "attempt_number": context.attempt.attempt_number,
        }
        if context.attempt.status == "generatingQuestion":
            return PracticeGeneratingQuestionResponse(
                status="generatingQuestion",
                **base,
            )
        if isinstance(context, PracticeReviewWorkflowContext):
            if (
                context.attempt.status != "review"
                or context.follow_up_decision is None
                or context.follow_up_question is not None
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            evaluation_output = practice_evaluation_output_from_artifact(
                context.evaluation,
                scoring_focus_count=len(context.question_card.scoring_focus),
            )
            review_output = practice_review_output_from_artifact(context.review)
            recommendation_output = practice_recommendation_output_from_artifact(
                context.recommendation
            )
            follow_up_exchanges = _build_practice_answered_follow_up_exchanges(
                context.follow_up_exchanges
            )
            follow_up_completion = build_practice_follow_up_completion_response(
                context.follow_up_completion_reason
            )
            return PracticeReviewResponse(
                status="review",
                question=build_practice_question_response(context.question_card),
                main_answer=build_practice_answer_response(context.main_answer),
                follow_up_exchanges=follow_up_exchanges,
                follow_up_completion=follow_up_completion,
                evaluation=PracticeEvaluationResponse(
                    overall_score=evaluation_output.overall_score,
                    dimension_scores=evaluation_output.dimension_scores,
                    evaluated_at=context.evaluation.evaluated_at,
                ),
                review=PracticeReviewContentResponse(
                    overall_performance=review_output.overall_performance,
                    highlights=review_output.highlights,
                    main_issues=review_output.main_issues,
                    improvement_suggestions=review_output.improvement_suggestions,
                    reusable_answer_structure=review_output.reusable_answer_structure,
                    exposed_weaknesses=review_output.exposed_weaknesses,
                    recommendation=recommendation_output,
                ),
                **base,
            )
        if context.attempt.status == "answering":
            if context.question_card is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if isinstance(context, PracticePrimaryAnswerWorkflowContext):
                return PracticeGeneratingFollowUpResponse(
                    status="generatingFollowUp",
                    question=build_practice_question_response(
                        context.question_card
                    ),
                    main_answer=build_practice_answer_response(context.main_answer),
                    follow_up_exchanges=_build_practice_answered_follow_up_exchanges(
                        context.follow_up_exchanges
                    ),
                    **base,
                )
            return PracticeAnsweringResponse(
                status="answering",
                question=build_practice_question_response(context.question_card),
                **base,
            )
        if isinstance(context, PracticePrimaryAnswerWorkflowContext):
            if context.question_card is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            main_answer = build_practice_answer_response(context.main_answer)
            question = build_practice_question_response(context.question_card)
            if context.attempt.status == "answeringFollowUp":
                if (
                    context.follow_up_decision is None
                    or context.follow_up_decision.action != "askFollowUp"
                    or context.follow_up_question is None
                ):
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_STATE_CONFLICT
                    )
                current_follow_up = PracticeAwaitingFollowUpExchangeResponse(
                    status="awaitingAnswer",
                    question=build_practice_follow_up_question_response(
                        context.follow_up_question
                    ),
                    answer=None,
                )
                return PracticeAnsweringFollowUpResponse(
                    status="answeringFollowUp",
                    question=question,
                    main_answer=main_answer,
                    follow_up_exchanges=_build_practice_answered_follow_up_exchanges(
                        context.follow_up_exchanges
                    ),
                    current_follow_up=current_follow_up,
                    **base,
                )
            if context.attempt.status == "evaluating":
                if (
                    context.follow_up_decision is None
                    or context.follow_up_question is not None
                ):
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_STATE_CONFLICT
                    )
                return PracticeEvaluatingResponse(
                    status="evaluating",
                    question=question,
                    main_answer=main_answer,
                    follow_up_exchanges=_build_practice_answered_follow_up_exchanges(
                        context.follow_up_exchanges
                    ),
                    follow_up_completion=build_practice_follow_up_completion_response(
                        context.follow_up_completion_reason
                    ),
                    submitted_at=context.attempt.updated_at,
                    **base,
                )
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
    except PracticeSessionStateError:
        raise
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def build_practice_question_response(card: QuestionCard) -> PracticeQuestionResponse:
    try:
        return PracticeQuestionResponse.model_validate(
            {
                "id": card.id,
                "prompt": card.prompt,
                "question_type": card.question_type,
                "difficulty": card.difficulty,
                "assessed_capabilities": list(card.assessed_capabilities),
                "recommended_materials": list(card.recommended_materials),
                "answer_hints": PracticeGuidanceNotRequestedResponse(
                    status="notRequested"
                ),
                "answer_framework": PracticeGuidanceNotRequestedResponse(
                    status="notRequested"
                ),
                "reference_answer": PracticeReferenceAnswerNotRequestedResponse(
                    status="notRequested"
                ),
                "is_saved": card.is_saved,
                "is_marked_weak": card.is_marked_weak,
            }
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def build_practice_answer_response(
    answer: PracticeAnswer,
) -> PracticeAnswerResponse:
    try:
        return PracticeAnswerResponse.model_validate(
            {
                "id": answer.id,
                "content": answer.content,
                "created_at": answer.submitted_at,
                "order": answer.order,
            }
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def build_practice_follow_up_question_response(
    question: PracticeFollowUpQuestion,
) -> PracticeFollowUpQuestionResponse:
    try:
        return PracticeFollowUpQuestionResponse.model_validate(
            {
                "id": question.id,
                "prompt": question.prompt,
                "created_at": question.created_at,
                "order": question.order,
                "answer_hints": PracticeGuidanceNotRequestedResponse(
                    status="notRequested"
                ),
                "answer_framework": PracticeGuidanceNotRequestedResponse(
                    status="notRequested"
                ),
                "reference_answer": PracticeReferenceAnswerNotRequestedResponse(
                    status="notRequested"
                ),
            }
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def build_practice_answered_follow_up_exchange_response(
    exchange: PracticeAnsweredFollowUpExchangeContext,
) -> PracticeAnsweredFollowUpExchangeResponse:
    try:
        return PracticeAnsweredFollowUpExchangeResponse(
            status="answered",
            question=build_practice_follow_up_question_response(exchange.question),
            answer=build_practice_answer_response(exchange.answer),
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def _build_practice_answered_follow_up_exchanges(
    exchanges: tuple[PracticeAnsweredFollowUpExchangeContext, ...],
) -> list[PracticeAnsweredFollowUpExchangeResponse]:
    return [
        build_practice_answered_follow_up_exchange_response(exchange)
        for exchange in exchanges
    ]


def build_practice_follow_up_completion_response(
    reason: PracticeEvaluationFollowUpCompletionReason | None,
) -> PracticeCompletedFollowUpCompletionResponse:
    if reason == PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED:
        return PracticeNoFollowUpRequiredCompletionResponse(
            status="completed",
            reason="noFollowUpRequired",
        )
    if reason == PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED:
        return PracticeAllAnsweredCompletionResponse(
            status="completed",
            reason="allAnswered",
        )
    raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)


def practice_session_state_api_error(error: PracticeSessionStateError) -> APIError:
    error_status = (
        status.HTTP_404_NOT_FOUND
        if error.code == PRACTICE_SESSION_NOT_FOUND
        else status.HTTP_503_SERVICE_UNAVAILABLE
        if error.code
        in {
            PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
            PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE,
            PRACTICE_EVALUATION_GENERATION_UNAVAILABLE,
            PRACTICE_REVIEW_GENERATION_UNAVAILABLE,
            PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE,
        }
        else status.HTTP_409_CONFLICT
    )
    return APIError(error_status, error.code)


__all__ = [
    "PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE",
    "PRACTICE_EVALUATION_GENERATION_UNAVAILABLE",
    "PRACTICE_REVIEW_GENERATION_UNAVAILABLE",
    "PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE",
    "PRACTICE_QUESTION_GENERATION_UNAVAILABLE",
    "PracticeAPIService",
    "PracticeSessionAPIService",
    "build_practice_question_response",
    "build_practice_answer_response",
    "build_practice_answered_follow_up_exchange_response",
    "build_practice_follow_up_question_response",
    "build_practice_follow_up_completion_response",
    "build_practice_session_response",
    "practice_session_state_api_error",
]
