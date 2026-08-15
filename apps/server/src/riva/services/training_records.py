from collections.abc import Callable, Iterable
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import PracticeAnswer, PracticeAttempt, QuestionCard
from riva.schemas.evaluation import PracticeEvaluationFollowUpCompletionReason
from riva.schemas.practice_sessions import (
    PracticeAnswerResponse,
    PracticeFollowUpReferenceAnswerContentResponse,
    PracticeFollowUpReferenceAnswerRevealedResponse,
    PracticeMainReferenceAnswerContentResponse,
    PracticeMainReferenceAnswerRevealedResponse,
    PracticeReferenceAnswerGeneratingResponse,
    PracticeReferenceAnswerNotRequestedResponse,
    PracticeReferenceAnswerUnavailableResponse,
    PracticeQuestionSource,
)
from riva.schemas.practice_reference_answer import (
    PracticeReferenceAnswerTargetType,
)
from riva.schemas.training_records import (
    TargetedPracticeAttemptRecordResponse,
    TargetedPracticeQuestionRecordResponse,
    TargetedPracticeSetupResponse,
    TargetedPracticeTrainingRecordDetailResponse,
    TrainingRecordEvaluationResponse,
    TrainingRecordFollowUpResponse,
    TrainingRecordKind,
    TrainingRecordReviewResponse,
    TrainingRecordStatus,
    TrainingRecordTargetRoleResponse,
)
from riva.services.evaluation_generation import (
    practice_evaluation_output_from_artifact,
)
from riva.services.practice_sessions import (
    PRACTICE_SESSION_NOT_FOUND,
    PracticeCompletedSessionWorkflowContext,
    PracticeEndedEarlySessionWorkflowContext,
    PracticeReviewWorkflowContext,
    PracticeSessionService,
    PracticeSessionStateError,
)
from riva.services.recommendation_generation import (
    practice_recommendation_output_from_artifact,
)
from riva.services.reference_answer_generation import (
    PracticeReferenceAnswerLifecycleStatus,
    PracticeReferenceAnswerWorkflowState,
    ReferenceAnswerGenerationService,
    ReferenceAnswerGenerationStateError,
)
from riva.services.review_generation import practice_review_output_from_artifact


TrainingRecordStateErrorCode = Literal[
    "training_record_not_found",
    "training_record_state_conflict",
]
TRAINING_RECORD_NOT_FOUND: TrainingRecordStateErrorCode = (
    "training_record_not_found"
)
TRAINING_RECORD_STATE_CONFLICT: TrainingRecordStateErrorCode = (
    "training_record_state_conflict"
)


