from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.practice.evaluation_types import (
    PracticeEvaluationFollowUpCompletionReason,
)
from riva.core.language import InteractionLanguage
from riva.models import PracticeAnswer, PracticeFollowUpQuestion, QuestionCard
from riva.services.errors import (
    DomainConflictError,
    ExternalDependencyError,
    ResourceMissingError,
    ServiceError,
)
from riva.services.practice.evaluation import (
    practice_evaluation_output_from_artifact,
)
from riva.services.practice.question_types import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.services.practice.recommendation import (
    practice_recommendation_output_from_artifact,
)
from riva.services.practice.reference_answer import (
    PracticeReferenceAnswerLifecycleStatus,
    PracticeReferenceAnswerTargetType,
    PracticeReferenceAnswerWorkflowState,
    ReferenceAnswerGenerationService,
    ReferenceAnswerGenerationStateError,
)
from riva.services.practice.review import (
    practice_review_output_from_artifact,
)
from riva.services.practice.session import (
    PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE,
    PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
    PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE,
    PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE,
    PRACTICE_REVIEW_GENERATION_UNAVAILABLE,
    PRACTICE_SESSION_NOT_FOUND,
    PRACTICE_SESSION_STATE_CONFLICT,
    PracticeAnsweredFollowUpExchangeContext,
    PracticeCompletedSessionWorkflowContext,
    PracticeEndedEarlySessionWorkflowContext,
    PracticeEvaluationWorkflowContext,
    PracticePrimaryAnswerWorkflowContext,
    PracticePublicWorkflowContext,
    PracticeReviewWorkflowContext,
    PracticeSessionService,
    PracticeSessionStateError,
)
from riva.services.practice.types import (
    CompletePracticeSessionRequest,
    ContinuePracticeQuestionRequest,
    CurrentPracticeSessionResponse,
    EndPracticeFollowUpsRequest,
    EndPracticeSessionEarlyRequest,
    PracticeActiveSessionResponse,
    PracticeAllAnsweredCompletionResponse,
    PracticeAnsweredFollowUpExchangeResponse,
    PracticeAnsweringFollowUpResponse,
    PracticeAnsweringResponse,
    PracticeAnswerResponse,
    PracticeAwaitingFollowUpExchangeResponse,
    PracticeCompletedSessionResponse,
    PracticeEndedEarlyFollowUpCompletionResponse,
    PracticeEvaluationResponse,
    PracticeFollowUpCompletionResponse,
    PracticeFollowUpQuestionResponse,
    PracticeFollowUpReferenceAnswerContentResponse,
    PracticeFollowUpReferenceAnswerRequest,
    PracticeFollowUpReferenceAnswerResponse,
    PracticeFollowUpReferenceAnswerRevealedResponse,
    PracticeGuidanceNotRequestedResponse,
    PracticeGuidanceResponse,
    PracticeGuidanceRevealedResponse,
    PracticeGuidanceUnavailableResponse,
    PracticeMainReferenceAnswerContentResponse,
    PracticeMainReferenceAnswerResponse,
    PracticeMainReferenceAnswerRevealedResponse,
    PracticeNoFollowUpRequiredCompletionResponse,
    PracticeQuestionReferenceAnswerRequest,
    PracticeQuestionResponse,
    PracticeReferenceAnswerNotRequestedResponse,
    PracticeReferenceAnswerUnavailableResponse,
    PracticeReviewContentResponse,
    PracticeReviewResponse,
    PracticeSessionResponse,
    PracticeSessionSelection,
    PracticeSetupAvailableResponse,
    PracticeSetupBlockedResponse,
    PracticeSetupResponse,
    PracticeUnfinishedAttemptResponse,
    RetryPracticeQuestionRequest,
    RevealPracticeFollowUpGuidanceRequest,
    RevealPracticeQuestionGuidanceRequest,
    SetPracticeQuestionSavedRequest,
    SetPracticeQuestionWeakRequest,
    SkipPracticeQuestionRequest,
    StartPracticeSessionRequest,
    SubmitFollowUpAnswerRequest,
    SubmitPrimaryAnswerRequest,
)
from riva.services.training.eligibility import (
    TrainingRoleEligibilityService,
)