class TrainingRecordStateError(RuntimeError):
    safe_message = "The training record state is invalid."

    def __init__(self, code: TrainingRecordStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


PracticeSessionServiceFactory = Callable[..., PracticeSessionService]
ReferenceAnswerGenerationServiceFactory = Callable[
    ..., ReferenceAnswerGenerationService
]


class TrainingRecordService:
    """Read-only projections for completed practice sessions."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        practice_service_factory: PracticeSessionServiceFactory = (
            PracticeSessionService
        ),
        reference_answer_generation_service_factory: (
            ReferenceAnswerGenerationServiceFactory
        ) = ReferenceAnswerGenerationService,
    ) -> None:
        self.session = session
        self.practice_service_factory = practice_service_factory
        self.reference_answer_generation_service_factory = (
            reference_answer_generation_service_factory
        )

    async def get_targeted_practice_record(
        self,
        *,
        user_id: UUID,
        record_id: UUID,
    ) -> TargetedPracticeTrainingRecordDetailResponse:
        try:
            context = await self.practice_service_factory(
                self.session
            ).get_session_context(
                user_id=user_id,
                session_id=record_id,
            )
        except PracticeSessionStateError as error:
            if error.code == PRACTICE_SESSION_NOT_FOUND:
                raise TrainingRecordStateError(TRAINING_RECORD_NOT_FOUND) from None
            raise TrainingRecordStateError(
                TRAINING_RECORD_STATE_CONFLICT
            ) from None

        try:
            if isinstance(context, PracticeCompletedSessionWorkflowContext):
                return await self._build_completed_record(
                    user_id=user_id,
                    context=context,
                )
            if isinstance(context, PracticeEndedEarlySessionWorkflowContext):
                return await self._build_ended_early_record(
                    user_id=user_id,
                    context=context,
                )
            raise TrainingRecordStateError(TRAINING_RECORD_NOT_FOUND)
        except TrainingRecordStateError:
            raise
        except (
            AttributeError,
            TypeError,
            ValueError,
            ValidationError,
            ReferenceAnswerGenerationStateError,
        ):
            raise TrainingRecordStateError(
                TRAINING_RECORD_STATE_CONFLICT
            ) from None

    def _reference_answer_generation_service(
        self,
    ) -> ReferenceAnswerGenerationService:
        return self.reference_answer_generation_service_factory(self.session)

    async def _build_completed_record(
        self,
        *,
        user_id: UUID,
        context: PracticeCompletedSessionWorkflowContext,
    ) -> TargetedPracticeTrainingRecordDetailResponse:
        session = context.session
        self._validate_completed_session(session, expected_reason="reviewCompleted")
        review_contexts = self._ordered_review_contexts(
            context.attempt_review_contexts
        )
        if (
            not review_contexts
            or context.final_attempt.id != review_contexts[-1].attempt.id
        ):
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        self._validate_attempts(
            session=session,
            attempts=[review_context.attempt for review_context in review_contexts],
        )

        reference_service = self._reference_answer_generation_service()
        role = await self._load_target_role_snapshot(
            user_id=user_id,
            session=session,
            cards=(context.question_card for context in review_contexts),
            reference_service=reference_service,
        )
        attempts = [
            await self._build_reviewed_attempt(
                user_id=user_id,
                context=review_context,
                reference_service=reference_service,
            )
            for review_context in review_contexts
        ]
        return self._build_detail_response(
            session=session,
            status=TrainingRecordStatus.COMPLETED,
            role=role,
            attempts=attempts,
        )

    async def _build_ended_early_record(
        self,
        *,
        user_id: UUID,
        context: PracticeEndedEarlySessionWorkflowContext,
    ) -> TargetedPracticeTrainingRecordDetailResponse:
        session = context.session
        self._validate_completed_session(session, expected_reason="userEndedEarly")
        review_contexts = self._ordered_review_contexts(
            context.completed_attempt_review_contexts
        )
        unfinished_attempt = context.unfinished_attempt
        unfinished_card = context.question_context.question_card
        if unfinished_card is None:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        self._validate_attempts(
            session=session,
            attempts=[
                *(review_context.attempt for review_context in review_contexts),
                unfinished_attempt,
            ],
        )

        reference_service = self._reference_answer_generation_service()
        role = await self._load_target_role_snapshot(
            user_id=user_id,
            session=session,
            cards=(
                *(review_context.question_card for review_context in review_contexts),
                unfinished_card,
            ),
            reference_service=reference_service,
        )
        attempts = [
            await self._build_reviewed_attempt(
                user_id=user_id,
                context=review_context,
                reference_service=reference_service,
            )
            for review_context in review_contexts
        ]
        attempts.append(
            await self._build_unfinished_attempt(
                user_id=user_id,
                attempt=unfinished_attempt,
                card=unfinished_card,
                reference_service=reference_service,
            )
        )
        return self._build_detail_response(
            session=session,
            status=(
                TrainingRecordStatus.PARTIALLY_COMPLETED
                if review_contexts
                else TrainingRecordStatus.ENDED_EARLY
            ),
            role=role,
            attempts=attempts,
        )

    @staticmethod
    def _validate_completed_session(
        session,
        *,
        expected_reason: Literal["reviewCompleted", "userEndedEarly"],
    ) -> None:
        if (
            session.status != "completed"
            or session.completed_at is None
            or session.completion_reason != expected_reason
        ):
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        _require_aware_timestamp(session.started_at)
        _require_aware_timestamp(session.completed_at)
        if session.completed_at < session.started_at:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)

    @staticmethod
    def _ordered_review_contexts(
        contexts: Iterable[PracticeReviewWorkflowContext],
    ) -> list[PracticeReviewWorkflowContext]:
        ordered = sorted(contexts, key=lambda item: item.attempt.attempt_number)
        if len({item.attempt.id for item in ordered}) != len(ordered):
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        return ordered

    @staticmethod
    def _validate_attempts(
        *,
        session,
        attempts: list[PracticeAttempt],
    ) -> None:
        ordered = sorted(attempts, key=lambda item: item.attempt_number)
        if [item.attempt_number for item in ordered] != list(
            range(1, len(ordered) + 1)
        ):
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        by_id = {item.id: item for item in ordered}
        if len(by_id) != len(ordered):
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        for attempt in ordered:
            if (
                attempt.user_id != session.user_id
                or attempt.session_id != session.id
                or attempt.question_card_id is None
            ):
                raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
            parent_id = attempt.retry_of_attempt_id
            if parent_id is None:
                continue
            parent = by_id.get(parent_id)
            if (
                parent is None
                or parent.user_id != session.user_id
                or parent.session_id != session.id
                or parent.attempt_number >= attempt.attempt_number
                or parent.question_card_id != attempt.question_card_id
            ):
                raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)

    async def _load_target_role_snapshot(
        self,
        *,
        user_id: UUID,
        session,
        cards: Iterable[QuestionCard | None],
        reference_service: ReferenceAnswerGenerationService,
    ) -> TrainingRecordTargetRoleResponse:
        role_snapshot: tuple[str, str | None] | None = None
        seen_cards: set[UUID] = set()
        for card in cards:
            if card is None or card.id in seen_cards:
                continue
            seen_cards.add(card.id)
            if card.target_role_id != session.target_role_id:
                raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
            frozen_context = await reference_service.get_question_reference_context(
                user_id=user_id,
                question_card_id=card.id,
            )
            current_snapshot = (
                frozen_context.target_role.title,
                frozen_context.target_role.company,
            )
            if role_snapshot is None:
                role_snapshot = current_snapshot
            elif role_snapshot != current_snapshot:
                raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)

        if role_snapshot is None:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        return TrainingRecordTargetRoleResponse(
            id=session.target_role_id,
            title=role_snapshot[0],
            company=role_snapshot[1],
        )

    async def _build_reviewed_attempt(
        self,
        *,
        user_id: UUID,
        context: PracticeReviewWorkflowContext,
        reference_service: ReferenceAnswerGenerationService,
    ) -> TargetedPracticeAttemptRecordResponse:
        attempt = context.attempt
        card = context.question_card
        if (
            attempt.status != "completed"
            or attempt.completed_at is None
            or context.main_answer is None
            or context.evaluation is None
            or context.review is None
            or context.recommendation is None
            or attempt.question_card_id != card.id
        ):
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        _require_aware_timestamp(attempt.completed_at)

        main_reference_state = await reference_service.get_main_generation_state(
            user_id=user_id,
            question_card_id=card.id,
            submitted_at=context.main_answer.submitted_at,
        )
        question = self._build_question(
            attempt=attempt,
            card=card,
            reference_answer=_build_main_reference_answer(main_reference_state),
        )
        follow_ups = await self._build_follow_ups(
            user_id=user_id,
            context=context,
            reference_service=reference_service,
        )
        try:
            evaluation_output = practice_evaluation_output_from_artifact(
                context.evaluation,
                scoring_focus_count=len(card.scoring_focus),
            )
            review_output = practice_review_output_from_artifact(context.review)
            recommendation_output = practice_recommendation_output_from_artifact(
                context.recommendation
            )
            evaluation = TrainingRecordEvaluationResponse(
                overall_score=evaluation_output.overall_score,
                dimension_scores=evaluation_output.dimension_scores,
                evaluated_at=context.evaluation.evaluated_at,
            )
            review = TrainingRecordReviewResponse(
                overall_performance=review_output.overall_performance,
                highlights=review_output.highlights,
                main_issues=review_output.main_issues,
                improvement_suggestions=review_output.improvement_suggestions,
                reusable_answer_structure=review_output.reusable_answer_structure,
                exposed_weaknesses=review_output.exposed_weaknesses,
            )
        except (AttributeError, TypeError, ValueError, ValidationError):
            raise TrainingRecordStateError(
                TRAINING_RECORD_STATE_CONFLICT
            ) from None
        return TargetedPracticeAttemptRecordResponse(
            attempt_id=attempt.id,
            attempt_number=attempt.attempt_number,
            retry_of_attempt_id=attempt.retry_of_attempt_id,
            completed_at=attempt.completed_at,
            question=question,
            main_answer=_build_answer_response(context.main_answer),
            follow_ups=follow_ups,
            evaluation=evaluation,
            review=review,
            recommendation=recommendation_output,
        )

    async def _build_unfinished_attempt(
        self,
        *,
        user_id: UUID,
        attempt: PracticeAttempt,
        card: QuestionCard,
        reference_service: ReferenceAnswerGenerationService,
    ) -> TargetedPracticeAttemptRecordResponse:
        if (
            attempt.status != "endedEarly"
            or attempt.question_card_id != card.id
            or attempt.completed_at is None
        ):
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        main_reference_state = await reference_service.get_main_generation_state(
            user_id=user_id,
            question_card_id=card.id,
            submitted_at=None,
        )
        return TargetedPracticeAttemptRecordResponse(
            attempt_id=attempt.id,
            attempt_number=attempt.attempt_number,
            retry_of_attempt_id=attempt.retry_of_attempt_id,
            completed_at=None,
            question=self._build_question(
                attempt=attempt,
                card=card,
                reference_answer=_build_main_reference_answer(main_reference_state),
            ),
            main_answer=None,
            follow_ups=[],
            evaluation=None,
            review=None,
            recommendation=None,
        )

    async def _build_follow_ups(
        self,
        *,
        user_id: UUID,
        context: PracticeReviewWorkflowContext,
        reference_service: ReferenceAnswerGenerationService,
    ) -> list[TrainingRecordFollowUpResponse]:
        reason = context.follow_up_completion_reason
        exchanges = list(context.follow_up_exchanges)
        if reason is None:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        if [exchange.question.order for exchange in exchanges] != list(
            range(1, len(exchanges) + 1)
        ):
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        if reason == PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED:
            if exchanges or context.follow_up_question is not None:
                raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        elif reason == PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED:
            if (
                not exchanges
                or len(exchanges) > 2
                or context.follow_up_question is not None
            ):
                raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        elif reason == PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY:
            if (
                len(exchanges) > 1
                or context.follow_up_question is None
                or context.follow_up_question.order != len(exchanges) + 1
            ):
                raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        else:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)

        result: list[TrainingRecordFollowUpResponse] = []
        for exchange in exchanges:
            question = exchange.question
            answer = exchange.answer
            if answer is None or question.attempt_id != context.attempt.id:
                raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
            state = await reference_service.get_follow_up_generation_state(
                user_id=user_id,
                question_card_id=context.question_card.id,
                follow_up_question_id=question.id,
                submitted_at=answer.submitted_at,
            )
            result.append(
                TrainingRecordFollowUpResponse(
                    question_id=question.id,
                    prompt=question.prompt,
                    order=question.order,
                    asked_at=question.created_at,
                    answer=_build_answer_response(answer),
                    reference_answer=_build_follow_up_reference_answer(state),
                )
            )

        pending = context.follow_up_question
        if pending is not None:
            if pending.attempt_id != context.attempt.id:
                raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
            state = await reference_service.get_follow_up_generation_state(
                user_id=user_id,
                question_card_id=context.question_card.id,
                follow_up_question_id=pending.id,
                submitted_at=context.evaluation_generation_run.created_at,
            )
            result.append(
                TrainingRecordFollowUpResponse(
                    question_id=pending.id,
                    prompt=pending.prompt,
                    order=pending.order,
                    asked_at=pending.created_at,
                    answer=None,
                    reference_answer=_build_follow_up_reference_answer(state),
                )
            )
        return result

    @staticmethod
    def _build_question(
        *,
        attempt: PracticeAttempt,
        card: QuestionCard,
        reference_answer,
    ) -> TargetedPracticeQuestionRecordResponse:
        if (
            card.id != attempt.question_card_id
            or card.question_type != attempt.question_type
            or card.difficulty != attempt.difficulty
        ):
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        return TargetedPracticeQuestionRecordResponse(
            question_card_id=card.id,
            prompt=card.prompt,
            question_type=attempt.question_type,
            difficulty=attempt.difficulty,
            assessed_capabilities=list(card.assessed_capabilities),
            is_saved=card.is_saved,
            is_marked_weak=card.is_marked_weak,
            reference_answer=reference_answer,
        )

    @staticmethod
    def _build_detail_response(
        *,
        session,
        status: TrainingRecordStatus,
        role: TrainingRecordTargetRoleResponse,
        attempts: list[TargetedPracticeAttemptRecordResponse],
    ) -> TargetedPracticeTrainingRecordDetailResponse:
        weaknesses: list[str] = []
        seen_weaknesses: set[str] = set()
        for attempt in attempts:
            if attempt.review is None:
                continue
            for weakness in attempt.review.exposed_weaknesses:
                if weakness in seen_weaknesses:
                    continue
                seen_weaknesses.add(weakness)
                weaknesses.append(weakness)
        completed_at = session.completed_at
        started_at = session.started_at
        if completed_at is None:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        _require_aware_timestamp(started_at)
        _require_aware_timestamp(completed_at)
        duration = completed_at - started_at
        if duration.total_seconds() < 0:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        recommendation = next(
            (
                attempt.recommendation
                for attempt in reversed(attempts)
                if attempt.review is not None and attempt.recommendation is not None
            ),
            None,
        )
        return TargetedPracticeTrainingRecordDetailResponse(
            record_id=session.id,
            kind=TrainingRecordKind.TARGETED_PRACTICE,
            status=status,
            language=session.language,
            started_at=started_at,
            ended_at=completed_at,
            duration_seconds=int(duration.total_seconds()),
            target_role=role,
            setup=TargetedPracticeSetupResponse(
                source=PracticeQuestionSource(session.source),
                prioritize_weaknesses=session.prioritize_weaknesses,
            ),
            attempts=attempts,
            exposed_weaknesses=weaknesses,
            recommendation=recommendation,
        )


def _build_answer_response(answer: PracticeAnswer) -> PracticeAnswerResponse:
    return PracticeAnswerResponse.model_validate(
        {
            "id": answer.id,
            "content": answer.content,
            "created_at": answer.submitted_at,
            "order": answer.order,
        }
    )


def _build_main_reference_answer(state: PracticeReferenceAnswerWorkflowState):
    if state.status == PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED:
        return PracticeReferenceAnswerNotRequestedResponse(status="notRequested")
    if state.status == PracticeReferenceAnswerLifecycleStatus.GENERATING:
        return PracticeReferenceAnswerGeneratingResponse(status="generating")
    if state.status == PracticeReferenceAnswerLifecycleStatus.UNAVAILABLE:
        return PracticeReferenceAnswerUnavailableResponse(status="unavailable")
    if (
        state.status != PracticeReferenceAnswerLifecycleStatus.REVEALED
        or state.generation_run is None
        or state.artifact is None
        or state.output is None
        or state.output.target_type != PracticeReferenceAnswerTargetType.MAIN
    ):
        raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
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


def _build_follow_up_reference_answer(
    state: PracticeReferenceAnswerWorkflowState,
):
    if state.status == PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED:
        return PracticeReferenceAnswerNotRequestedResponse(status="notRequested")
    if state.status == PracticeReferenceAnswerLifecycleStatus.GENERATING:
        return PracticeReferenceAnswerGeneratingResponse(status="generating")
    if state.status == PracticeReferenceAnswerLifecycleStatus.UNAVAILABLE:
        return PracticeReferenceAnswerUnavailableResponse(status="unavailable")
    if (
        state.status != PracticeReferenceAnswerLifecycleStatus.REVEALED
        or state.generation_run is None
        or state.artifact is None
        or state.output is None
        or state.output.target_type != PracticeReferenceAnswerTargetType.FOLLOW_UP
    ):
        raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
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


def _require_aware_timestamp(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)


__all__ = [
    "TRAINING_RECORD_NOT_FOUND",
    "TRAINING_RECORD_STATE_CONFLICT",
    "TrainingRecordService",
    "TrainingRecordStateError",
    "TrainingRecordStateErrorCode",
]