PRACTICE_EVALUATION_GENERATION_UNAVAILABLE = (
    "practice_evaluation_generation_unavailable"
)

PracticeSessionServiceFactory = Callable[..., PracticeSessionService]
TrainingRoleEligibilityServiceFactory = Callable[
    [AsyncSession], TrainingRoleEligibilityService
]
ReferenceAnswerGenerationServiceFactory = Callable[
    ..., ReferenceAnswerGenerationService
]


@dataclass(frozen=True)
class _PracticeReferenceAnswerProjection:
    main: PracticeReferenceAnswerWorkflowState | None = None
    follow_ups: Mapping[UUID, PracticeReferenceAnswerWorkflowState] = field(
        default_factory=dict
    )


class PracticeService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: object | None = None,
        llm_model: str | None = None,
        practice_service_factory: PracticeSessionServiceFactory = (
            PracticeSessionService
        ),
        training_role_eligibility_service_factory: TrainingRoleEligibilityServiceFactory = (
            TrainingRoleEligibilityService
        ),
        reference_answer_generation_service_factory: ReferenceAnswerGenerationServiceFactory
        | None = None,
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()
        self.practice_service_factory = practice_service_factory
        self.training_role_eligibility_service_factory = (
            training_role_eligibility_service_factory
        )
        self.reference_answer_generation_service_factory = (
            reference_answer_generation_service_factory
            or ReferenceAnswerGenerationService
        )
        self._reference_answer_hydration_enabled = (
            reference_answer_generation_service_factory is not None
            or isinstance(session, AsyncSession)
        )

    async def start_session(
        self,
        *,
        user_id: UUID,
        payload: StartPracticeSessionRequest,
        interaction_language: InteractionLanguage,
    ) -> PracticeActiveSessionResponse:
        try:
            if payload.source.value == "personalized":
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
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def get_setup_capabilities(
        self,
        *,
        user_id: UUID,
        interaction_language: InteractionLanguage,
    ) -> PracticeSetupResponse:
        try:
            capabilities = await self._practice_service().get_setup_capabilities(
                user_id=user_id,
                interaction_language=interaction_language,
            )
            eligibility = await self.training_role_eligibility_service_factory(
                self.session
            ).get_training_available_target_roles(user_id=user_id)
            availability = (
                PracticeSetupAvailableResponse(status="available")
                if eligibility.blocked_reason is None
                else PracticeSetupBlockedResponse(
                    status="blocked",
                    reason=eligibility.blocked_reason,
                )
            )
            return PracticeSetupResponse(
                **capabilities.model_dump(mode="python"),
                availability=availability,
                training_available_target_role_ids=(
                    [role.id for role in eligibility.target_roles]
                    if eligibility.blocked_reason is None
                    else []
                ),
            )
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

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
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def retry_current_question(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: RetryPracticeQuestionRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().retry_current_question(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
            )
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def skip_current_question(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: SkipPracticeQuestionRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().skip_current_question(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
            )
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def set_question_saved(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: SetPracticeQuestionSavedRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().set_question_saved(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
                is_saved=payload.is_saved,
            )
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def set_question_weak(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: SetPracticeQuestionWeakRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().set_question_weak(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
                is_marked_weak=payload.is_marked_weak,
            )
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def reveal_question_hint(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: RevealPracticeQuestionGuidanceRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().reveal_question_hint(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
            )
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def reveal_question_framework(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: RevealPracticeQuestionGuidanceRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().reveal_question_framework(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
            )
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def reveal_follow_up_hint(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: RevealPracticeFollowUpGuidanceRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().reveal_follow_up_hint(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
                follow_up_question_id=payload.follow_up_question_id,
            )
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def reveal_follow_up_framework(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: RevealPracticeFollowUpGuidanceRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().reveal_follow_up_framework(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
                follow_up_question_id=payload.follow_up_question_id,
            )
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def submit_primary_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: SubmitPrimaryAnswerRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            self._require_llm_configuration(PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE)
            context = await self._practice_service().submit_primary_answer(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
                content=payload.content,
            )
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

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
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def end_follow_ups(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: EndPracticeFollowUpsRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            context = await self._practice_service().end_follow_ups(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
                follow_up_question_id=payload.follow_up_question_id,
            )
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def request_question_reference_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: PracticeQuestionReferenceAnswerRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            self._require_llm_configuration(
                PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE
            )
            service = self._practice_service()
            await service.request_question_reference_answer(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
            )
            context = await service.get_session_context(
                user_id=user_id,
                session_id=session_id,
            )
            response = await self._build_session_response(
                user_id=user_id,
                context=context,
            )
            if response.status == "completed":
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            return response
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def request_follow_up_reference_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: PracticeFollowUpReferenceAnswerRequest,
    ) -> PracticeActiveSessionResponse:
        try:
            self._require_llm_configuration(
                PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE
            )
            service = self._practice_service()
            await service.request_follow_up_reference_answer(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
                follow_up_question_id=payload.follow_up_question_id,
            )
            context = await service.get_session_context(
                user_id=user_id,
                session_id=session_id,
            )
            response = await self._build_session_response(
                user_id=user_id,
                context=context,
            )
            if response.status == "completed":
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            return response
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def get_session(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
    ) -> PracticeSessionResponse:
        try:
            context = await self._practice_service().get_session_context(
                user_id=user_id,
                session_id=session_id,
            )
            return await self._build_session_response(user_id=user_id, context=context)
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def complete_session(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: CompletePracticeSessionRequest,
    ) -> PracticeCompletedSessionResponse:
        try:
            context = await self._practice_service().complete_session_after_review(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
            )
            response = await self._build_session_response(
                user_id=user_id,
                context=context,
            )
            if response.status != "completed":
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            return response
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    async def end_session_early(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        payload: EndPracticeSessionEarlyRequest,
    ) -> PracticeCompletedSessionResponse:
        try:
            context = await self._practice_service().end_session_early(
                user_id=user_id,
                session_id=session_id,
                expected_version=payload.version,
                question_id=payload.question_id,
            )
            response = await self._build_session_response(
                user_id=user_id,
                context=context,
            )
            if response.status != "completed":
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            return response
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

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
                    await self._build_session_response(user_id=user_id, context=context)
                    if context is not None
                    else None
                )
            )
        except PracticeSessionStateError as error:
            raise practice_session_state_service_error(error) from None

    def _practice_service(self) -> PracticeSessionService:
        return self.practice_service_factory(
            self.session,
            llm_provider=self.llm_provider,
            llm_model=self.llm_model,
        )

    def _reference_answer_generation_service(self) -> ReferenceAnswerGenerationService:
        return self.reference_answer_generation_service_factory(
            self.session,
            llm_provider=self.llm_provider,
            llm_model=self.llm_model,
        )

    async def _build_session_response(
        self,
        *,
        user_id: UUID,
        context: (
            PracticePublicWorkflowContext
            | PracticeCompletedSessionWorkflowContext
            | PracticeEndedEarlySessionWorkflowContext
        ),
    ) -> PracticeSessionResponse:
        projection = await self._resolve_reference_answer_projection(
            user_id=user_id,
            context=context,
        )
        return build_practice_session_response(
            context,
            reference_answers=projection,
        )

    async def _resolve_reference_answer_projection(
        self,
        *,
        user_id: UUID,
        context: (
            PracticePublicWorkflowContext
            | PracticeCompletedSessionWorkflowContext
            | PracticeEndedEarlySessionWorkflowContext
        ),
    ) -> _PracticeReferenceAnswerProjection:
        if not self._reference_answer_hydration_enabled:
            return _PracticeReferenceAnswerProjection()
        if isinstance(context, PracticeCompletedSessionWorkflowContext):
            return _PracticeReferenceAnswerProjection()

        card = (
            context.question_context.question_card
            if isinstance(context, PracticeEndedEarlySessionWorkflowContext)
            else context.question_card
        )
        if card is None:
            return _PracticeReferenceAnswerProjection()

        main_answer = (
            context.main_answer
            if isinstance(context, PracticePrimaryAnswerWorkflowContext)
            else None
        )
        follow_up_exchanges = (
            ()
            if isinstance(context, PracticeEndedEarlySessionWorkflowContext)
            else (
                context.follow_up_exchanges
                if isinstance(context, PracticePrimaryAnswerWorkflowContext)
                else ()
            )
        )
        follow_up_question = (
            None
            if isinstance(context, PracticeEndedEarlySessionWorkflowContext)
            else (
                context.follow_up_question
                if isinstance(context, PracticePrimaryAnswerWorkflowContext)
                else None
            )
        )
        generation_service = self._reference_answer_generation_service()
        try:
            main_state = await generation_service.get_main_generation_state(
                user_id=user_id,
                question_card_id=card.id,
                submitted_at=main_answer.submitted_at if main_answer else None,
            )
            follow_up_states: dict[UUID, PracticeReferenceAnswerWorkflowState] = {}
            for exchange in follow_up_exchanges:
                follow_up_states[
                    exchange.question.id
                ] = await generation_service.get_follow_up_generation_state(
                    user_id=user_id,
                    question_card_id=card.id,
                    follow_up_question_id=exchange.question.id,
                    submitted_at=exchange.answer.submitted_at,
                )
            if follow_up_question is not None:
                unanswered_submitted_at = None
                if (
                    isinstance(
                        context,
                        (
                            PracticeEvaluationWorkflowContext,
                            PracticeReviewWorkflowContext,
                        ),
                    )
                    and context.follow_up_completion_reason
                    == PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
                ):
                    unanswered_submitted_at = context.session.updated_at
                follow_up_states[
                    follow_up_question.id
                ] = await generation_service.get_follow_up_generation_state(
                    user_id=user_id,
                    question_card_id=card.id,
                    follow_up_question_id=follow_up_question.id,
                    submitted_at=unanswered_submitted_at,
                )
        except ReferenceAnswerGenerationStateError:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None
        return _PracticeReferenceAnswerProjection(
            main=main_state,
            follow_ups=follow_up_states,
        )

    def _require_llm_configuration(self, error_code: str) -> str:
        if self.llm_provider is None or not self.llm_model:
            raise ExternalDependencyError(error_code)
        return self.llm_model


def build_practice_session_response(
    context: (
        PracticePublicWorkflowContext
        | PracticeCompletedSessionWorkflowContext
        | PracticeEndedEarlySessionWorkflowContext
    ),
    *,
    reference_answers: _PracticeReferenceAnswerProjection | None = None,
) -> PracticeSessionResponse:
    try:
        reference_answers = reference_answers or _PracticeReferenceAnswerProjection()
        if isinstance(context, PracticeCompletedSessionWorkflowContext):
            return build_practice_completed_session_response(
                context,
                reference_answers=reference_answers,
            )
        if isinstance(context, PracticeEndedEarlySessionWorkflowContext):
            return build_practice_completed_session_response(
                context,
                reference_answers=reference_answers,
            )
        base = {
            "session_id": context.session.id,
            "language": context.session.language,
            "version": context.session.version,
            "selection": PracticeSessionSelection(
                target_role_id=context.session.target_role_id,
                question_type=QuestionCardQuestionType(context.attempt.question_type),
                difficulty=QuestionCardDifficulty(context.attempt.difficulty),
                source=context.session.source,
                prioritize_weaknesses=context.session.prioritize_weaknesses,
            ),
            "started_at": context.session.started_at,
            "attempt_id": context.attempt.id,
            "attempt_number": context.attempt.attempt_number,
        }
        if isinstance(context, PracticeReviewWorkflowContext):
            if context.attempt.status != "review" or context.follow_up_decision is None:
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
                context.follow_up_exchanges,
                reference_answers=reference_answers.follow_ups,
            )
            follow_up_completion = build_practice_follow_up_completion_response(
                context.follow_up_completion_reason,
                unanswered_question=context.follow_up_question,
                unanswered_reference_answer_state=(
                    reference_answers.follow_ups.get(context.follow_up_question.id)
                    if context.follow_up_question is not None
                    else None
                ),
            )
            return PracticeReviewResponse(
                status="review",
                question=build_practice_question_response(
                    context.question_card,
                    reference_answer_state=reference_answers.main,
                ),
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
                return PracticeAnsweringResponse(
                    status="answering",
                    question=build_practice_question_response(
                        context.question_card,
                        reference_answer_state=reference_answers.main,
                    ),
                    **base,
                )
            return PracticeAnsweringResponse(
                status="answering",
                question=build_practice_question_response(
                    context.question_card,
                    reference_answer_state=reference_answers.main,
                ),
                **base,
            )
        if isinstance(context, PracticePrimaryAnswerWorkflowContext):
            if context.question_card is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            main_answer = build_practice_answer_response(context.main_answer)
            question = build_practice_question_response(
                context.question_card,
                reference_answer_state=reference_answers.main,
            )
            if context.attempt.status == "answeringFollowUp":
                if (
                    context.follow_up_decision is None
                    or context.follow_up_decision.action != "askFollowUp"
                    or context.follow_up_question is None
                ):
                    raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
                current_follow_up = PracticeAwaitingFollowUpExchangeResponse(
                    status="awaitingAnswer",
                    question=build_practice_follow_up_question_response(
                        context.follow_up_question,
                        reference_answer_state=reference_answers.follow_ups.get(
                            context.follow_up_question.id
                        ),
                    ),
                    answer=None,
                )
                return PracticeAnsweringFollowUpResponse(
                    status="answeringFollowUp",
                    question=question,
                    main_answer=main_answer,
                    follow_up_exchanges=_build_practice_answered_follow_up_exchanges(
                        context.follow_up_exchanges,
                        reference_answers=reference_answers.follow_ups,
                    ),
                    current_follow_up=current_follow_up,
                    **base,
                )
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
    except PracticeSessionStateError:
        raise
    except AttributeError, TypeError, ValueError, ValidationError:
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def build_practice_completed_session_response(
    context: PracticeCompletedSessionWorkflowContext
    | PracticeEndedEarlySessionWorkflowContext,
    *,
    reference_answers: _PracticeReferenceAnswerProjection | None = None,
) -> PracticeCompletedSessionResponse:
    try:
        reference_answers = reference_answers or _PracticeReferenceAnswerProjection()
        if isinstance(context, PracticeEndedEarlySessionWorkflowContext):
            return _build_practice_ended_early_session_response(
                context,
                reference_answer_state=reference_answers.main,
            )

        review_contexts = context.attempt_review_contexts
        if not review_contexts:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        final_context_by_question: dict[UUID, PracticeReviewWorkflowContext] = {}
        for review_context in review_contexts:
            final_context_by_question[review_context.question_card.id] = review_context

        final_attempts = list(final_context_by_question.values())
        score_total = sum(
            review_context.evaluation.overall_score for review_context in final_attempts
        )
        score_count = len(final_attempts)
        average_score = (score_total * 2 + score_count) // (2 * score_count)
        final_review_context = review_contexts[-1]
        final_attempt = final_review_context.attempt
        if final_attempt.id != context.final_attempt.id:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        return PracticeCompletedSessionResponse(
            status="completed",
            session_id=context.session.id,
            language=context.session.language,
            version=context.session.version,
            selection=PracticeSessionSelection(
                target_role_id=context.session.target_role_id,
                question_type=QuestionCardQuestionType(final_attempt.question_type),
                difficulty=QuestionCardDifficulty(final_attempt.difficulty),
                source=context.session.source,
                prioritize_weaknesses=context.session.prioritize_weaknesses,
            ),
            started_at=context.session.started_at,
            attempt_id=final_attempt.id,
            attempt_number=final_attempt.attempt_number,
            completion_reason="reviewCompleted",
            completed_at=context.session.completed_at,
            questions_completed=len(final_context_by_question),
            retry_count=sum(
                review_context.attempt.retry_of_attempt_id is not None
                for review_context in review_contexts
            ),
            saved_question_count=sum(
                review_context.question_card.is_saved
                for review_context in final_attempts
            ),
            marked_weak_question_count=sum(
                review_context.question_card.is_marked_weak
                for review_context in final_attempts
            ),
            final_attempt_average_score=average_score,
            next_step_suggestion=final_review_context.recommendation.reason,
            unfinished_attempt=None,
        )
    except PracticeSessionStateError:
        raise
    except AttributeError, TypeError, ValueError, ValidationError:
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def _build_practice_ended_early_session_response(
    context: PracticeEndedEarlySessionWorkflowContext,
    *,
    reference_answer_state: PracticeReferenceAnswerWorkflowState | None = None,
) -> PracticeCompletedSessionResponse:
    try:
        review_contexts = context.completed_attempt_review_contexts
        final_context_by_question: dict[UUID, PracticeReviewWorkflowContext] = {}
        for review_context in review_contexts:
            final_context_by_question[review_context.question_card.id] = review_context

        final_attempts = list(final_context_by_question.values())
        score_count = len(final_attempts)
        score_total = sum(
            review_context.evaluation.overall_score for review_context in final_attempts
        )
        average_score = (
            0
            if score_count == 0
            else (score_total * 2 + score_count) // (2 * score_count)
        )
        unfinished_attempt = context.unfinished_attempt
        unfinished_question = context.question_context.question_card
        if unfinished_question is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        unfinished_selection = PracticeSessionSelection(
            target_role_id=context.session.target_role_id,
            question_type=QuestionCardQuestionType(unfinished_attempt.question_type),
            difficulty=QuestionCardDifficulty(unfinished_attempt.difficulty),
            source=context.session.source,
            prioritize_weaknesses=context.session.prioritize_weaknesses,
        )
        suggestion = (
            review_contexts[-1].recommendation.reason if review_contexts else None
        )
        return PracticeCompletedSessionResponse(
            status="completed",
            session_id=context.session.id,
            language=context.session.language,
            version=context.session.version,
            selection=unfinished_selection,
            started_at=context.session.started_at,
            attempt_id=unfinished_attempt.id,
            attempt_number=unfinished_attempt.attempt_number,
            completion_reason="userEndedEarly",
            completed_at=context.session.completed_at,
            questions_completed=len(final_context_by_question),
            retry_count=sum(
                review_context.attempt.retry_of_attempt_id is not None
                for review_context in review_contexts
            ),
            saved_question_count=sum(
                review_context.question_card.is_saved
                for review_context in final_attempts
            ),
            marked_weak_question_count=sum(
                review_context.question_card.is_marked_weak
                for review_context in final_attempts
            ),
            final_attempt_average_score=average_score,
            next_step_suggestion=suggestion,
            unfinished_attempt=PracticeUnfinishedAttemptResponse(
                attempt_id=unfinished_attempt.id,
                attempt_number=unfinished_attempt.attempt_number,
                selection=unfinished_selection,
                question=build_practice_question_response(
                    unfinished_question,
                    reference_answer_state=reference_answer_state,
                ),
            ),
        )
    except PracticeSessionStateError:
        raise
    except AttributeError, TypeError, ValueError, ValidationError:
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def build_practice_guidance_response(
    *,
    content: list[str],
    revealed: bool,
) -> PracticeGuidanceResponse:
    if not revealed:
        return PracticeGuidanceNotRequestedResponse(status="notRequested")
    if not content:
        return PracticeGuidanceUnavailableResponse(status="unavailable")
    return PracticeGuidanceRevealedResponse(
        status="revealed",
        content=list(content),
    )


def build_practice_main_reference_answer_response(
    state: PracticeReferenceAnswerWorkflowState,
) -> PracticeMainReferenceAnswerResponse:
    try:
        if state.status == PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED:
            if (
                state.artifact is not None
                or state.output is not None
                or state.viewed_before_submission
            ):
                raise ValueError("not-requested reference state contains data")
            return PracticeReferenceAnswerNotRequestedResponse(status="notRequested")
        if state.status == PracticeReferenceAnswerLifecycleStatus.UNAVAILABLE:
            if (
                state.artifact is not None
                or state.output is not None
                or state.viewed_before_submission
            ):
                raise ValueError("unavailable reference state is invalid")
            return PracticeReferenceAnswerUnavailableResponse(status="unavailable")
        if state.status != PracticeReferenceAnswerLifecycleStatus.REVEALED:
            raise ValueError("unknown reference answer lifecycle status")
        if (
            state.artifact is None
            or state.output is None
            or state.output.target_type != PracticeReferenceAnswerTargetType.MAIN
        ):
            raise ValueError("revealed main reference state is invalid")
        return PracticeMainReferenceAnswerRevealedResponse(
            status="revealed",
            content=PracticeMainReferenceAnswerContentResponse(
                kind=state.output.kind,
                answer=state.output.answer,
                key_points=state.output.key_points,
                common_mistakes=state.output.common_mistakes,
                generated_at=state.artifact.generated_at,
            ),
            viewed_before_submission=state.viewed_before_submission,
        )
    except PracticeSessionStateError:
        raise
    except AttributeError, TypeError, ValueError, ValidationError:
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def build_practice_follow_up_reference_answer_response(
    state: PracticeReferenceAnswerWorkflowState,
) -> PracticeFollowUpReferenceAnswerResponse:
    try:
        if state.status == PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED:
            if (
                state.artifact is not None
                or state.output is not None
                or state.viewed_before_submission
            ):
                raise ValueError("not-requested reference state contains data")
            return PracticeReferenceAnswerNotRequestedResponse(status="notRequested")
        if state.status == PracticeReferenceAnswerLifecycleStatus.UNAVAILABLE:
            if (
                state.artifact is not None
                or state.output is not None
                or state.viewed_before_submission
            ):
                raise ValueError("unavailable reference state is invalid")
            return PracticeReferenceAnswerUnavailableResponse(status="unavailable")
        if state.status != PracticeReferenceAnswerLifecycleStatus.REVEALED:
            raise ValueError("unknown reference answer lifecycle status")
        if (
            state.artifact is None
            or state.output is None
            or state.output.target_type != PracticeReferenceAnswerTargetType.FOLLOW_UP
        ):
            raise ValueError("revealed follow-up reference state is invalid")
        return PracticeFollowUpReferenceAnswerRevealedResponse(
            status="revealed",
            content=PracticeFollowUpReferenceAnswerContentResponse(
                kind=state.output.kind,
                addressed_gap=state.output.addressed_gap,
                answer=state.output.answer,
                key_points=state.output.key_points,
                common_mistakes=state.output.common_mistakes,
                generated_at=state.artifact.generated_at,
            ),
            viewed_before_submission=state.viewed_before_submission,
        )
    except PracticeSessionStateError:
        raise
    except AttributeError, TypeError, ValueError, ValidationError:
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def build_practice_question_response(
    card: QuestionCard,
    *,
    reference_answer_state: PracticeReferenceAnswerWorkflowState | None = None,
) -> PracticeQuestionResponse:
    try:
        return PracticeQuestionResponse.model_validate(
            {
                "id": card.id,
                "prompt": card.prompt,
                "question_type": card.question_type,
                "difficulty": card.difficulty,
                "assessed_capabilities": list(card.assessed_capabilities),
                "recommended_materials": list(card.recommended_materials),
                "answer_hints": build_practice_guidance_response(
                    content=list(card.answer_hints),
                    revealed=card.answer_hints_revealed,
                ),
                "answer_framework": build_practice_guidance_response(
                    content=list(card.answer_framework),
                    revealed=card.answer_framework_revealed,
                ),
                "reference_answer": (
                    build_practice_main_reference_answer_response(
                        reference_answer_state
                    )
                    if reference_answer_state is not None
                    else PracticeReferenceAnswerNotRequestedResponse(
                        status="notRequested"
                    )
                ),
                "is_saved": card.is_saved,
                "is_marked_weak": card.is_marked_weak,
            }
        )
    except AttributeError, TypeError, ValueError, ValidationError:
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
    except AttributeError, TypeError, ValueError, ValidationError:
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def build_practice_follow_up_question_response(
    question: PracticeFollowUpQuestion,
    *,
    reference_answer_state: PracticeReferenceAnswerWorkflowState | None = None,
) -> PracticeFollowUpQuestionResponse:
    try:
        return PracticeFollowUpQuestionResponse.model_validate(
            {
                "id": question.id,
                "prompt": question.prompt,
                "created_at": question.created_at,
                "order": question.order,
                "answer_hints": build_practice_guidance_response(
                    content=list(question.answer_hints),
                    revealed=question.answer_hints_revealed,
                ),
                "answer_framework": build_practice_guidance_response(
                    content=list(question.answer_framework),
                    revealed=question.answer_framework_revealed,
                ),
                "reference_answer": (
                    build_practice_follow_up_reference_answer_response(
                        reference_answer_state
                    )
                    if reference_answer_state is not None
                    else PracticeReferenceAnswerNotRequestedResponse(
                        status="notRequested"
                    )
                ),
            }
        )
    except AttributeError, TypeError, ValueError, ValidationError:
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def build_practice_answered_follow_up_exchange_response(
    exchange: PracticeAnsweredFollowUpExchangeContext,
    *,
    reference_answer_state: PracticeReferenceAnswerWorkflowState | None = None,
) -> PracticeAnsweredFollowUpExchangeResponse:
    try:
        return PracticeAnsweredFollowUpExchangeResponse(
            status="answered",
            question=build_practice_follow_up_question_response(
                exchange.question,
                reference_answer_state=reference_answer_state,
            ),
            answer=build_practice_answer_response(exchange.answer),
        )
    except AttributeError, TypeError, ValueError, ValidationError:
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None


def _build_practice_answered_follow_up_exchanges(
    exchanges: tuple[PracticeAnsweredFollowUpExchangeContext, ...],
    *,
    reference_answers: Mapping[UUID, PracticeReferenceAnswerWorkflowState]
    | None = None,
) -> list[PracticeAnsweredFollowUpExchangeResponse]:
    return [
        build_practice_answered_follow_up_exchange_response(
            exchange,
            reference_answer_state=(
                reference_answers.get(exchange.question.id)
                if reference_answers is not None
                else None
            ),
        )
        for exchange in exchanges
    ]


def build_practice_follow_up_completion_response(
    reason: PracticeEvaluationFollowUpCompletionReason | None,
    *,
    unanswered_question: PracticeFollowUpQuestion | None = None,
    unanswered_reference_answer_state: PracticeReferenceAnswerWorkflowState
    | None = None,
) -> PracticeFollowUpCompletionResponse:
    if reason == PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY:
        if unanswered_question is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        return PracticeEndedEarlyFollowUpCompletionResponse(
            status="endedEarly",
            unanswered_question=build_practice_follow_up_question_response(
                unanswered_question,
                reference_answer_state=unanswered_reference_answer_state,
            ),
        )
    if unanswered_question is not None:
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
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


def practice_session_state_service_error(
    error: PracticeSessionStateError,
) -> ServiceError:
    if error.code == PRACTICE_SESSION_NOT_FOUND:
        return ResourceMissingError(error.code)
    if error.code in {
        PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
        PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE,
        PRACTICE_EVALUATION_GENERATION_UNAVAILABLE,
        PRACTICE_REVIEW_GENERATION_UNAVAILABLE,
        PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE,
        PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE,
    }:
        return ExternalDependencyError(error.code)
    return DomainConflictError(error.code)
