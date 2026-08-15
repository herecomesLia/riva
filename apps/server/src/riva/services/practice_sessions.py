from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.language import InteractionLanguage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAnswer,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeRecommendation,
    PracticeReview,
    PracticeSession,
    QuestionCard,
    User,
)
from riva.prompts import (
    FOLLOW_UP_PROMPT,
    PRACTICE_EVALUATION_PROMPT,
    PRACTICE_RECOMMENDATION_PROMPT,
    PRACTICE_REVIEW_PROMPT,
    QUESTION_GENERATION_PROMPT,
)
from riva.schemas.evaluation import (
    EvaluationRunPayload,
    PracticeEvaluationFollowUpCompletionReason,
)
from riva.schemas.follow_up import FollowUpRunPayload
from riva.schemas.practice_interactions import (
    MAX_PRACTICE_FOLLOW_UPS,
    PracticeAnswerContent,
    PracticeAnswerKind,
)
from riva.schemas.practice_reference_answer import PracticeReferenceAnswerTargetType
from riva.schemas.practice_sessions import (
    PracticeAttemptStatus,
    PracticeSessionCompletionReason,
    PracticeSessionSelection,
    PracticeSessionStatus,
)
from riva.schemas.practice_recommendation import (
    PracticeRecommendationInput,
    PracticeRecommendationQuestionContext,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.schemas.question_generation import QuestionGenerationRunPayload
from riva.services.follow_up_generation import (
    FollowUpGenerationService,
    FollowUpGenerationStateError,
    follow_up_output_from_persistence,
    practice_follow_up_idempotency_key,
    validate_follow_up_generation_run,
)
from riva.services.evaluation_generation import (
    EvaluationGenerationService,
    EvaluationGenerationStateError,
    practice_evaluation_idempotency_key,
    practice_evaluation_output_from_artifact,
    validate_evaluation_generation_run,
)
from riva.services.recommendation_generation import (
    RecommendationGenerationService,
    RecommendationGenerationStateError,
    practice_recommendation_idempotency_key,
    practice_recommendation_output_from_artifact,
    validate_recommendation_generation_run,
    validate_recommendation_v1_contract,
)
from riva.services.review_generation import (
    ReviewGenerationService,
    ReviewGenerationStateError,
    practice_review_idempotency_key,
    practice_review_output_from_artifact,
    validate_review_generation_run,
)
from riva.services.question_generation import (
    QuestionGenerationService,
    QuestionGenerationStateError,
    validate_question_generation_run,
)
from riva.services.reference_answer_generation import (
    PracticeReferenceAnswerLifecycleStatus,
    PracticeReferenceAnswerWorkflowState,
    ReferenceAnswerGenerationService,
    ReferenceAnswerGenerationStateError,
    practice_follow_up_reference_answer_idempotency_key,
    practice_main_reference_answer_idempotency_key,
)
from riva.utils import utc_now


PracticeSessionStateErrorCode = Literal[
    "practice_session_not_found",
    "practice_session_version_conflict",
    "practice_session_already_active",
    "practice_session_state_conflict",
    "practice_session_source_unavailable",
    "practice_weakness_prioritization_unavailable",
    "practice_question_generation_prerequisite_failed",
    "practice_question_generation_unavailable",
    "practice_question_generation_failed",
    "practice_question_generation_state_conflict",
    "practice_follow_up_generation_failed",
    "practice_follow_up_generation_state_conflict",
    "practice_follow_up_generation_unavailable",
    "practice_evaluation_generation_state_conflict",
    "practice_evaluation_generation_unavailable",
    "practice_evaluation_generation_failed",
    "practice_review_generation_failed",
    "practice_review_generation_state_conflict",
    "practice_review_generation_unavailable",
    "practice_recommendation_generation_failed",
    "practice_recommendation_generation_state_conflict",
    "practice_recommendation_generation_unavailable",
    "practice_reference_answer_generation_unavailable",
]

PRACTICE_SESSION_NOT_FOUND: PracticeSessionStateErrorCode = (
    "practice_session_not_found"
)
PRACTICE_SESSION_VERSION_CONFLICT: PracticeSessionStateErrorCode = (
    "practice_session_version_conflict"
)
PRACTICE_SESSION_ALREADY_ACTIVE: PracticeSessionStateErrorCode = (
    "practice_session_already_active"
)
PRACTICE_SESSION_STATE_CONFLICT: PracticeSessionStateErrorCode = (
    "practice_session_state_conflict"
)
PRACTICE_SESSION_SOURCE_UNAVAILABLE: PracticeSessionStateErrorCode = (
    "practice_session_source_unavailable"
)
PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE: PracticeSessionStateErrorCode = (
    "practice_weakness_prioritization_unavailable"
)
PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED: PracticeSessionStateErrorCode = (
    "practice_question_generation_prerequisite_failed"
)
PRACTICE_QUESTION_GENERATION_UNAVAILABLE: PracticeSessionStateErrorCode = (
    "practice_question_generation_unavailable"
)
PRACTICE_QUESTION_GENERATION_FAILED: PracticeSessionStateErrorCode = (
    "practice_question_generation_failed"
)
PRACTICE_QUESTION_GENERATION_STATE_CONFLICT: PracticeSessionStateErrorCode = (
    "practice_question_generation_state_conflict"
)
PRACTICE_FOLLOW_UP_GENERATION_FAILED: PracticeSessionStateErrorCode = (
    "practice_follow_up_generation_failed"
)
PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT: PracticeSessionStateErrorCode = (
    "practice_follow_up_generation_state_conflict"
)
PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE: PracticeSessionStateErrorCode = (
    "practice_follow_up_generation_unavailable"
)
PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT: PracticeSessionStateErrorCode = (
    "practice_evaluation_generation_state_conflict"
)
PRACTICE_EVALUATION_GENERATION_UNAVAILABLE: PracticeSessionStateErrorCode = (
    "practice_evaluation_generation_unavailable"
)
PRACTICE_EVALUATION_GENERATION_FAILED: PracticeSessionStateErrorCode = (
    "practice_evaluation_generation_failed"
)
PRACTICE_REVIEW_GENERATION_FAILED: PracticeSessionStateErrorCode = (
    "practice_review_generation_failed"
)
PRACTICE_REVIEW_GENERATION_STATE_CONFLICT: PracticeSessionStateErrorCode = (
    "practice_review_generation_state_conflict"
)
PRACTICE_REVIEW_GENERATION_UNAVAILABLE: PracticeSessionStateErrorCode = (
    "practice_review_generation_unavailable"
)
PRACTICE_RECOMMENDATION_GENERATION_FAILED: PracticeSessionStateErrorCode = (
    "practice_recommendation_generation_failed"
)
PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT: PracticeSessionStateErrorCode = (
    "practice_recommendation_generation_state_conflict"
)
PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE: PracticeSessionStateErrorCode = (
    "practice_recommendation_generation_unavailable"
)
PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE: PracticeSessionStateErrorCode = (
    "practice_reference_answer_generation_unavailable"
)


class PracticeSessionStateError(RuntimeError):
    safe_message = "The practice session state is invalid."

    def __init__(
        self,
        code: PracticeSessionStateErrorCode,
        *,
        source_code: str | None = None,
    ) -> None:
        self.code = code
        self.source_code = source_code
        super().__init__(self.safe_message)


@dataclass(frozen=True)
class PracticeSessionWorkflowContext:
    session: PracticeSession
    attempt: PracticeAttempt
    question_generation_run: AgentRun
    question_card: QuestionCard | None


@dataclass(frozen=True)
class PracticeAnsweredFollowUpExchangeContext:
    question: PracticeFollowUpQuestion
    answer: PracticeAnswer


@dataclass(frozen=True)
class PracticePrimaryAnswerWorkflowContext:
    session: PracticeSession
    attempt: PracticeAttempt
    question_card: QuestionCard
    main_answer: PracticeAnswer
    follow_up_generation_run: AgentRun
    follow_up_decision: PracticeFollowUpDecision | None
    follow_up_question: PracticeFollowUpQuestion | None
    follow_up_exchanges: tuple[PracticeAnsweredFollowUpExchangeContext, ...] = field(
        default_factory=tuple,
        kw_only=True,
    )
    follow_up_completion_reason: (
        PracticeEvaluationFollowUpCompletionReason | None
    ) = field(default=None, kw_only=True)


@dataclass(frozen=True)
class PracticeReferenceAnswerRequestContext:
    target_type: PracticeReferenceAnswerTargetType
    session: PracticeSession
    attempt: PracticeAttempt
    question_card: QuestionCard
    follow_up_question: PracticeFollowUpQuestion | None
    generation_state: PracticeReferenceAnswerWorkflowState


@dataclass(frozen=True)
class PracticeEvaluationWorkflowContext(PracticePrimaryAnswerWorkflowContext):
    evaluation_generation_run: AgentRun
    evaluation: PracticeEvaluation | None
    review_generation_run: AgentRun | None = None
    review: PracticeReview | None = None
    recommendation_generation_run: AgentRun | None = None
    recommendation: PracticeRecommendation | None = None


@dataclass(frozen=True)
class PracticeReviewWorkflowContext(PracticePrimaryAnswerWorkflowContext):
    evaluation_generation_run: AgentRun
    evaluation: PracticeEvaluation
    review_generation_run: AgentRun
    review: PracticeReview
    recommendation_generation_run: AgentRun
    recommendation: PracticeRecommendation


@dataclass(frozen=True)
class PracticeCompletedSessionWorkflowContext:
    session: PracticeSession
    final_attempt: PracticeAttempt
    final_review_context: PracticeReviewWorkflowContext
    attempt_review_contexts: tuple[PracticeReviewWorkflowContext, ...] = field(
        default_factory=tuple,
        kw_only=True,
    )


@dataclass(frozen=True)
class PracticeEndedEarlySessionWorkflowContext:
    session: PracticeSession
    unfinished_attempt: PracticeAttempt
    question_context: PracticeSessionWorkflowContext
    completed_attempt_review_contexts: tuple[
        PracticeReviewWorkflowContext, ...
    ] = field(default_factory=tuple, kw_only=True)


@dataclass(frozen=True)
class _PracticeFollowUpChain:
    card: QuestionCard
    main_answer: PracticeAnswer
    follow_up_generation_run: AgentRun
    follow_up_decision: PracticeFollowUpDecision | None
    follow_up_question: PracticeFollowUpQuestion | None
    follow_up_exchanges: tuple[PracticeAnsweredFollowUpExchangeContext, ...]
    completion_reason: PracticeEvaluationFollowUpCompletionReason | None


@dataclass(frozen=True)
class _PracticeReviewReferenceAnswerTarget:
    follow_up_question_id: UUID | None
    submitted_at: datetime | None


@dataclass(frozen=True)
class _PracticeQuestionSource:
    """The immutable question provenance shared by original and retry attempts."""

    attempt: PracticeAttempt
    generation_run: AgentRun
    generation_payload: QuestionGenerationRunPayload
    question_card: QuestionCard


# Kept as a named alias for callers that want to describe the complete
# evaluation pipeline without depending on the final public-state class.
PracticeEvaluationPipelineContext = PracticeEvaluationWorkflowContext


PracticePublicWorkflowContext = (
    PracticeSessionWorkflowContext
    | PracticePrimaryAnswerWorkflowContext
    | PracticeEvaluationWorkflowContext
    | PracticeReviewWorkflowContext
)


QuestionGenerationServiceFactory = Callable[
    ...,
    QuestionGenerationService,
]


def practice_question_generation_idempotency_key(
    session_id: UUID,
    attempt_id: UUID,
) -> str:
    return (
        f"practice-session:{session_id}:"
        f"attempt:{attempt_id}:question-generation"
    )
FollowUpGenerationServiceFactory = Callable[
    ...,
    FollowUpGenerationService,
]
EvaluationGenerationServiceFactory = Callable[
    ...,
    EvaluationGenerationService,
]
ReviewGenerationServiceFactory = Callable[
    ...,
    ReviewGenerationService,
]
RecommendationGenerationServiceFactory = Callable[
    ...,
    RecommendationGenerationService,
]
ReferenceAnswerGenerationServiceFactory = Callable[
    ...,
    ReferenceAnswerGenerationService,
]


class PracticeSessionService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_model: str | None = None,
        question_generation_service_factory: QuestionGenerationServiceFactory = (
            QuestionGenerationService
        ),
        follow_up_generation_service_factory: FollowUpGenerationServiceFactory = (
            FollowUpGenerationService
        ),
        evaluation_generation_service_factory: EvaluationGenerationServiceFactory = (
            EvaluationGenerationService
        ),
        review_generation_service_factory: ReviewGenerationServiceFactory = (
            ReviewGenerationService
        ),
        recommendation_generation_service_factory: RecommendationGenerationServiceFactory = (
            RecommendationGenerationService
        ),
        reference_answer_generation_service_factory: ReferenceAnswerGenerationServiceFactory = (
            ReferenceAnswerGenerationService
        ),
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.llm_model = (llm_model or "").strip()
        self.question_generation_service_factory = (
            question_generation_service_factory
        )
        self.follow_up_generation_service_factory = (
            follow_up_generation_service_factory
        )
        self.evaluation_generation_service_factory = (
            evaluation_generation_service_factory
        )
        self.review_generation_service_factory = (
            review_generation_service_factory
        )
        self.recommendation_generation_service_factory = (
            recommendation_generation_service_factory
        )
        self.reference_answer_generation_service_factory = (
            reference_answer_generation_service_factory
        )
        self.clock = clock

    async def start_session(
        self,
        *,
        user_id: UUID,
        selection: PracticeSessionSelection,
        interaction_language: InteractionLanguage,
    ) -> PracticePublicWorkflowContext:
        try:
            self._require_supported_selection(selection)
            await self._lock_user(user_id)
            active_session = await self._load_active_session(
                user_id,
                for_update=True,
            )
            if active_session is not None:
                if not self._same_intent(
                    active_session,
                    selection=selection,
                    interaction_language=interaction_language,
                ):
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_ALREADY_ACTIVE
                    )
                context = await self._load_active_context(active_session)
                await self.session.commit()
                return context

            now = self.clock()
            _require_aware_datetime(now)
            practice_session = PracticeSession(
                id=uuid4(),
                user_id=user_id,
                target_role_id=selection.target_role_id,
                language=interaction_language,
                version=1,
                status="active",
                initial_question_type=selection.question_type.value,
                initial_difficulty=selection.difficulty.value,
                source=selection.source.value,
                prioritize_weaknesses=False,
                started_at=now,
                completed_at=None,
                completion_reason=None,
                created_at=now,
                updated_at=now,
            )
            attempt = PracticeAttempt(
                id=uuid4(),
                user_id=user_id,
                session_id=practice_session.id,
                attempt_number=1,
                question_type=selection.question_type.value,
                difficulty=selection.difficulty.value,
                status=PracticeAttemptStatus.GENERATING_QUESTION.value,
                question_generation_run_id=None,
                question_card_id=None,
                retry_of_attempt_id=None,
                created_at=now,
                updated_at=now,
                completed_at=None,
            )
            self.session.add_all([practice_session, attempt])

            try:
                run = await self._generation_service().enqueue_generation_in_transaction(
                    user_id=user_id,
                    target_role_id=practice_session.target_role_id,
                    question_type=selection.question_type,
                    difficulty=selection.difficulty,
                    interaction_language=practice_session.language,
                    idempotency_key=practice_question_generation_idempotency_key(
                        practice_session.id,
                        attempt.id,
                    ),
                )
            except QuestionGenerationStateError as error:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED,
                    source_code=error.code,
                ) from None

            if run.id is None:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
                )
            attempt.question_generation_run_id = run.id
            attempt.question_generation_run = run
            await self.session.commit()
            return PracticeSessionWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_generation_run=run,
                question_card=None,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def continue_to_next_question(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
    ) -> PracticeSessionWorkflowContext:
        """Leave the current review and enqueue the next attempt atomically."""

        practice_session: PracticeSession | None = None
        previous_attempt: PracticeAttempt | None = None
        previous_status: str | None = None
        previous_updated_at: datetime | None = None
        previous_version: int | None = None
        previous_session_updated_at: datetime | None = None
        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            if practice_session.status != "active":
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            current_attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if current_attempt is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if (
                current_attempt.user_id != user_id
                or current_attempt.session_id != practice_session.id
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            if practice_session.version == expected_version + 1:
                try:
                    context = await self._load_continue_next_question_replay_context(
                        practice_session=practice_session,
                        attempt=current_attempt,
                        question_id=question_id,
                    )
                except PracticeSessionStateError:
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    ) from None
                await self.session.commit()
                return context

            if practice_session.version != expected_version:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )
            if current_attempt.status != PracticeAttemptStatus.REVIEW.value:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if current_attempt.question_card_id != question_id:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            review_context = await self._load_review_replay_context(
                practice_session,
                current_attempt,
            )
            recommendation = review_context.recommendation
            if recommendation is None:
                raise PracticeSessionStateError(
                    PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
                )
            next_question_type, next_difficulty = self._next_question_selection(
                current_attempt,
                recommendation,
            )

            now = self.clock()
            _require_aware_datetime(now)
            previous_attempt = current_attempt
            previous_status = current_attempt.status
            previous_updated_at = current_attempt.updated_at
            previous_version = practice_session.version
            previous_session_updated_at = practice_session.updated_at

            next_attempt = PracticeAttempt(
                id=uuid4(),
                user_id=user_id,
                session_id=practice_session.id,
                attempt_number=current_attempt.attempt_number + 1,
                question_type=next_question_type.value,
                difficulty=next_difficulty.value,
                status=PracticeAttemptStatus.GENERATING_QUESTION.value,
                question_generation_run_id=None,
                question_card_id=None,
                retry_of_attempt_id=None,
                created_at=now,
                updated_at=now,
                completed_at=None,
            )
            self.session.add(next_attempt)
            await self.session.flush()

            idempotency_key = practice_question_generation_idempotency_key(
                practice_session.id,
                next_attempt.id,
            )
            try:
                question_generation_run = (
                    await self._generation_service().enqueue_generation_in_transaction(
                        user_id=user_id,
                        target_role_id=practice_session.target_role_id,
                        question_type=next_question_type,
                        difficulty=next_difficulty,
                        interaction_language=practice_session.language,
                        idempotency_key=idempotency_key,
                    )
                )
            except QuestionGenerationStateError as error:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED,
                    source_code=error.code,
                ) from None
            except ValueError:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
                    source_code="question_generation_unavailable",
                ) from None

            self._validate_question_generation_run_lineage(
                question_generation_run,
                practice_session=practice_session,
                attempt=next_attempt,
                idempotency_key=idempotency_key,
            )
            assert question_generation_run.id is not None
            next_attempt.question_generation_run_id = question_generation_run.id
            next_attempt.question_generation_run = question_generation_run

            current_attempt.status = PracticeAttemptStatus.COMPLETED.value
            current_attempt.updated_at = now
            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return PracticeSessionWorkflowContext(
                session=practice_session,
                attempt=next_attempt,
                question_generation_run=question_generation_run,
                question_card=None,
            )
        except BaseException:
            if previous_attempt is not None and previous_status is not None:
                previous_attempt.status = previous_status
                if previous_updated_at is not None:
                    previous_attempt.updated_at = previous_updated_at
            if practice_session is not None and previous_version is not None:
                practice_session.version = previous_version
                if previous_session_updated_at is not None:
                    practice_session.updated_at = previous_session_updated_at
            await self.session.rollback()
            raise

    async def skip_current_question(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
    ) -> PracticeSessionWorkflowContext:
        """Replace the unanswered attempt and enqueue its next question."""

        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            if practice_session.status != "active":
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            current_attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if current_attempt is None or (
                current_attempt.user_id != user_id
                or current_attempt.session_id != practice_session.id
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if practice_session.version != expected_version:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )
            if (
                current_attempt.status != PracticeAttemptStatus.ANSWERING.value
                or current_attempt.question_card_id != question_id
                or current_attempt.completed_at is not None
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            question_generation_run, _ = await self._load_generation_run(
                practice_session,
                current_attempt,
                for_update=True,
            )
            if question_generation_run.status != AgentRunStatus.SUCCEEDED:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            question_card = await self._load_card_by_id(
                practice_session,
                current_attempt,
                question_generation_run,
                for_update=True,
            )
            if question_card.id != question_id:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if (
                await self._load_main_answer(current_attempt, for_update=True)
                is not None
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            now = self.clock()
            _require_aware_datetime(now)
            question_type = QuestionCardQuestionType(current_attempt.question_type)
            difficulty = QuestionCardDifficulty(current_attempt.difficulty)

            await self.session.delete(current_attempt)
            await self.session.flush()

            replacement_attempt = PracticeAttempt(
                id=uuid4(),
                user_id=user_id,
                session_id=practice_session.id,
                attempt_number=current_attempt.attempt_number,
                question_type=question_type.value,
                difficulty=difficulty.value,
                status=PracticeAttemptStatus.GENERATING_QUESTION.value,
                question_generation_run_id=None,
                question_card_id=None,
                retry_of_attempt_id=None,
                created_at=now,
                updated_at=now,
                completed_at=None,
            )
            self.session.add(replacement_attempt)
            await self.session.flush()

            idempotency_key = practice_question_generation_idempotency_key(
                practice_session.id,
                replacement_attempt.id,
            )
            try:
                replacement_run = (
                    await self._generation_service().enqueue_generation_in_transaction(
                        user_id=user_id,
                        target_role_id=practice_session.target_role_id,
                        question_type=question_type,
                        difficulty=difficulty,
                        interaction_language=practice_session.language,
                        idempotency_key=idempotency_key,
                    )
                )
            except QuestionGenerationStateError as error:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED,
                    source_code=error.code,
                ) from None
            except ValueError:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
                    source_code="question_generation_unavailable",
                ) from None

            self._validate_question_generation_run_lineage(
                replacement_run,
                practice_session=practice_session,
                attempt=replacement_attempt,
                idempotency_key=idempotency_key,
            )
            if replacement_run.id is None:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
                )
            replacement_attempt.question_generation_run_id = replacement_run.id
            replacement_attempt.question_generation_run = replacement_run
            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return PracticeSessionWorkflowContext(
                session=practice_session,
                attempt=replacement_attempt,
                question_generation_run=replacement_run,
                question_card=None,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def retry_current_question(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
    ) -> PracticeSessionWorkflowContext:
        """Create an answering retry that reuses the canonical question card."""

        practice_session: PracticeSession | None = None
        previous_attempt: PracticeAttempt | None = None
        previous_status: str | None = None
        previous_updated_at: datetime | None = None
        previous_version: int | None = None
        previous_session_updated_at: datetime | None = None
        previous_session_completed_at: datetime | None = None
        previous_session_completion_reason: str | None = None
        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            if practice_session.status != "active":
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            current_attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if current_attempt is None or (
                current_attempt.user_id != user_id
                or current_attempt.session_id != practice_session.id
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            if practice_session.version == expected_version + 1:
                try:
                    context = await self._load_retry_current_question_replay_context(
                        practice_session=practice_session,
                        attempt=current_attempt,
                        question_id=question_id,
                    )
                except PracticeSessionStateError:
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    ) from None
                await self.session.commit()
                return context

            if practice_session.version != expected_version:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )
            if (
                current_attempt.status != PracticeAttemptStatus.REVIEW.value
                or current_attempt.question_card_id != question_id
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            review_context = await self._load_review_replay_context(
                practice_session,
                current_attempt,
            )
            source = await self._load_question_source(
                practice_session,
                current_attempt,
                for_update=True,
                require_succeeded=True,
            )
            if review_context.question_card.id != source.question_card.id:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
                )

            if current_attempt.question_card_id is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            now = self.clock()
            _require_aware_datetime(now)
            previous_attempt = current_attempt
            previous_status = current_attempt.status
            previous_updated_at = current_attempt.updated_at
            previous_version = practice_session.version
            previous_session_updated_at = practice_session.updated_at
            previous_session_completed_at = practice_session.completed_at
            previous_session_completion_reason = (
                practice_session.completion_reason
            )

            retry_attempt = PracticeAttempt(
                id=uuid4(),
                user_id=user_id,
                session_id=practice_session.id,
                attempt_number=current_attempt.attempt_number + 1,
                question_type=current_attempt.question_type,
                difficulty=current_attempt.difficulty,
                status=PracticeAttemptStatus.ANSWERING.value,
                question_generation_run_id=None,
                question_card_id=current_attempt.question_card_id,
                retry_of_attempt_id=current_attempt.id,
                created_at=now,
                updated_at=now,
                completed_at=None,
            )
            retry_attempt.question_card = source.question_card
            self.session.add(retry_attempt)

            current_attempt.status = PracticeAttemptStatus.COMPLETED.value
            current_attempt.updated_at = now
            practice_session.status = "active"
            practice_session.completed_at = None
            practice_session.completion_reason = None
            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return PracticeSessionWorkflowContext(
                session=practice_session,
                attempt=retry_attempt,
                question_generation_run=source.generation_run,
                question_card=source.question_card,
            )
        except BaseException:
            if previous_attempt is not None and previous_status is not None:
                previous_attempt.status = previous_status
                if previous_updated_at is not None:
                    previous_attempt.updated_at = previous_updated_at
            if practice_session is not None and previous_version is not None:
                practice_session.version = previous_version
                if previous_session_updated_at is not None:
                    practice_session.updated_at = previous_session_updated_at
                practice_session.completed_at = previous_session_completed_at
                practice_session.completion_reason = (
                    previous_session_completion_reason
                )
            await self.session.rollback()
            raise

    async def request_question_reference_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
    ) -> PracticeReferenceAnswerRequestContext:
        practice_session: PracticeSession | None = None
        previous_version: int | None = None
        previous_updated_at: datetime | None = None
        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            self._require_active_session_version(
                practice_session,
                expected_version=expected_version,
            )
            previous_version = practice_session.version
            previous_updated_at = practice_session.updated_at

            attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if (
                attempt is None
                or attempt.user_id != user_id
                or attempt.session_id != practice_session.id
                or attempt.status != PracticeAttemptStatus.ANSWERING.value
                or attempt.question_card_id != question_id
                or attempt.completed_at is not None
            ):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            source = await self._load_question_source(
                practice_session,
                attempt,
                for_update=True,
                require_succeeded=True,
            )
            if source.question_card.id != question_id:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            if await self._load_main_answer(attempt, for_update=True) is not None:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            await self._ensure_attempt_has_no_response_artifacts(
                practice_session,
                attempt,
            )

            try:
                generation_service = self._reference_answer_generation_service()
                run = await generation_service.enqueue_main_generation_in_transaction(
                    user_id=user_id,
                    question_card_id=source.question_card.id,
                    idempotency_key=practice_main_reference_answer_idempotency_key(
                        source.question_card.id
                    ),
                )
                generation_state = await generation_service.get_main_generation_state(
                    user_id=user_id,
                    question_card_id=source.question_card.id,
                    submitted_at=None,
                    for_update=True,
                )
            except ReferenceAnswerGenerationStateError as error:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT,
                    source_code=error.code,
                ) from None
            except ValueError as error:
                raise PracticeSessionStateError(
                    PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE,
                    source_code="reference_answer_generation_unavailable",
                ) from error

            if (
                run.id is None
                or generation_state.generation_run is None
                or generation_state.generation_run.id != run.id
            ):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            now = self.clock()
            _require_aware_datetime(now)
            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return PracticeReferenceAnswerRequestContext(
                target_type=PracticeReferenceAnswerTargetType.MAIN,
                session=practice_session,
                attempt=attempt,
                question_card=source.question_card,
                follow_up_question=None,
                generation_state=generation_state,
            )
        except BaseException:
            if practice_session is not None and previous_version is not None:
                practice_session.version = previous_version
                practice_session.updated_at = previous_updated_at
            await self.session.rollback()
            raise

    async def request_follow_up_reference_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        follow_up_question_id: UUID,
    ) -> PracticeReferenceAnswerRequestContext:
        practice_session: PracticeSession | None = None
        previous_version: int | None = None
        previous_updated_at: datetime | None = None
        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            self._require_active_session_version(
                practice_session,
                expected_version=expected_version,
            )
            previous_version = practice_session.version
            previous_updated_at = practice_session.updated_at

            attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if (
                attempt is None
                or attempt.user_id != user_id
                or attempt.session_id != practice_session.id
                or attempt.status
                != PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
                or attempt.question_card_id != question_id
                or attempt.completed_at is not None
            ):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            chain = await self._load_follow_up_chain(
                practice_session,
                attempt,
                for_update=True,
            )
            pending_question = chain.follow_up_question
            if (
                chain.card.id != question_id
                or chain.follow_up_generation_run.status
                != AgentRunStatus.SUCCEEDED
                or chain.follow_up_decision is None
                or chain.follow_up_decision.action != "askFollowUp"
                or pending_question is None
                or pending_question.id != follow_up_question_id
                or chain.completion_reason is not None
            ):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            try:
                generation_service = self._reference_answer_generation_service()
                run = await generation_service.enqueue_follow_up_generation_in_transaction(
                    user_id=user_id,
                    question_card_id=chain.card.id,
                    follow_up_question_id=pending_question.id,
                    idempotency_key=practice_follow_up_reference_answer_idempotency_key(
                        pending_question.id
                    ),
                )
                generation_state = await generation_service.get_follow_up_generation_state(
                    user_id=user_id,
                    question_card_id=chain.card.id,
                    follow_up_question_id=pending_question.id,
                    submitted_at=None,
                    for_update=True,
                )
            except ReferenceAnswerGenerationStateError as error:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT,
                    source_code=error.code,
                ) from None
            except ValueError as error:
                raise PracticeSessionStateError(
                    PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE,
                    source_code="reference_answer_generation_unavailable",
                ) from error

            if (
                run.id is None
                or generation_state.generation_run is None
                or generation_state.generation_run.id != run.id
            ):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            now = self.clock()
            _require_aware_datetime(now)
            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return PracticeReferenceAnswerRequestContext(
                target_type=PracticeReferenceAnswerTargetType.FOLLOW_UP,
                session=practice_session,
                attempt=attempt,
                question_card=chain.card,
                follow_up_question=pending_question,
                generation_state=generation_state,
            )
        except BaseException:
            if practice_session is not None and previous_version is not None:
                practice_session.version = previous_version
                practice_session.updated_at = previous_updated_at
            await self.session.rollback()
            raise

    async def refresh_question_reference_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
    ) -> PracticeReferenceAnswerRequestContext:
        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )
            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=False,
            )
            self._require_active_session_version(
                practice_session,
                expected_version=expected_version,
            )
            attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=False,
            )
            if (
                attempt is None
                or attempt.user_id != user_id
                or attempt.session_id != practice_session.id
                or attempt.status != PracticeAttemptStatus.ANSWERING.value
                or attempt.question_card_id != question_id
                or attempt.completed_at is not None
            ):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            source = await self._load_question_source(
                practice_session,
                attempt,
                for_update=False,
                require_succeeded=True,
            )
            if source.question_card.id != question_id:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            if await self._load_main_answer(attempt, for_update=False) is not None:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            await self._ensure_attempt_has_no_response_artifacts(
                practice_session,
                attempt,
                for_update=False,
            )
            generation_state = await self._reference_answer_generation_service().get_main_generation_state(
                user_id=user_id,
                question_card_id=source.question_card.id,
                submitted_at=None,
                for_update=False,
            )
            return PracticeReferenceAnswerRequestContext(
                target_type=PracticeReferenceAnswerTargetType.MAIN,
                session=practice_session,
                attempt=attempt,
                question_card=source.question_card,
                follow_up_question=None,
                generation_state=generation_state,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def refresh_follow_up_reference_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        follow_up_question_id: UUID,
    ) -> PracticeReferenceAnswerRequestContext:
        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )
            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=False,
            )
            self._require_active_session_version(
                practice_session,
                expected_version=expected_version,
            )
            attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=False,
            )
            if (
                attempt is None
                or attempt.user_id != user_id
                or attempt.session_id != practice_session.id
                or attempt.status
                != PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
                or attempt.question_card_id != question_id
                or attempt.completed_at is not None
            ):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            chain = await self._load_follow_up_chain(
                practice_session,
                attempt,
                for_update=False,
            )
            pending_question = chain.follow_up_question
            if (
                chain.card.id != question_id
                or chain.follow_up_generation_run.status
                != AgentRunStatus.SUCCEEDED
                or chain.follow_up_decision is None
                or chain.follow_up_decision.action != "askFollowUp"
                or pending_question is None
                or pending_question.id != follow_up_question_id
                or chain.completion_reason is not None
            ):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            generation_state = await self._reference_answer_generation_service().get_follow_up_generation_state(
                user_id=user_id,
                question_card_id=chain.card.id,
                follow_up_question_id=pending_question.id,
                submitted_at=None,
                for_update=False,
            )
            return PracticeReferenceAnswerRequestContext(
                target_type=PracticeReferenceAnswerTargetType.FOLLOW_UP,
                session=practice_session,
                attempt=attempt,
                question_card=chain.card,
                follow_up_question=pending_question,
                generation_state=generation_state,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def reveal_question_hint(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
    ) -> PracticeSessionWorkflowContext:
        return await self._reveal_question_guidance(
            user_id=user_id,
            session_id=session_id,
            expected_version=expected_version,
            question_id=question_id,
            flag="answer_hints_revealed",
        )

    async def reveal_question_framework(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
    ) -> PracticeSessionWorkflowContext:
        return await self._reveal_question_guidance(
            user_id=user_id,
            session_id=session_id,
            expected_version=expected_version,
            question_id=question_id,
            flag="answer_framework_revealed",
        )

    async def _reveal_question_guidance(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        flag: Literal[
            "answer_hints_revealed",
            "answer_framework_revealed",
        ],
    ) -> PracticeSessionWorkflowContext:
        try:
            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            self._require_active_session_version(
                practice_session,
                expected_version=expected_version,
            )

            attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if (
                attempt is None
                or attempt.user_id != user_id
                or attempt.session_id != practice_session.id
                or attempt.status != PracticeAttemptStatus.ANSWERING.value
                or attempt.question_card_id != question_id
                or attempt.completed_at is not None
            ):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            question_generation_run, _ = await self._load_generation_run(
                practice_session,
                attempt,
                for_update=True,
            )
            if question_generation_run.status != AgentRunStatus.SUCCEEDED:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            question_card = await self._load_card_by_id(
                practice_session,
                attempt,
                question_generation_run,
                for_update=True,
            )
            if (
                question_card.id != question_id
                or question_card.user_id != user_id
            ):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            if await self._load_main_answer(attempt, for_update=True) is not None:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            now = self.clock()
            _require_aware_datetime(now)
            if flag == "answer_hints_revealed":
                question_card.answer_hints_revealed = True
            else:
                question_card.answer_framework_revealed = True
            question_card.updated_at = now
            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return PracticeSessionWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_generation_run=question_generation_run,
                question_card=question_card,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def reveal_follow_up_hint(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        follow_up_question_id: UUID,
    ) -> PracticePrimaryAnswerWorkflowContext:
        return await self._reveal_follow_up_guidance(
            user_id=user_id,
            session_id=session_id,
            expected_version=expected_version,
            question_id=question_id,
            follow_up_question_id=follow_up_question_id,
            flag="answer_hints_revealed",
        )

    async def reveal_follow_up_framework(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        follow_up_question_id: UUID,
    ) -> PracticePrimaryAnswerWorkflowContext:
        return await self._reveal_follow_up_guidance(
            user_id=user_id,
            session_id=session_id,
            expected_version=expected_version,
            question_id=question_id,
            follow_up_question_id=follow_up_question_id,
            flag="answer_framework_revealed",
        )

    async def _reveal_follow_up_guidance(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        follow_up_question_id: UUID,
        flag: Literal[
            "answer_hints_revealed",
            "answer_framework_revealed",
        ],
    ) -> PracticePrimaryAnswerWorkflowContext:
        try:
            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            self._require_active_session_version(
                practice_session,
                expected_version=expected_version,
            )

            attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if (
                attempt is None
                or attempt.user_id != user_id
                or attempt.session_id != practice_session.id
                or attempt.status
                != PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
                or attempt.question_card_id != question_id
                or attempt.completed_at is not None
            ):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            chain = await self._load_follow_up_chain(
                practice_session,
                attempt,
                for_update=True,
            )
            pending_question = chain.follow_up_question
            if (
                chain.card.id != question_id
                or chain.follow_up_generation_run.status
                != AgentRunStatus.SUCCEEDED
                or chain.follow_up_decision is None
                or chain.follow_up_decision.action != "askFollowUp"
                or pending_question is None
                or pending_question.id != follow_up_question_id
                or chain.completion_reason is not None
            ):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            now = self.clock()
            _require_aware_datetime(now)
            if flag == "answer_hints_revealed":
                pending_question.answer_hints_revealed = True
            else:
                pending_question.answer_framework_revealed = True
            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return self._primary_context_from_chain(
                practice_session,
                attempt,
                chain,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def set_question_saved(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        is_saved: bool,
    ) -> PracticePublicWorkflowContext:
        return await self._set_question_flag(
            user_id=user_id,
            session_id=session_id,
            expected_version=expected_version,
            question_id=question_id,
            flag="is_saved",
            value=is_saved,
        )

    async def set_question_weak(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        is_marked_weak: bool,
    ) -> PracticePublicWorkflowContext:
        return await self._set_question_flag(
            user_id=user_id,
            session_id=session_id,
            expected_version=expected_version,
            question_id=question_id,
            flag="is_marked_weak",
            value=is_marked_weak,
        )

    async def _set_question_flag(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        flag: Literal["is_saved", "is_marked_weak"],
        value: bool,
    ) -> PracticePublicWorkflowContext:
        try:
            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            if not isinstance(value, bool):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )
            if (
                practice_session.status != PracticeSessionStatus.ACTIVE.value
                or practice_session.completed_at is not None
                or practice_session.completion_reason is not None
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if practice_session.version != expected_version:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            current_attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if current_attempt is None or current_attempt.status not in {
                PracticeAttemptStatus.ANSWERING.value,
                PracticeAttemptStatus.REVIEW.value,
            }:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            context = await self._load_public_active_context(
                practice_session,
                for_update=True,
                current_attempt=current_attempt,
            )
            if context.attempt.status == PracticeAttemptStatus.ANSWERING.value:
                if not isinstance(context, PracticeSessionWorkflowContext):
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_STATE_CONFLICT
                    )
            elif context.attempt.status == PracticeAttemptStatus.REVIEW.value:
                if not isinstance(context, PracticeReviewWorkflowContext):
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_STATE_CONFLICT
                    )
            else:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            question_card = context.question_card
            if (
                question_card is None
                or context.attempt.question_card_id != question_id
                or question_card.id != question_id
                or question_card.user_id != user_id
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            now = self.clock()
            _require_aware_datetime(now)
            if flag == "is_saved":
                question_card.is_saved = value
            else:
                question_card.is_marked_weak = value
            question_card.updated_at = now
            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return context
        except BaseException:
            await self.session.rollback()
            raise

    @staticmethod
    def _require_active_session_version(
        practice_session: PracticeSession,
        *,
        expected_version: int,
    ) -> None:
        if not _valid_expected_version(expected_version):
            raise PracticeSessionStateError(PRACTICE_SESSION_VERSION_CONFLICT)
        if (
            practice_session.status != PracticeSessionStatus.ACTIVE.value
            or practice_session.completed_at is not None
            or practice_session.completion_reason is not None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if practice_session.version != expected_version:
            raise PracticeSessionStateError(PRACTICE_SESSION_VERSION_CONFLICT)

    async def complete_session_after_review(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
    ) -> PracticeCompletedSessionWorkflowContext:
        """Complete an active session whose latest attempt is in final review."""

        practice_session: PracticeSession | None = None
        current_attempt: PracticeAttempt | None = None
        previous_attempt_status: str | None = None
        previous_attempt_updated_at: datetime | None = None
        previous_session_status: str | None = None
        previous_session_version: int | None = None
        previous_session_updated_at: datetime | None = None
        previous_session_completed_at: datetime | None = None
        previous_session_completion_reason: str | None = None
        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            # Lock the session before looking up the latest attempt so this
            # transition serializes with the other review actions.
            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            current_attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if current_attempt is None or (
                current_attempt.user_id != user_id
                or current_attempt.session_id != practice_session.id
            ):
                if practice_session.version != expected_version:
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    )
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            if practice_session.version == expected_version + 1:
                if (
                    practice_session.status
                    != PracticeSessionStatus.COMPLETED.value
                    or practice_session.completion_reason
                    != PracticeSessionCompletionReason.REVIEW_COMPLETED.value
                    or practice_session.completed_at is None
                ):
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    )
                if (
                    current_attempt.status
                    != PracticeAttemptStatus.COMPLETED.value
                    or current_attempt.completed_at is None
                ):
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    )
                try:
                    final_review_context = await self._load_review_replay_context(
                        practice_session,
                        current_attempt,
                        allow_completed=True,
                        allow_completed_session=True,
                    )
                    completed_context = await self._load_completed_session_context(
                        practice_session,
                        for_update=True,
                        prevalidated_context=final_review_context,
                    )
                except (
                    AttributeError,
                    PracticeSessionStateError,
                    TypeError,
                    ValueError,
                    ValidationError,
                ):
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    ) from None
                await self.session.commit()
                return completed_context

            if practice_session.version != expected_version:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )
            if (
                practice_session.status != PracticeSessionStatus.ACTIVE.value
                or practice_session.completed_at is not None
                or practice_session.completion_reason is not None
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if current_attempt.status != PracticeAttemptStatus.REVIEW.value:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if current_attempt.completed_at is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            final_review_context = await self._load_review_replay_context(
                practice_session,
                current_attempt,
            )

            now = self.clock()
            _require_aware_datetime(now)
            previous_attempt_status = current_attempt.status
            previous_attempt_updated_at = current_attempt.updated_at
            previous_session_status = practice_session.status
            previous_session_version = practice_session.version
            previous_session_updated_at = practice_session.updated_at
            previous_session_completed_at = practice_session.completed_at
            previous_session_completion_reason = practice_session.completion_reason

            current_attempt.status = PracticeAttemptStatus.COMPLETED.value
            current_attempt.updated_at = now
            practice_session.status = PracticeSessionStatus.COMPLETED.value
            practice_session.completion_reason = (
                PracticeSessionCompletionReason.REVIEW_COMPLETED.value
            )
            practice_session.completed_at = now
            practice_session.version += 1
            practice_session.updated_at = now
            completed_context = await self._load_completed_session_context(
                practice_session,
                for_update=True,
                prevalidated_context=final_review_context,
            )
            await self.session.commit()
            return completed_context
        except BaseException:
            if current_attempt is not None and previous_attempt_status is not None:
                current_attempt.status = previous_attempt_status
                current_attempt.updated_at = previous_attempt_updated_at
            if practice_session is not None and previous_session_version is not None:
                if previous_session_status is not None:
                    practice_session.status = previous_session_status
                practice_session.version = previous_session_version
                if previous_session_updated_at is not None:
                    practice_session.updated_at = previous_session_updated_at
                practice_session.completed_at = previous_session_completed_at
                practice_session.completion_reason = (
                    previous_session_completion_reason
                )
            await self.session.rollback()
            raise

    async def submit_primary_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        content: PracticeAnswerContent | str,
    ) -> PracticePrimaryAnswerWorkflowContext:
        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            if practice_session.status != "active":
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if attempt is None:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            if practice_session.version == expected_version + 1:
                normalized_content = _normalize_answer_content(content)
                try:
                    context = await self._load_primary_answer_replay_context(
                        practice_session=practice_session,
                        attempt=attempt,
                        question_id=question_id,
                        normalized_content=normalized_content,
                    )
                except PracticeSessionStateError:
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    ) from None
                await self.session.commit()
                return context

            if practice_session.version != expected_version:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )
            if attempt.status != PracticeAttemptStatus.ANSWERING.value:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            if attempt.question_card_id != question_id:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            normalized_content = _normalize_answer_content(content)
            question_generation_run, _ = await self._load_generation_run(
                practice_session,
                attempt,
                for_update=True,
            )
            if question_generation_run.status != AgentRunStatus.SUCCEEDED:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            card = await self._load_card_by_id(
                practice_session,
                attempt,
                question_generation_run,
                for_update=True,
            )
            existing_main_answer = await self._load_main_answer(
                attempt,
                for_update=True,
            )
            if existing_main_answer is not None:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            now = self.clock()
            _require_aware_datetime(now)
            main_answer = PracticeAnswer(
                id=uuid4(),
                attempt_id=attempt.id,
                kind=PracticeAnswerKind.MAIN.value,
                order=1,
                content=normalized_content,
                follow_up_question_id=None,
                submitted_at=now,
            )
            self.session.add(main_answer)
            await self.session.flush()

            follow_up_generation_run = await self._enqueue_follow_up_generation(
                user_id=user_id,
                session=practice_session,
                attempt=attempt,
            )
            if follow_up_generation_run.id is None:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )

            attempt.updated_at = now
            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return PracticePrimaryAnswerWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_card=card,
                main_answer=main_answer,
                follow_up_generation_run=follow_up_generation_run,
                follow_up_decision=None,
                follow_up_question=None,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def submit_follow_up_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        follow_up_question_id: UUID,
        content: PracticeAnswerContent | str,
    ) -> PracticePrimaryAnswerWorkflowContext:
        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            if practice_session.status != "active":
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if attempt is None:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            normalized_content = _normalize_answer_content(content)
            if practice_session.version == expected_version + 1:
                try:
                    replay = await self._load_follow_up_answer_replay_context(
                        practice_session=practice_session,
                        attempt=attempt,
                        question_id=question_id,
                        follow_up_question_id=follow_up_question_id,
                        normalized_content=normalized_content,
                    )
                except PracticeSessionStateError:
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    ) from None
                await self.session.commit()
                return replay

            if practice_session.version != expected_version:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )
            if attempt.status != PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            if attempt.question_card_id != question_id:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            chain = await self._load_follow_up_chain(
                practice_session,
                attempt,
                for_update=True,
            )
            if (
                chain.follow_up_decision is None
                or chain.follow_up_decision.action != "askFollowUp"
                or chain.follow_up_question is None
                or chain.follow_up_question.id != follow_up_question_id
                or chain.follow_up_question.id in {
                    exchange.question.id for exchange in chain.follow_up_exchanges
                }
            ):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            question = chain.follow_up_question
            now = self.clock()
            _require_aware_datetime(now)
            answer = PracticeAnswer(
                id=uuid4(),
                attempt_id=attempt.id,
                kind=PracticeAnswerKind.FOLLOW_UP.value,
                order=question.order + 1,
                content=normalized_content,
                follow_up_question_id=question.id,
                submitted_at=now,
            )
            self.session.add(answer)
            await self.session.flush()

            exchanges = chain.follow_up_exchanges + (
                PracticeAnsweredFollowUpExchangeContext(
                    question=question,
                    answer=answer,
                ),
            )
            if question.order == MAX_PRACTICE_FOLLOW_UPS:
                if len(exchanges) != MAX_PRACTICE_FOLLOW_UPS:
                    raise PracticeSessionStateError(
                        PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                    )
                attempt.status = PracticeAttemptStatus.EVALUATING.value
                attempt.updated_at = now
                try:
                    evaluation_generation_run = (
                        await self._enqueue_evaluation_generation(
                            user_id=user_id,
                            practice_session=practice_session,
                            attempt=attempt,
                            question_card=chain.card,
                            main_answer=chain.main_answer,
                            complete_decision=chain.follow_up_decision,
                            follow_up_completion_reason=(
                                PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
                            ),
                            follow_up_exchanges=exchanges,
                        )
                    )
                except BaseException:
                    attempt.status = (
                        PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
                    )
                    raise

                practice_session.version += 1
                practice_session.updated_at = now
                await self.session.commit()
                return PracticeEvaluationWorkflowContext(
                    session=practice_session,
                    attempt=attempt,
                    question_card=chain.card,
                    main_answer=chain.main_answer,
                    follow_up_generation_run=chain.follow_up_generation_run,
                    follow_up_decision=chain.follow_up_decision,
                    follow_up_question=None,
                    follow_up_exchanges=exchanges,
                    follow_up_completion_reason=(
                        PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
                    ),
                    evaluation_generation_run=evaluation_generation_run,
                    evaluation=None,
                )

            if question.order != 1 or len(exchanges) != 1:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            follow_up_generation_run = await self._enqueue_follow_up_generation(
                user_id=user_id,
                session=practice_session,
                attempt=attempt,
                next_follow_up_order=2,
            )
            self._validate_follow_up_run_lineage(
                follow_up_generation_run,
                practice_session=practice_session,
                attempt=attempt,
                question_card=chain.card,
                main_answer=chain.main_answer,
                expected_order=2,
                previous_question_id=question.id,
                previous_answer_id=answer.id,
            )
            attempt.status = PracticeAttemptStatus.ANSWERING.value
            attempt.updated_at = now
            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return PracticePrimaryAnswerWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_card=chain.card,
                main_answer=chain.main_answer,
                follow_up_generation_run=follow_up_generation_run,
                follow_up_decision=None,
                follow_up_question=None,
                follow_up_exchanges=exchanges,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def end_follow_ups(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        follow_up_question_id: UUID,
    ) -> PracticeEvaluationWorkflowContext:
        """Stop the current follow-up chain and start evaluation atomically."""

        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            if practice_session.status != PracticeSessionStatus.ACTIVE.value:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if attempt is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            if practice_session.version == expected_version + 1:
                try:
                    context = await self._load_ended_follow_up_replay_context(
                        practice_session=practice_session,
                        attempt=attempt,
                        question_id=question_id,
                        follow_up_question_id=follow_up_question_id,
                    )
                except (
                    AttributeError,
                    PracticeSessionStateError,
                    TypeError,
                    ValueError,
                    ValidationError,
                ):
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    ) from None
                await self.session.commit()
                return context

            if practice_session.version != expected_version:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )
            if (
                practice_session.completed_at is not None
                or practice_session.completion_reason is not None
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if (
                attempt.status != PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
                or attempt.completed_at is not None
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if attempt.question_card_id != question_id:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            chain = await self._load_follow_up_chain(
                practice_session,
                attempt,
                for_update=True,
            )
            pending_question = chain.follow_up_question
            if (
                chain.follow_up_generation_run.status
                != AgentRunStatus.SUCCEEDED
                or chain.follow_up_decision is None
                or chain.follow_up_decision.action != "askFollowUp"
                or pending_question is None
                or pending_question.id != follow_up_question_id
                or chain.completion_reason is not None
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            now = self.clock()
            _require_aware_datetime(now)
            previous_attempt_status = attempt.status
            previous_attempt_updated_at = attempt.updated_at
            previous_session_version = practice_session.version
            previous_session_updated_at = practice_session.updated_at
            attempt.status = PracticeAttemptStatus.EVALUATING.value
            attempt.updated_at = now
            try:
                await self.session.flush()
                evaluation_generation_run = await self._enqueue_evaluation_generation(
                    user_id=user_id,
                    practice_session=practice_session,
                    attempt=attempt,
                    question_card=chain.card,
                    main_answer=chain.main_answer,
                    complete_decision=chain.follow_up_decision,
                    follow_up_completion_reason=(
                        PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
                    ),
                    follow_up_exchanges=chain.follow_up_exchanges,
                    unanswered_follow_up_question=pending_question,
                )
            except BaseException:
                attempt.status = previous_attempt_status
                attempt.updated_at = previous_attempt_updated_at
                practice_session.version = previous_session_version
                practice_session.updated_at = previous_session_updated_at
                raise

            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return PracticeEvaluationWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_card=chain.card,
                main_answer=chain.main_answer,
                follow_up_generation_run=chain.follow_up_generation_run,
                follow_up_decision=chain.follow_up_decision,
                follow_up_question=pending_question,
                follow_up_exchanges=chain.follow_up_exchanges,
                follow_up_completion_reason=(
                    PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
                ),
                evaluation_generation_run=evaluation_generation_run,
                evaluation=None,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def refresh_follow_up_generation(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
    ) -> PracticePrimaryAnswerWorkflowContext:
        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            if practice_session.status != "active":
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )
            attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if attempt is None:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            if practice_session.version == expected_version + 1:
                try:
                    context = await self._load_follow_up_replay_context(
                        practice_session,
                        attempt,
                    )
                except PracticeSessionStateError:
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    ) from None
                await self.session.commit()
                return context

            if practice_session.version != expected_version:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )
            if attempt.status != PracticeAttemptStatus.ANSWERING.value:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                )

            chain = await self._load_follow_up_chain(
                practice_session,
                attempt,
                for_update=True,
            )
            follow_up_run = chain.follow_up_generation_run
            if follow_up_run.status in (
                AgentRunStatus.QUEUED,
                AgentRunStatus.RUNNING,
            ):
                await self.session.commit()
                return self._primary_context_from_chain(
                    practice_session,
                    attempt,
                    chain,
                )

            if follow_up_run.status == AgentRunStatus.FAILED:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_FAILED,
                    source_code=follow_up_run.error_code,
                )
            if follow_up_run.status != AgentRunStatus.SUCCEEDED:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )

            decision = chain.follow_up_decision
            question = chain.follow_up_question
            if decision is None:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            now = self.clock()
            _require_aware_datetime(now)
            if (
                decision.action == "askFollowUp"
                and question is not None
                and chain.completion_reason is None
            ):
                attempt.status = PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
                attempt.updated_at = now
                practice_session.version += 1
                practice_session.updated_at = now
                await self.session.commit()
                return self._primary_context_from_chain(
                    practice_session,
                    attempt,
                    chain,
                )
            if (
                decision.action != "complete"
                and chain.completion_reason
                != PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
            ):
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            if chain.completion_reason is None:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )

            previous_attempt_status = attempt.status
            previous_attempt_updated_at = attempt.updated_at
            attempt.status = PracticeAttemptStatus.EVALUATING.value
            attempt.updated_at = now
            try:
                await self.session.flush()
                evaluation_generation_run = (
                    await self._enqueue_evaluation_generation(
                        user_id=user_id,
                        practice_session=practice_session,
                        attempt=attempt,
                        question_card=chain.card,
                        main_answer=chain.main_answer,
                        complete_decision=decision,
                        follow_up_completion_reason=chain.completion_reason,
                        follow_up_exchanges=chain.follow_up_exchanges,
                    )
                )
            except BaseException:
                attempt.status = previous_attempt_status
                attempt.updated_at = previous_attempt_updated_at
                raise

            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return PracticeEvaluationWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_card=chain.card,
                main_answer=chain.main_answer,
                follow_up_generation_run=follow_up_run,
                follow_up_decision=decision,
                follow_up_question=None,
                follow_up_exchanges=chain.follow_up_exchanges,
                follow_up_completion_reason=chain.completion_reason,
                evaluation_generation_run=evaluation_generation_run,
                evaluation=None,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def refresh_evaluation_generation(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
    ) -> PracticePublicWorkflowContext:
        """Poll and reconcile the durable evaluation pipeline.

        Evaluation, review, and recommendation generation all belong to the
        same public ``evaluating`` state.  Only the final recommendation
        artifact changes the attempt to ``review`` and advances the session
        version.
        """

        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            if practice_session.status != "active":
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if attempt is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            # A client may retry a lost response from the final transition.
            # The complete lineage is required before replaying that response.
            if (
                practice_session.version == expected_version + 1
                and attempt.status == PracticeAttemptStatus.REVIEW.value
            ):
                try:
                    context = await self._load_review_replay_context(
                        practice_session,
                        attempt,
                    )
                except PracticeSessionStateError:
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    ) from None
                await self.session.commit()
                return context

            if practice_session.version != expected_version:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )
            if attempt.status != PracticeAttemptStatus.EVALUATING.value:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            chain = await self._load_follow_up_chain(
                practice_session,
                attempt,
                for_update=True,
            )
            if chain.follow_up_generation_run.status != AgentRunStatus.SUCCEEDED:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            if chain.follow_up_decision is None:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )

            evaluation_run = await self._load_stable_evaluation_run(
                user_id=practice_session.user_id,
                attempt_id=attempt.id,
                for_update=True,
            )
            follow_up_completion_reason, unanswered_question = (
                self._resolve_evaluation_follow_up_snapshot(
                    evaluation_run=evaluation_run,
                    practice_session=practice_session,
                    attempt=attempt,
                    chain=chain,
                )
            )
            evaluation_context = dict(
                session=practice_session,
                attempt=attempt,
                question_card=chain.card,
                main_answer=chain.main_answer,
                follow_up_generation_run=chain.follow_up_generation_run,
                follow_up_decision=chain.follow_up_decision,
                follow_up_question=unanswered_question,
                follow_up_exchanges=chain.follow_up_exchanges,
                follow_up_completion_reason=follow_up_completion_reason,
                evaluation_generation_run=evaluation_run,
                evaluation=None,
            )

            if evaluation_run.status in {
                AgentRunStatus.QUEUED,
                AgentRunStatus.RUNNING,
            }:
                await self.session.commit()
                return PracticeEvaluationWorkflowContext(**evaluation_context)
            if evaluation_run.status == AgentRunStatus.FAILED:
                raise PracticeSessionStateError(
                    PRACTICE_EVALUATION_GENERATION_FAILED,
                    source_code=evaluation_run.error_code,
                )
            if evaluation_run.status != AgentRunStatus.SUCCEEDED:
                raise PracticeSessionStateError(
                    PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
                )

            evaluation = await self._load_evaluation_artifact(
                evaluation_run,
                attempt=attempt,
                question_card=chain.card,
                for_update=True,
            )
            if evaluation is None:
                raise PracticeSessionStateError(
                    PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
                )
            evaluation_context["evaluation"] = evaluation

            review_run = await self._load_stable_review_run(
                user_id=practice_session.user_id,
                attempt_id=attempt.id,
                for_update=True,
                required=False,
            )
            if review_run is None:
                review_run = await self._enqueue_review_generation(
                    user_id=user_id,
                    practice_session=practice_session,
                    attempt=attempt,
                    evaluation=evaluation,
                )
                self._validate_review_run_lineage(
                    review_run,
                    practice_session=practice_session,
                    attempt=attempt,
                    evaluation=evaluation,
                )
                evaluation_context["review_generation_run"] = review_run
                await self.session.commit()
                return PracticeEvaluationWorkflowContext(**evaluation_context)

            self._validate_review_run_lineage(
                review_run,
                practice_session=practice_session,
                attempt=attempt,
                evaluation=evaluation,
            )
            evaluation_context["review_generation_run"] = review_run
            if review_run.status in {
                AgentRunStatus.QUEUED,
                AgentRunStatus.RUNNING,
            }:
                await self.session.commit()
                return PracticeEvaluationWorkflowContext(**evaluation_context)
            if review_run.status == AgentRunStatus.FAILED:
                raise PracticeSessionStateError(
                    PRACTICE_REVIEW_GENERATION_FAILED,
                    source_code=review_run.error_code,
                )
            if review_run.status != AgentRunStatus.SUCCEEDED:
                raise PracticeSessionStateError(
                    PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
                )

            review = await self._load_review_artifact(
                review_run,
                attempt=attempt,
                evaluation=evaluation,
                for_update=True,
            )
            if review is None:
                raise PracticeSessionStateError(
                    PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
                )
            evaluation_context["review"] = review

            recommendation_run = await self._load_stable_recommendation_run(
                user_id=practice_session.user_id,
                attempt_id=attempt.id,
                for_update=True,
                required=False,
            )
            if recommendation_run is None:
                recommendation_run = await self._enqueue_recommendation_generation(
                    user_id=user_id,
                    practice_session=practice_session,
                    attempt=attempt,
                    evaluation=evaluation,
                    review=review,
                )
                self._validate_recommendation_run_lineage(
                    recommendation_run,
                    practice_session=practice_session,
                    attempt=attempt,
                    evaluation=evaluation,
                    review=review,
                )
                evaluation_context["recommendation_generation_run"] = (
                    recommendation_run
                )
                await self.session.commit()
                return PracticeEvaluationWorkflowContext(**evaluation_context)

            self._validate_recommendation_run_lineage(
                recommendation_run,
                practice_session=practice_session,
                attempt=attempt,
                evaluation=evaluation,
                review=review,
            )
            evaluation_context["recommendation_generation_run"] = recommendation_run
            if recommendation_run.status in {
                AgentRunStatus.QUEUED,
                AgentRunStatus.RUNNING,
            }:
                await self.session.commit()
                return PracticeEvaluationWorkflowContext(**evaluation_context)
            if recommendation_run.status == AgentRunStatus.FAILED:
                raise PracticeSessionStateError(
                    PRACTICE_RECOMMENDATION_GENERATION_FAILED,
                    source_code=recommendation_run.error_code,
                )
            if recommendation_run.status != AgentRunStatus.SUCCEEDED:
                raise PracticeSessionStateError(
                    PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
                )

            recommendation = await self._load_recommendation_artifact(
                recommendation_run,
                practice_session=practice_session,
                attempt=attempt,
                question_card=chain.card,
                evaluation=evaluation,
                review=review,
                follow_up_completion_reason=follow_up_completion_reason,
                for_update=True,
            )
            if recommendation is None:
                raise PracticeSessionStateError(
                    PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
                )

            evaluation_context["recommendation"] = recommendation
            reference_answers_ready = await self._ensure_review_reference_answers(
                user_id=user_id,
                question_card=chain.card,
                main_answer=chain.main_answer,
                follow_up_exchanges=chain.follow_up_exchanges,
                follow_up_completion_reason=follow_up_completion_reason,
                unanswered_follow_up_question=unanswered_question,
                evaluation_generation_run=evaluation_run,
            )
            if not reference_answers_ready:
                await self.session.commit()
                return PracticeEvaluationWorkflowContext(**evaluation_context)

            now = self.clock()
            _require_aware_datetime(now)
            attempt.status = PracticeAttemptStatus.REVIEW.value
            attempt.updated_at = now
            attempt.completed_at = now
            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return PracticeReviewWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_card=chain.card,
                main_answer=chain.main_answer,
                follow_up_generation_run=chain.follow_up_generation_run,
                follow_up_decision=chain.follow_up_decision,
                follow_up_question=unanswered_question,
                follow_up_exchanges=chain.follow_up_exchanges,
                follow_up_completion_reason=follow_up_completion_reason,
                evaluation_generation_run=evaluation_run,
                evaluation=evaluation,
                review_generation_run=review_run,
                review=review,
                recommendation_generation_run=recommendation_run,
                recommendation=recommendation,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def refresh_question_generation(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
    ) -> PracticeSessionWorkflowContext:
        try:
            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            if practice_session.status != "active":
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if practice_session.version == expected_version + 1:
                try:
                    context = await self._load_completed_generation_replay_context(
                        practice_session
                    )
                except PracticeSessionStateError:
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    ) from None
                await self.session.commit()
                return context
            if practice_session.version != expected_version:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if attempt is None or (
                attempt.status != PracticeAttemptStatus.GENERATING_QUESTION.value
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            run, _ = await self._load_generation_run(
                practice_session,
                attempt,
            )

            if run.status in (
                AgentRunStatus.QUEUED,
                AgentRunStatus.RUNNING,
            ):
                if attempt.question_card_id is not None:
                    raise PracticeSessionStateError(
                        PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
                    )
                await self.session.commit()
                return PracticeSessionWorkflowContext(
                    session=practice_session,
                    attempt=attempt,
                    question_generation_run=run,
                    question_card=None,
                )

            if run.status == AgentRunStatus.FAILED:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_FAILED,
                    source_code=run.error_code,
                )

            if run.status != AgentRunStatus.SUCCEEDED:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
                )

            card = await self._load_card_for_run(
                practice_session,
                attempt,
                run,
            )
            if (
                attempt.question_card_id is not None
                and attempt.question_card_id != card.id
            ):
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
                )

            now = self.clock()
            _require_aware_datetime(now)
            attempt.question_card_id = card.id
            attempt.question_card = card
            attempt.status = PracticeAttemptStatus.ANSWERING.value
            attempt.updated_at = now
            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return PracticeSessionWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_generation_run=run,
                question_card=card,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def get_session_context(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
    ) -> (
        PracticePublicWorkflowContext
        | PracticeCompletedSessionWorkflowContext
        | PracticeEndedEarlySessionWorkflowContext
    ):
        try:
            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=False,
            )
            if practice_session.status == PracticeSessionStatus.COMPLETED.value:
                if (
                    practice_session.completion_reason
                    == PracticeSessionCompletionReason.REVIEW_COMPLETED.value
                ):
                    return await self._load_completed_session_context(
                        practice_session,
                        for_update=False,
                    )
                if (
                    practice_session.completion_reason
                    == PracticeSessionCompletionReason.USER_ENDED_EARLY.value
                ):
                    current_attempt = await self._load_current_attempt(
                        user_id=user_id,
                        session_id=practice_session.id,
                        for_update=False,
                    )
                    if current_attempt is None:
                        raise PracticeSessionStateError(
                            PRACTICE_SESSION_STATE_CONFLICT
                        )
                    return await self._load_ended_early_replay_context(
                        practice_session=practice_session,
                        attempt=current_attempt,
                        question_id=None,
                        for_update=False,
                    )
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if practice_session.status != PracticeSessionStatus.ACTIVE.value:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            return await self._load_public_active_context(
                practice_session,
                for_update=False,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def get_completed_session_context(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
    ) -> (
        PracticeCompletedSessionWorkflowContext
        | PracticeEndedEarlySessionWorkflowContext
    ):
        try:
            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=False,
            )
            if practice_session.status != PracticeSessionStatus.COMPLETED.value:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if (
                practice_session.completion_reason
                == PracticeSessionCompletionReason.REVIEW_COMPLETED.value
            ):
                return await self._load_completed_session_context(
                    practice_session,
                    for_update=False,
                )
            if (
                practice_session.completion_reason
                == PracticeSessionCompletionReason.USER_ENDED_EARLY.value
            ):
                current_attempt = await self._load_current_attempt(
                    user_id=user_id,
                    session_id=practice_session.id,
                    for_update=False,
                )
                if current_attempt is None:
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_STATE_CONFLICT
                    )
                return await self._load_ended_early_replay_context(
                    practice_session=practice_session,
                    attempt=current_attempt,
                    question_id=None,
                    for_update=False,
                )
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        except BaseException:
            await self.session.rollback()
            raise

    async def _load_completed_session_context(
        self,
        practice_session: PracticeSession,
        *,
        for_update: bool,
        prevalidated_context: PracticeReviewWorkflowContext | None = None,
    ) -> PracticeCompletedSessionWorkflowContext:
        try:
            return await self._load_completed_session_context_unchecked(
                practice_session,
                for_update=for_update,
                prevalidated_context=prevalidated_context,
            )
        except PracticeSessionStateError:
            raise
        except (AttributeError, TypeError, ValueError, ValidationError):
            raise PracticeSessionStateError(
                PRACTICE_SESSION_STATE_CONFLICT
            ) from None

    async def _load_completed_session_context_unchecked(
        self,
        practice_session: PracticeSession,
        *,
        for_update: bool,
        prevalidated_context: PracticeReviewWorkflowContext | None = None,
    ) -> PracticeCompletedSessionWorkflowContext:
        if (
            practice_session.status != PracticeSessionStatus.COMPLETED.value
            or practice_session.completion_reason
            != PracticeSessionCompletionReason.REVIEW_COMPLETED.value
            or practice_session.completed_at is None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        _require_aware_datetime(practice_session.completed_at)

        statement = (
            select(PracticeAttempt)
            .where(
                PracticeAttempt.user_id == practice_session.user_id,
                PracticeAttempt.session_id == practice_session.id,
            )
            .order_by(PracticeAttempt.attempt_number.asc())
        )
        if for_update:
            statement = statement.with_for_update()
        attempts = sorted(
            (await self.session.scalars(statement)).all(),
            key=lambda attempt: attempt.attempt_number,
        )
        if [attempt.attempt_number for attempt in attempts] != list(
            range(1, len(attempts) + 1)
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        review_contexts: list[PracticeReviewWorkflowContext] = []
        for attempt in attempts:
            if (
                attempt.user_id != practice_session.user_id
                or attempt.session_id != practice_session.id
                or attempt.status != PracticeAttemptStatus.COMPLETED.value
                or attempt.completed_at is None
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            _require_aware_datetime(attempt.completed_at)
            if (
                prevalidated_context is not None
                and attempt.id == prevalidated_context.attempt.id
            ):
                review_context = prevalidated_context
            else:
                review_context = await self._load_review_replay_context(
                    practice_session,
                    attempt,
                    allow_completed=True,
                    allow_completed_session=True,
                    for_update=for_update,
                )
            review_contexts.append(review_context)

        if not review_contexts:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        final_review_context = review_contexts[-1]
        return PracticeCompletedSessionWorkflowContext(
            session=practice_session,
            final_attempt=final_review_context.attempt,
            final_review_context=final_review_context,
            attempt_review_contexts=tuple(review_contexts),
        )

    async def get_active_session_context(
        self,
        *,
        user_id: UUID,
    ) -> PracticePublicWorkflowContext | None:
        try:
            practice_session = await self._load_active_session(
                user_id,
                for_update=False,
            )
            if practice_session is None:
                return None
            return await self._load_public_active_context(
                practice_session,
                for_update=False,
            )
        except BaseException:
            await self.session.rollback()
            raise

    async def _load_primary_answer_replay_context(
        self,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        question_id: UUID,
        normalized_content: str,
    ) -> PracticePrimaryAnswerWorkflowContext:
        if (
            attempt.status != PracticeAttemptStatus.ANSWERING.value
            or attempt.question_card_id != question_id
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        question_generation_run, _ = await self._load_generation_run(
            practice_session,
            attempt,
            for_update=True,
        )
        if question_generation_run.status != AgentRunStatus.SUCCEEDED:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        card = await self._load_card_by_id(
            practice_session,
            attempt,
            question_generation_run,
            for_update=True,
        )
        main_answer = await self._load_main_answer(attempt, for_update=True)
        if main_answer is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if _normalize_answer_content(main_answer.content) != normalized_content:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        follow_up_run = await self._load_stable_follow_up_run(
            user_id=practice_session.user_id,
            attempt_id=attempt.id,
            order=1,
            for_update=True,
        )
        self._validate_follow_up_run_lineage(
            follow_up_run,
            practice_session=practice_session,
            attempt=attempt,
            question_card=card,
            main_answer=main_answer,
        )
        return PracticePrimaryAnswerWorkflowContext(
            session=practice_session,
            attempt=attempt,
            question_card=card,
            main_answer=main_answer,
            follow_up_generation_run=follow_up_run,
            follow_up_decision=None,
            follow_up_question=None,
        )

    async def _load_follow_up_replay_context(
        self,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
    ) -> PracticePrimaryAnswerWorkflowContext:
        if attempt.status not in {
            PracticeAttemptStatus.ANSWERING.value,
            PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value,
            PracticeAttemptStatus.EVALUATING.value,
        }:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        chain = await self._load_follow_up_chain(
            practice_session,
            attempt,
            for_update=True,
        )
        if attempt.status == PracticeAttemptStatus.ANSWERING.value:
            return self._primary_context_from_chain(
                practice_session,
                attempt,
                chain,
            )
        if chain.follow_up_generation_run.status != AgentRunStatus.SUCCEEDED:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        if attempt.status == PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value:
            if (
                chain.follow_up_decision is None
                or chain.follow_up_decision.action != "askFollowUp"
                or chain.follow_up_question is None
                or chain.completion_reason is not None
            ):
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            return self._primary_context_from_chain(
                practice_session,
                attempt,
                chain,
            )
        if (
            chain.completion_reason is None
            or chain.follow_up_decision is None
            or chain.follow_up_question is not None
        ):
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        if attempt.status == PracticeAttemptStatus.EVALUATING.value:
            evaluation_generation_run = await self._load_stable_evaluation_run(
                user_id=practice_session.user_id,
                attempt_id=attempt.id,
                for_update=True,
            )
            self._validate_evaluation_run_lineage(
                evaluation_generation_run,
                practice_session=practice_session,
                attempt=attempt,
                question_card=chain.card,
                main_answer=chain.main_answer,
                complete_decision=chain.follow_up_decision,
                follow_up_completion_reason=chain.completion_reason,
                follow_up_exchanges=chain.follow_up_exchanges,
            )
            evaluation = await self._load_evaluation_artifact(
                evaluation_generation_run,
                attempt=attempt,
                question_card=chain.card,
                for_update=True,
            )
            return PracticeEvaluationWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_card=chain.card,
                main_answer=chain.main_answer,
                follow_up_generation_run=chain.follow_up_generation_run,
                follow_up_decision=chain.follow_up_decision,
                follow_up_question=None,
                follow_up_exchanges=chain.follow_up_exchanges,
                follow_up_completion_reason=chain.completion_reason,
                evaluation_generation_run=evaluation_generation_run,
                evaluation=evaluation,
            )
        raise PracticeSessionStateError(
            PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
        )

    async def _load_ended_follow_up_replay_context(
        self,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        question_id: UUID,
        follow_up_question_id: UUID,
    ) -> PracticeEvaluationWorkflowContext:
        if (
            practice_session.status != PracticeSessionStatus.ACTIVE.value
            or practice_session.completed_at is not None
            or practice_session.completion_reason is not None
            or attempt.status != PracticeAttemptStatus.EVALUATING.value
            or attempt.question_card_id != question_id
            or attempt.completed_at is not None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        chain = await self._load_follow_up_chain(
            practice_session,
            attempt,
            for_update=True,
        )
        pending_question = chain.follow_up_question
        if (
            chain.follow_up_generation_run.status != AgentRunStatus.SUCCEEDED
            or chain.follow_up_decision is None
            or chain.follow_up_decision.action != "askFollowUp"
            or pending_question is None
            or pending_question.id != follow_up_question_id
            or chain.completion_reason is not None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        evaluation_generation_run = await self._load_stable_evaluation_run(
            user_id=practice_session.user_id,
            attempt_id=attempt.id,
            for_update=True,
        )
        self._validate_evaluation_run_lineage(
            evaluation_generation_run,
            practice_session=practice_session,
            attempt=attempt,
            question_card=chain.card,
            main_answer=chain.main_answer,
            complete_decision=chain.follow_up_decision,
            follow_up_completion_reason=(
                PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
            ),
            follow_up_exchanges=chain.follow_up_exchanges,
            unanswered_follow_up_question=pending_question,
        )
        evaluation = await self._load_evaluation_artifact(
            evaluation_generation_run,
            attempt=attempt,
            question_card=chain.card,
            for_update=True,
        )
        return PracticeEvaluationWorkflowContext(
            session=practice_session,
            attempt=attempt,
            question_card=chain.card,
            main_answer=chain.main_answer,
            follow_up_generation_run=chain.follow_up_generation_run,
            follow_up_decision=chain.follow_up_decision,
            follow_up_question=pending_question,
            follow_up_exchanges=chain.follow_up_exchanges,
            follow_up_completion_reason=(
                PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
            ),
            evaluation_generation_run=evaluation_generation_run,
            evaluation=evaluation,
        )

    @staticmethod
    def _primary_context_from_chain(
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        chain: _PracticeFollowUpChain,
    ) -> PracticePrimaryAnswerWorkflowContext:
        return PracticePrimaryAnswerWorkflowContext(
            session=practice_session,
            attempt=attempt,
            question_card=chain.card,
            main_answer=chain.main_answer,
            follow_up_generation_run=chain.follow_up_generation_run,
            follow_up_decision=chain.follow_up_decision,
            follow_up_question=chain.follow_up_question,
            follow_up_exchanges=chain.follow_up_exchanges,
            follow_up_completion_reason=chain.completion_reason,
        )

    async def _load_follow_up_answer_replay_context(
        self,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        question_id: UUID,
        follow_up_question_id: UUID,
        normalized_content: str,
    ) -> PracticePrimaryAnswerWorkflowContext:
        if attempt.question_card_id != question_id:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        chain = await self._load_follow_up_chain(
            practice_session,
            attempt,
            for_update=True,
        )
        if not chain.follow_up_exchanges:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        last_exchange = chain.follow_up_exchanges[-1]
        if (
            last_exchange.question.id != follow_up_question_id
            or _normalize_answer_content(last_exchange.answer.content)
            != normalized_content
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if attempt.status == PracticeAttemptStatus.ANSWERING.value:
            return self._primary_context_from_chain(
                practice_session,
                attempt,
                chain,
            )
        if attempt.status != PracticeAttemptStatus.EVALUATING.value:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if (
            chain.completion_reason is None
            or chain.follow_up_decision is None
        ):
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        evaluation_generation_run = await self._load_stable_evaluation_run(
            user_id=practice_session.user_id,
            attempt_id=attempt.id,
            for_update=True,
        )
        self._validate_evaluation_run_lineage(
            evaluation_generation_run,
            practice_session=practice_session,
            attempt=attempt,
            question_card=chain.card,
            main_answer=chain.main_answer,
            complete_decision=chain.follow_up_decision,
            follow_up_completion_reason=chain.completion_reason,
            follow_up_exchanges=chain.follow_up_exchanges,
        )
        evaluation = await self._load_evaluation_artifact(
            evaluation_generation_run,
            attempt=attempt,
            question_card=chain.card,
            for_update=True,
        )
        return PracticeEvaluationWorkflowContext(
            session=practice_session,
            attempt=attempt,
            question_card=chain.card,
            main_answer=chain.main_answer,
            follow_up_generation_run=chain.follow_up_generation_run,
            follow_up_decision=chain.follow_up_decision,
            follow_up_question=None,
            follow_up_exchanges=chain.follow_up_exchanges,
            follow_up_completion_reason=chain.completion_reason,
            evaluation_generation_run=evaluation_generation_run,
            evaluation=evaluation,
        )

    async def _load_continue_next_question_replay_context(
        self,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        question_id: UUID,
    ) -> PracticeSessionWorkflowContext:
        if (
            attempt.status != PracticeAttemptStatus.GENERATING_QUESTION.value
            or attempt.attempt_number <= 1
            or attempt.retry_of_attempt_id is not None
            or attempt.question_card_id is not None
            or attempt.question_generation_run_id is None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        previous_attempt = await self._load_attempt_by_number(
            user_id=practice_session.user_id,
            session_id=practice_session.id,
            attempt_number=attempt.attempt_number - 1,
            for_update=True,
        )
        if (
            previous_attempt is None
            or previous_attempt.user_id != practice_session.user_id
            or previous_attempt.session_id != practice_session.id
            or previous_attempt.status != PracticeAttemptStatus.COMPLETED.value
            or previous_attempt.question_card_id != question_id
            or previous_attempt.completed_at is None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        review_context = await self._load_review_replay_context(
            practice_session,
            previous_attempt,
            allow_completed=True,
        )
        recommendation = review_context.recommendation
        if recommendation is None:
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
            )
        next_question_type, next_difficulty = self._next_question_selection(
            previous_attempt,
            recommendation,
        )
        if (
            attempt.user_id != practice_session.user_id
            or attempt.session_id != practice_session.id
            or attempt.attempt_number != previous_attempt.attempt_number + 1
            or attempt.question_type != next_question_type.value
            or attempt.difficulty != next_difficulty.value
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        question_generation_run, _ = await self._load_generation_run(
            practice_session,
            attempt,
            for_update=True,
        )
        self._validate_question_generation_run_lineage(
            question_generation_run,
            practice_session=practice_session,
            attempt=attempt,
            idempotency_key=practice_question_generation_idempotency_key(
                practice_session.id,
                attempt.id,
            ),
        )
        return PracticeSessionWorkflowContext(
            session=practice_session,
            attempt=attempt,
            question_generation_run=question_generation_run,
            question_card=None,
        )

    async def _load_retry_current_question_replay_context(
        self,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        question_id: UUID,
    ) -> PracticeSessionWorkflowContext:
        if (
            attempt.status != PracticeAttemptStatus.ANSWERING.value
            or attempt.attempt_number <= 1
            or attempt.retry_of_attempt_id is None
            or attempt.question_generation_run_id is not None
            or attempt.question_card_id != question_id
            or attempt.completed_at is not None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        previous_attempt = await self._load_attempt_by_id(
            user_id=practice_session.user_id,
            session_id=practice_session.id,
            attempt_id=attempt.retry_of_attempt_id,
            for_update=True,
        )
        if previous_attempt is None or previous_attempt.completed_at is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if (
            previous_attempt.status != PracticeAttemptStatus.COMPLETED.value
            or previous_attempt.question_card_id != question_id
            or previous_attempt.question_type != attempt.question_type
            or previous_attempt.difficulty != attempt.difficulty
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        # The parent must still be a complete, canonical review snapshot.  In
        # particular, this prevents a malformed retry from being replayed just
        # because its row happens to have the expected status and version.
        await self._load_review_replay_context(
            practice_session,
            previous_attempt,
            allow_completed=True,
        )
        source = await self._load_question_source(
            practice_session,
            attempt,
            for_update=True,
            require_succeeded=True,
        )
        await self._ensure_attempt_has_no_response_artifacts(
            practice_session,
            attempt,
        )
        return PracticeSessionWorkflowContext(
            session=practice_session,
            attempt=attempt,
            question_generation_run=source.generation_run,
            question_card=source.question_card,
        )

    async def end_session_early(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
    ) -> PracticeEndedEarlySessionWorkflowContext:
        """Complete an active session before its current question is answered."""

        practice_session: PracticeSession | None = None
        current_attempt: PracticeAttempt | None = None
        previous_attempt_status: str | None = None
        previous_attempt_updated_at: datetime | None = None
        previous_attempt_completed_at: datetime | None = None
        previous_session_status: str | None = None
        previous_session_version: int | None = None
        previous_session_updated_at: datetime | None = None
        previous_session_completed_at: datetime | None = None
        previous_session_completion_reason: str | None = None
        try:
            if not _valid_expected_version(expected_version):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )

            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=True,
            )
            current_attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=True,
            )
            if current_attempt is None or (
                current_attempt.user_id != user_id
                or current_attempt.session_id != practice_session.id
            ):
                if practice_session.version == expected_version + 1:
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    )
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            if practice_session.version == expected_version + 1:
                try:
                    context = await self._load_ended_early_replay_context(
                        practice_session=practice_session,
                        attempt=current_attempt,
                        question_id=question_id,
                        for_update=True,
                    )
                except (
                    AttributeError,
                    PracticeSessionStateError,
                    TypeError,
                    ValueError,
                    ValidationError,
                ):
                    raise PracticeSessionStateError(
                        PRACTICE_SESSION_VERSION_CONFLICT
                    ) from None
                await self.session.commit()
                return context

            if practice_session.version != expected_version:
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_VERSION_CONFLICT
                )
            if (
                practice_session.status != PracticeSessionStatus.ACTIVE.value
                or practice_session.completed_at is not None
                or practice_session.completion_reason is not None
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            attempts = await self._load_session_attempts(
                practice_session,
                for_update=True,
            )
            if (
                not attempts
                or attempts[-1].id != current_attempt.id
                or current_attempt.status
                != PracticeAttemptStatus.ANSWERING.value
                or current_attempt.question_card_id != question_id
                or current_attempt.completed_at is not None
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            completed_review_contexts = (
                await self._load_early_end_previous_review_contexts(
                    practice_session,
                    attempts,
                )
            )
            question_context = await self._load_early_end_question_context(
                practice_session=practice_session,
                attempt=current_attempt,
                question_id=question_id,
            )

            now = self.clock()
            _require_aware_datetime(now)
            previous_attempt_status = current_attempt.status
            previous_attempt_updated_at = current_attempt.updated_at
            previous_attempt_completed_at = current_attempt.completed_at
            previous_session_status = practice_session.status
            previous_session_version = practice_session.version
            previous_session_updated_at = practice_session.updated_at
            previous_session_completed_at = practice_session.completed_at
            previous_session_completion_reason = practice_session.completion_reason

            current_attempt.status = PracticeAttemptStatus.ENDED_EARLY.value
            current_attempt.updated_at = now
            current_attempt.completed_at = now
            practice_session.status = PracticeSessionStatus.COMPLETED.value
            practice_session.completion_reason = (
                PracticeSessionCompletionReason.USER_ENDED_EARLY.value
            )
            practice_session.completed_at = now
            practice_session.version += 1
            practice_session.updated_at = now
            await self.session.commit()
            return PracticeEndedEarlySessionWorkflowContext(
                session=practice_session,
                unfinished_attempt=current_attempt,
                question_context=question_context,
                completed_attempt_review_contexts=tuple(
                    completed_review_contexts
                ),
            )
        except BaseException:
            if current_attempt is not None and previous_attempt_status is not None:
                current_attempt.status = previous_attempt_status
                current_attempt.updated_at = previous_attempt_updated_at
                current_attempt.completed_at = previous_attempt_completed_at
            if practice_session is not None and previous_session_version is not None:
                if previous_session_status is not None:
                    practice_session.status = previous_session_status
                practice_session.version = previous_session_version
                if previous_session_updated_at is not None:
                    practice_session.updated_at = previous_session_updated_at
                practice_session.completed_at = previous_session_completed_at
                practice_session.completion_reason = (
                    previous_session_completion_reason
                )
            await self.session.rollback()
            raise

    async def _load_ended_early_replay_context(
        self,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        question_id: UUID | None,
        for_update: bool,
    ) -> PracticeEndedEarlySessionWorkflowContext:
        if (
            practice_session.status
            != PracticeSessionStatus.COMPLETED.value
            or practice_session.completion_reason
            != PracticeSessionCompletionReason.USER_ENDED_EARLY.value
            or practice_session.completed_at is None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        _require_aware_datetime(practice_session.completed_at)

        attempts = await self._load_session_attempts(
            practice_session,
            for_update=for_update,
        )
        if not attempts or attempts[-1].id != attempt.id:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        expected_question_id = question_id or attempt.question_card_id
        if expected_question_id is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if (
            attempt.status != PracticeAttemptStatus.ENDED_EARLY.value
            or attempt.question_card_id != expected_question_id
            or attempt.completed_at is None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        _require_aware_datetime(attempt.completed_at)

        completed_review_contexts = (
            await self._load_early_end_previous_review_contexts(
                practice_session,
                attempts,
                allow_user_ended_early_session=True,
                for_update=for_update,
            )
        )
        question_context = await self._load_early_end_question_context(
            practice_session=practice_session,
            attempt=attempt,
            question_id=expected_question_id,
            for_update=for_update,
        )
        return PracticeEndedEarlySessionWorkflowContext(
            session=practice_session,
            unfinished_attempt=attempt,
            question_context=question_context,
            completed_attempt_review_contexts=tuple(completed_review_contexts),
        )

    async def _load_early_end_previous_review_contexts(
        self,
        practice_session: PracticeSession,
        attempts: list[PracticeAttempt],
        *,
        allow_user_ended_early_session: bool = False,
        for_update: bool = True,
    ) -> list[PracticeReviewWorkflowContext]:
        if [attempt.attempt_number for attempt in attempts] != list(
            range(1, len(attempts) + 1)
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        contexts: list[PracticeReviewWorkflowContext] = []
        for attempt in attempts[:-1]:
            if (
                attempt.user_id != practice_session.user_id
                or attempt.session_id != practice_session.id
                or attempt.status != PracticeAttemptStatus.COMPLETED.value
                or attempt.completed_at is None
            ):
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            _require_aware_datetime(attempt.completed_at)
            contexts.append(
                await self._load_review_replay_context(
                    practice_session,
                    attempt,
                    allow_completed=True,
                    allow_completed_session=allow_user_ended_early_session,
                    allow_user_ended_early_session=allow_user_ended_early_session,
                    for_update=for_update,
                )
            )
        return contexts

    async def _load_early_end_question_context(
        self,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        question_id: UUID,
        for_update: bool = True,
    ) -> PracticeSessionWorkflowContext:
        if (
            attempt.user_id != practice_session.user_id
            or attempt.session_id != practice_session.id
            or attempt.question_card_id != question_id
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        source = await self._load_question_source(
            practice_session,
            attempt,
            for_update=for_update,
            require_succeeded=True,
        )
        if source.question_card.id != question_id:
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
            )
        if await self._load_main_answer(attempt, for_update=for_update) is not None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        await self._ensure_attempt_has_no_response_artifacts(
            practice_session,
            attempt,
            for_update=for_update,
        )
        return PracticeSessionWorkflowContext(
            session=practice_session,
            attempt=attempt,
            question_generation_run=source.generation_run,
            question_card=source.question_card,
        )

    async def _load_session_attempts(
        self,
        practice_session: PracticeSession,
        *,
        for_update: bool,
    ) -> list[PracticeAttempt]:
        statement = (
            select(PracticeAttempt)
            .where(
                PracticeAttempt.user_id == practice_session.user_id,
                PracticeAttempt.session_id == practice_session.id,
            )
            .order_by(PracticeAttempt.attempt_number.asc())
        )
        if for_update:
            statement = statement.with_for_update()
        return sorted(
            (await self.session.scalars(statement)).all(),
            key=lambda attempt: attempt.attempt_number,
        )

    async def _ensure_attempt_has_no_response_artifacts(
        self,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        *,
        for_update: bool = True,
    ) -> None:
        questions, answers, decisions = await self._load_follow_up_rows(
            attempt,
            for_update=for_update,
        )
        if questions or answers or decisions:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        for artifact_model in (
            PracticeEvaluation,
            PracticeReview,
            PracticeRecommendation,
        ):
            statement = select(artifact_model.id).where(
                artifact_model.attempt_id == attempt.id
            )
            if for_update:
                statement = statement.with_for_update()
            if await self.session.scalar(statement) is not None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        for agent_id, idempotency_key in (
            (
                "follow-up-generator",
                practice_follow_up_idempotency_key(attempt.id, 1),
            ),
            (
                "practice-evaluator",
                practice_evaluation_idempotency_key(attempt.id),
            ),
            (
                "practice-reviewer",
                practice_review_idempotency_key(attempt.id),
            ),
            (
                "practice-recommender",
                practice_recommendation_idempotency_key(attempt.id),
            ),
        ):
            statement = (
                select(AgentRun.id)
                .where(
                    AgentRun.user_id == practice_session.user_id,
                    AgentRun.agent_id == agent_id,
                    or_(
                        AgentRun.idempotency_key == idempotency_key,
                        AgentRun.payload["attemptId"].as_string()
                        == str(attempt.id),
                    ),
                )
            )
            if for_update:
                statement = statement.with_for_update()
            if await self.session.scalar(statement) is not None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

    async def _load_follow_up_chain(
        self,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        *,
        for_update: bool = True,
        primary_records: tuple[QuestionCard, PracticeAnswer, AgentRun] | None = None,
        allow_unmaterialized_success: bool = False,
    ) -> _PracticeFollowUpChain:
        if primary_records is None:
            card, main_answer, first_run, _ = (
                await self._load_primary_follow_up_records(
                    practice_session,
                    attempt,
                    for_update=for_update,
                )
            )
        else:
            card, main_answer, first_run = primary_records
            self._validate_follow_up_run_lineage(
                first_run,
                practice_session=practice_session,
                attempt=attempt,
                question_card=card,
                main_answer=main_answer,
            )
        questions, answers, decisions = await self._load_follow_up_rows(
            attempt,
            for_update=for_update,
        )
        follow_up_runs = await self._load_follow_up_runs(
            practice_session,
            attempt,
            for_update=for_update,
        )
        run_orders = self._validate_follow_up_runs(follow_up_runs)
        self._validate_follow_up_rows(
            attempt=attempt,
            main_answer=main_answer,
            questions=questions,
            answers=answers,
            decisions=decisions,
        )
        follow_up_answers = [
            answer
            for answer in answers
            if answer.kind == PracticeAnswerKind.FOLLOW_UP.value
        ]

        if first_run.status in {
            AgentRunStatus.QUEUED,
            AgentRunStatus.RUNNING,
            AgentRunStatus.FAILED,
        }:
            if questions or follow_up_answers or decisions or run_orders != {1}:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            return _PracticeFollowUpChain(
                card=card,
                main_answer=main_answer,
                follow_up_generation_run=first_run,
                follow_up_decision=None,
                follow_up_question=None,
                follow_up_exchanges=(),
                completion_reason=None,
            )
        if first_run.status != AgentRunStatus.SUCCEEDED:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )

        if (
            allow_unmaterialized_success
            and not questions
            and not follow_up_answers
            and not decisions
        ):
            return _PracticeFollowUpChain(
                card=card,
                main_answer=main_answer,
                follow_up_generation_run=first_run,
                follow_up_decision=None,
                follow_up_question=None,
                follow_up_exchanges=(),
                completion_reason=None,
            )

        first_decision, first_question = (
            await self._load_canonical_follow_up_artifact(
                first_run,
                attempt=attempt,
                expected_order=1,
                for_update=for_update,
            )
        )
        questions_by_order = {question.order: question for question in questions}
        answers_by_question = {
            answer.follow_up_question_id: answer
            for answer in answers
            if answer.kind == PracticeAnswerKind.FOLLOW_UP.value
        }
        decisions_by_order = {decision.order: decision for decision in decisions}

        if first_decision.action == "complete":
            if (
                first_question is not None
                or questions
                or follow_up_answers
                or len(decisions) != 1
                or run_orders != {1}
            ):
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            return _PracticeFollowUpChain(
                card=card,
                main_answer=main_answer,
                follow_up_generation_run=first_run,
                follow_up_decision=first_decision,
                follow_up_question=None,
                follow_up_exchanges=(),
                completion_reason=(
                    PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
                ),
            )
        if first_question is None or first_question.order != 1:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        if questions_by_order.get(1) is not first_question:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        first_answer = answers_by_question.get(first_question.id)
        if first_answer is None:
            if (
                questions_by_order.get(2) is not None
                or len(decisions) != 1
                or run_orders != {1}
            ):
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            return _PracticeFollowUpChain(
                card=card,
                main_answer=main_answer,
                follow_up_generation_run=first_run,
                follow_up_decision=first_decision,
                follow_up_question=first_question,
                follow_up_exchanges=(),
                completion_reason=None,
            )

        exchanges = (
            PracticeAnsweredFollowUpExchangeContext(
                question=first_question,
                answer=first_answer,
            ),
        )
        second_run = await self._load_stable_follow_up_run(
            user_id=practice_session.user_id,
            attempt_id=attempt.id,
            order=2,
            for_update=for_update,
        )
        self._validate_follow_up_run_lineage(
            second_run,
            practice_session=practice_session,
            attempt=attempt,
            question_card=card,
            main_answer=main_answer,
            expected_order=2,
            previous_question_id=first_question.id,
            previous_answer_id=first_answer.id,
        )
        if second_run.status in {
            AgentRunStatus.QUEUED,
            AgentRunStatus.RUNNING,
            AgentRunStatus.FAILED,
        }:
            if (
                questions_by_order.get(2) is not None
                or len(decisions) != 1
                or run_orders != {1, 2}
            ):
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            return _PracticeFollowUpChain(
                card=card,
                main_answer=main_answer,
                follow_up_generation_run=second_run,
                follow_up_decision=None,
                follow_up_question=None,
                follow_up_exchanges=exchanges,
                completion_reason=None,
            )
        if second_run.status != AgentRunStatus.SUCCEEDED:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )

        second_decision, second_question = (
            await self._load_canonical_follow_up_artifact(
                second_run,
                attempt=attempt,
                expected_order=2,
                for_update=for_update,
            )
        )
        if (
            len(decisions) != 2
            or decisions_by_order.get(1) is not first_decision
            or decisions_by_order.get(2) is not second_decision
            or run_orders != {1, 2}
        ):
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        if second_decision.action == "complete":
            if second_question is not None or questions_by_order.get(2) is not None:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            return _PracticeFollowUpChain(
                card=card,
                main_answer=main_answer,
                follow_up_generation_run=second_run,
                follow_up_decision=second_decision,
                follow_up_question=None,
                follow_up_exchanges=exchanges,
                completion_reason=(
                    PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
                ),
            )
        if second_question is None or second_question.order != 2:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        if questions_by_order.get(2) is not second_question:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        second_answer = answers_by_question.get(second_question.id)
        if second_answer is None:
            return _PracticeFollowUpChain(
                card=card,
                main_answer=main_answer,
                follow_up_generation_run=second_run,
                follow_up_decision=second_decision,
                follow_up_question=second_question,
                follow_up_exchanges=exchanges,
                completion_reason=None,
            )
        return _PracticeFollowUpChain(
            card=card,
            main_answer=main_answer,
            follow_up_generation_run=second_run,
            follow_up_decision=second_decision,
            follow_up_question=None,
            follow_up_exchanges=exchanges
            + (
                PracticeAnsweredFollowUpExchangeContext(
                    question=second_question,
                    answer=second_answer,
                ),
            ),
            completion_reason=(
                PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
            ),
        )

    async def _load_follow_up_rows(
        self,
        attempt: PracticeAttempt,
        *,
        for_update: bool,
    ) -> tuple[
        list[PracticeFollowUpQuestion],
        list[PracticeAnswer],
        list[PracticeFollowUpDecision],
    ]:
        question_statement = select(PracticeFollowUpQuestion).where(
            PracticeFollowUpQuestion.attempt_id == attempt.id
        ).order_by(
            PracticeFollowUpQuestion.order,
            PracticeFollowUpQuestion.id,
        )
        answer_statement = select(PracticeAnswer).where(
            PracticeAnswer.attempt_id == attempt.id
        ).order_by(PracticeAnswer.order, PracticeAnswer.id)
        decision_statement = select(PracticeFollowUpDecision).where(
            PracticeFollowUpDecision.attempt_id == attempt.id
        ).order_by(
            PracticeFollowUpDecision.order,
            PracticeFollowUpDecision.id,
        )
        if for_update:
            question_statement = question_statement.with_for_update()
            answer_statement = answer_statement.with_for_update()
            decision_statement = decision_statement.with_for_update()
        questions = list((await self.session.scalars(question_statement)).all())
        answers = list((await self.session.scalars(answer_statement)).all())
        decisions = list((await self.session.scalars(decision_statement)).all())
        return questions, answers, decisions

    async def _load_follow_up_runs(
        self,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        *,
        for_update: bool,
    ) -> list[AgentRun]:
        statement = select(AgentRun).where(
            AgentRun.user_id == practice_session.user_id,
            AgentRun.agent_id == "follow-up-generator",
            AgentRun.payload["attemptId"].as_string() == str(attempt.id),
        ).order_by(AgentRun.created_at, AgentRun.id)
        if for_update:
            statement = statement.with_for_update()
        return list((await self.session.scalars(statement)).all())

    def _validate_follow_up_runs(
        self,
        runs: list[AgentRun],
    ) -> set[int]:
        orders: set[int] = set()
        for run in runs:
            try:
                payload = validate_follow_up_generation_run(run)
            except FollowUpGenerationStateError as error:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT,
                    source_code=error.code,
                ) from None
            if payload.next_follow_up_order in orders:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            orders.add(payload.next_follow_up_order)
        if any(order not in range(1, MAX_PRACTICE_FOLLOW_UPS + 1) for order in orders):
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        return orders

    @staticmethod
    def _validate_follow_up_rows(
        *,
        attempt: PracticeAttempt,
        main_answer: PracticeAnswer,
        questions: list[PracticeFollowUpQuestion],
        answers: list[PracticeAnswer],
        decisions: list[PracticeFollowUpDecision],
    ) -> None:
        question_orders = [question.order for question in questions]
        if (
            len(questions) > MAX_PRACTICE_FOLLOW_UPS
            or len({question.order for question in questions}) != len(questions)
            or question_orders != list(range(1, len(questions) + 1))
            or any(question.attempt_id != attempt.id for question in questions)
        ):
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        if (
            len(decisions) > MAX_PRACTICE_FOLLOW_UPS
            or len({decision.order for decision in decisions}) != len(decisions)
            or [decision.order for decision in decisions]
            != list(range(1, len(decisions) + 1))
            or any(decision.attempt_id != attempt.id for decision in decisions)
        ):
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        question_ids = {question.id for question in questions}
        follow_up_question_ids: set[UUID] = set()
        main_answer_ids: set[UUID] = set()
        for answer in answers:
            if answer.kind == PracticeAnswerKind.MAIN.value:
                if answer.id != main_answer.id or answer.id in main_answer_ids:
                    raise PracticeSessionStateError(
                        PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                    )
                main_answer_ids.add(answer.id)
                continue
            if (
                answer.kind != PracticeAnswerKind.FOLLOW_UP.value
                or answer.attempt_id != attempt.id
                or answer.follow_up_question_id not in question_ids
            ):
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            if answer.follow_up_question_id in follow_up_question_ids:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            follow_up_question_ids.add(answer.follow_up_question_id)
            question = next(
                question
                for question in questions
                if question.id == answer.follow_up_question_id
            )
            if answer.order != question.order + 1:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            try:
                _normalize_answer_content(answer.content)
            except PracticeSessionStateError:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                ) from None

    async def _load_primary_follow_up_records(
        self,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        *,
        for_update: bool = True,
    ) -> tuple[
        QuestionCard,
        PracticeAnswer,
        AgentRun,
        FollowUpRunPayload,
    ]:
        if attempt.question_card_id is None:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        question_generation_run, _ = await self._load_generation_run(
            practice_session,
            attempt,
            for_update=for_update,
        )
        if question_generation_run.status != AgentRunStatus.SUCCEEDED:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        card = await self._load_card_by_id(
            practice_session,
            attempt,
            question_generation_run,
            for_update=for_update,
        )
        main_answer = await self._load_main_answer(
            attempt,
            for_update=for_update,
        )
        if main_answer is None:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        try:
            _normalize_answer_content(main_answer.content)
        except PracticeSessionStateError:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            ) from None
        follow_up_run = await self._load_stable_follow_up_run(
            user_id=practice_session.user_id,
            attempt_id=attempt.id,
            order=1,
            for_update=for_update,
        )
        payload = self._validate_follow_up_run_lineage(
            follow_up_run,
            practice_session=practice_session,
            attempt=attempt,
            question_card=card,
            main_answer=main_answer,
        )
        return card, main_answer, follow_up_run, payload

    async def _load_canonical_follow_up_artifact(
        self,
        run: AgentRun,
        *,
        attempt: PracticeAttempt,
        expected_order: int = 1,
        for_update: bool = True,
    ) -> tuple[
        PracticeFollowUpDecision,
        PracticeFollowUpQuestion | None,
    ]:
        if not 1 <= expected_order <= MAX_PRACTICE_FOLLOW_UPS:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        if run.id is None:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        decision_statement = select(PracticeFollowUpDecision).where(
            PracticeFollowUpDecision.source_agent_run_id == run.id
        )
        if for_update:
            decision_statement = decision_statement.with_for_update()
        decision = await self.session.scalar(decision_statement)
        if decision is None:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        question_statement = select(PracticeFollowUpQuestion).where(
            PracticeFollowUpQuestion.source_agent_run_id == run.id
        )
        if for_update:
            question_statement = question_statement.with_for_update()
        question = await self.session.scalar(question_statement)
        if (
            decision.attempt_id != attempt.id
            or decision.source_agent_run_id != run.id
            or decision.order != expected_order
        ):
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        if decision.action == "complete":
            if decision.follow_up_question_id is not None or question is not None:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            try:
                follow_up_output_from_persistence(decision)
            except (TypeError, ValueError, ValidationError):
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                ) from None
            return decision, None
        if decision.action != "askFollowUp":
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        if decision.follow_up_question_id is None or question is None:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        if (
            question.id != decision.follow_up_question_id
            or question.attempt_id != attempt.id
            or question.source_agent_run_id != run.id
            or question.order != expected_order
        ):
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        try:
            follow_up_output_from_persistence(decision, question)
        except (TypeError, ValueError, ValidationError):
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            ) from None
        return decision, question

    async def _load_main_answer(
        self,
        attempt: PracticeAttempt,
        *,
        for_update: bool,
    ) -> PracticeAnswer | None:
        statement = select(PracticeAnswer).where(
            PracticeAnswer.attempt_id == attempt.id,
            PracticeAnswer.kind == PracticeAnswerKind.MAIN.value,
            PracticeAnswer.order == 1,
            PracticeAnswer.follow_up_question_id.is_(None),
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    async def _load_stable_follow_up_run(
        self,
        *,
        user_id: UUID,
        attempt_id: UUID,
        order: int,
        for_update: bool,
    ) -> AgentRun:
        statement = select(AgentRun).where(
            AgentRun.user_id == user_id,
            AgentRun.agent_id == "follow-up-generator",
            AgentRun.prompt_id == FOLLOW_UP_PROMPT.prompt_id,
            AgentRun.prompt_version == FOLLOW_UP_PROMPT.version,
            AgentRun.idempotency_key == practice_follow_up_idempotency_key(
                attempt_id,
                order,
            ),
        )
        if for_update:
            statement = statement.with_for_update()
        run = await self.session.scalar(statement)
        if run is None:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        return run

    async def _load_stable_evaluation_run(
        self,
        *,
        user_id: UUID,
        attempt_id: UUID,
        for_update: bool,
    ) -> AgentRun:
        statement = select(AgentRun).where(
            AgentRun.user_id == user_id,
            AgentRun.agent_id == "practice-evaluator",
            AgentRun.prompt_id == PRACTICE_EVALUATION_PROMPT.prompt_id,
            AgentRun.prompt_version == PRACTICE_EVALUATION_PROMPT.version,
            AgentRun.idempotency_key == practice_evaluation_idempotency_key(
                attempt_id
            ),
        )
        if for_update:
            statement = statement.with_for_update()
        run = await self.session.scalar(statement)
        if run is None:
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
            )
        return run

    async def _load_stable_review_run(
        self,
        *,
        user_id: UUID,
        attempt_id: UUID,
        for_update: bool,
        required: bool = True,
    ) -> AgentRun | None:
        # The payload arm detects a run whose stable metadata was corrupted;
        # it must be rejected by lineage validation rather than treated as
        # absent and replaced.
        statement = select(AgentRun).where(
            AgentRun.agent_id == "practice-reviewer",
            or_(
                and_(
                    AgentRun.user_id == user_id,
                    AgentRun.prompt_id == PRACTICE_REVIEW_PROMPT.prompt_id,
                    AgentRun.prompt_version == PRACTICE_REVIEW_PROMPT.version,
                    AgentRun.idempotency_key
                    == practice_review_idempotency_key(attempt_id),
                ),
                AgentRun.payload["attemptId"].as_string() == str(attempt_id),
            ),
        )
        if for_update:
            statement = statement.with_for_update()
        run = await self.session.scalar(statement)
        if (
            run is not None
            and run.idempotency_key != practice_review_idempotency_key(attempt_id)
        ):
            raise PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
            )
        if run is None and required:
            raise PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
            )
        return run

    async def _load_stable_recommendation_run(
        self,
        *,
        user_id: UUID,
        attempt_id: UUID,
        for_update: bool,
        required: bool = True,
    ) -> AgentRun | None:
        # See the review lookup: a damaged stable key must surface as a
        # conflict, never become permission to enqueue a second run.
        statement = select(AgentRun).where(
            AgentRun.agent_id == "practice-recommender",
            or_(
                and_(
                    AgentRun.user_id == user_id,
                    AgentRun.prompt_id
                    == PRACTICE_RECOMMENDATION_PROMPT.prompt_id,
                    AgentRun.prompt_version
                    == PRACTICE_RECOMMENDATION_PROMPT.version,
                    AgentRun.idempotency_key
                    == practice_recommendation_idempotency_key(attempt_id),
                ),
                AgentRun.payload["attemptId"].as_string() == str(attempt_id),
            ),
        )
        if for_update:
            statement = statement.with_for_update()
        run = await self.session.scalar(statement)
        if (
            run is not None
            and run.idempotency_key
            != practice_recommendation_idempotency_key(attempt_id)
        ):
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
            )
        if run is None and required:
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
            )
        return run

    async def _enqueue_follow_up_generation(
        self,
        *,
        user_id: UUID,
        session: PracticeSession,
        attempt: PracticeAttempt,
        next_follow_up_order: int = 1,
    ) -> AgentRun:
        try:
            return await self._follow_up_generation_service().enqueue_generation_in_transaction(
                user_id=user_id,
                attempt_id=attempt.id,
                next_follow_up_order=next_follow_up_order,
                interaction_language=session.language,
                idempotency_key=practice_follow_up_idempotency_key(
                    attempt.id,
                    next_follow_up_order,
                ),
            )
        except FollowUpGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT,
                source_code=error.code,
            ) from None
        except ValueError:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE,
                source_code="follow_up_generation_unavailable",
            ) from None

    async def _enqueue_evaluation_generation(
        self,
        *,
        user_id: UUID,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        question_card: QuestionCard,
        main_answer: PracticeAnswer,
        complete_decision: PracticeFollowUpDecision,
        follow_up_completion_reason: PracticeEvaluationFollowUpCompletionReason = (
            PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
        ),
        follow_up_exchanges: tuple[
            PracticeAnsweredFollowUpExchangeContext, ...
        ] = (),
        unanswered_follow_up_question: PracticeFollowUpQuestion | None = None,
    ) -> AgentRun:
        try:
            run = await self._evaluation_generation_service().enqueue_generation_in_transaction(
                user_id=user_id,
                attempt_id=attempt.id,
                interaction_language=practice_session.language,
                follow_up_completion_reason=follow_up_completion_reason,
                idempotency_key=practice_evaluation_idempotency_key(
                    attempt.id
                ),
            )
        except EvaluationGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT,
                source_code=error.code,
            ) from None
        except ValueError:
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_UNAVAILABLE,
                source_code="evaluation_generation_unavailable",
            ) from None
        self._validate_evaluation_run_lineage(
            run,
            practice_session=practice_session,
            attempt=attempt,
            question_card=question_card,
            main_answer=main_answer,
            complete_decision=complete_decision,
            follow_up_completion_reason=follow_up_completion_reason,
            follow_up_exchanges=follow_up_exchanges,
            unanswered_follow_up_question=unanswered_follow_up_question,
        )
        return run

    async def _enqueue_review_generation(
        self,
        *,
        user_id: UUID,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        evaluation: PracticeEvaluation,
    ) -> AgentRun:
        try:
            run = await self._review_generation_service().enqueue_generation_in_transaction(
                user_id=user_id,
                attempt_id=attempt.id,
                interaction_language=practice_session.language,
                idempotency_key=practice_review_idempotency_key(attempt.id),
            )
        except ReviewGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_STATE_CONFLICT,
                source_code=error.code,
            ) from None
        except ValueError:
            raise PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_UNAVAILABLE,
                source_code="review_generation_unavailable",
            ) from None
        self._validate_review_run_lineage(
            run,
            practice_session=practice_session,
            attempt=attempt,
            evaluation=evaluation,
        )
        return run

    async def _enqueue_recommendation_generation(
        self,
        *,
        user_id: UUID,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        evaluation: PracticeEvaluation,
        review: PracticeReview,
    ) -> AgentRun:
        try:
            run = await self._recommendation_generation_service().enqueue_generation_in_transaction(
                user_id=user_id,
                attempt_id=attempt.id,
                interaction_language=practice_session.language,
                idempotency_key=practice_recommendation_idempotency_key(
                    attempt.id
                ),
            )
        except RecommendationGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT,
                source_code=error.code,
            ) from None
        except ValueError:
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE,
                source_code="recommendation_generation_unavailable",
            ) from None
        self._validate_recommendation_run_lineage(
            run,
            practice_session=practice_session,
            attempt=attempt,
            evaluation=evaluation,
            review=review,
        )
        return run

    def _validate_follow_up_run_lineage(
        self,
        run: AgentRun,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        question_card: QuestionCard,
        main_answer: PracticeAnswer,
        expected_order: int = 1,
        previous_question_id: UUID | None = None,
        previous_answer_id: UUID | None = None,
    ) -> FollowUpRunPayload:
        try:
            payload = validate_follow_up_generation_run(run)
        except FollowUpGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT,
                source_code=error.code,
            ) from None
        if (
            run.id is None
            or run.user_id != practice_session.user_id
            or run.idempotency_key
            != practice_follow_up_idempotency_key(attempt.id, expected_order)
            or payload.attempt_id != attempt.id
            or payload.question_card_id != question_card.id
            or payload.main_answer_id != main_answer.id
            or payload.interaction_language != practice_session.language
            or payload.next_follow_up_order != expected_order
            or payload.previous_follow_up_question_id != previous_question_id
            or payload.previous_follow_up_answer_id != previous_answer_id
        ):
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        return payload

    def _validate_evaluation_run_lineage(
        self,
        run: AgentRun,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        question_card: QuestionCard,
        main_answer: PracticeAnswer,
        complete_decision: PracticeFollowUpDecision,
        follow_up_completion_reason: PracticeEvaluationFollowUpCompletionReason = (
            PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
        ),
        follow_up_exchanges: tuple[
            PracticeAnsweredFollowUpExchangeContext, ...
        ] = (),
        unanswered_follow_up_question: PracticeFollowUpQuestion | None = None,
    ) -> EvaluationRunPayload:
        try:
            payload = validate_evaluation_generation_run(run)
        except EvaluationGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT,
                source_code=error.code,
            ) from None
        expected_pairs = [
            (exchange.question.id, exchange.answer.id)
            for exchange in follow_up_exchanges
        ]
        payload_pairs = [
            (payload.follow_up_question_1_id, payload.follow_up_answer_1_id),
            (payload.follow_up_question_2_id, payload.follow_up_answer_2_id),
        ]
        actual_pairs = [pair for pair in payload_pairs if pair[0] is not None]
        exchanges_valid = all(
            exchange.question.attempt_id == attempt.id
            and exchange.answer.attempt_id == attempt.id
            and exchange.answer.kind == PracticeAnswerKind.FOLLOW_UP.value
            and exchange.answer.order == exchange.question.order + 1
            and exchange.answer.follow_up_question_id == exchange.question.id
            and exchange.question.order == index
            for index, exchange in enumerate(follow_up_exchanges, start=1)
        )
        terminal_shape_valid = False
        if (
            follow_up_completion_reason
            == PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
        ):
            terminal_shape_valid = (
                not follow_up_exchanges
                and unanswered_follow_up_question is None
                and complete_decision.attempt_id == attempt.id
                and complete_decision.order == 1
                and complete_decision.action == "complete"
                and complete_decision.follow_up_question_id is None
            )
        elif (
            follow_up_completion_reason
            == PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
        ):
            if len(follow_up_exchanges) == 1:
                terminal_shape_valid = (
                    unanswered_follow_up_question is None
                    and complete_decision.attempt_id == attempt.id
                    and complete_decision.order == 2
                    and complete_decision.action == "complete"
                    and complete_decision.follow_up_question_id is None
                )
            elif len(follow_up_exchanges) == 2:
                terminal_shape_valid = (
                    unanswered_follow_up_question is None
                    and complete_decision.attempt_id == attempt.id
                    and complete_decision.order == 2
                    and complete_decision.action == "askFollowUp"
                    and complete_decision.follow_up_question_id
                    == follow_up_exchanges[1].question.id
                )
        elif (
            follow_up_completion_reason
            == PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
        ):
            terminal_shape_valid = (
                unanswered_follow_up_question is not None
                and len(follow_up_exchanges) in (0, 1)
                and unanswered_follow_up_question.attempt_id == attempt.id
                and unanswered_follow_up_question.order
                == len(follow_up_exchanges) + 1
                and complete_decision.attempt_id == attempt.id
                and complete_decision.order
                == len(follow_up_exchanges) + 1
                and complete_decision.action == "askFollowUp"
                and complete_decision.follow_up_question_id
                == unanswered_follow_up_question.id
            )
        if (
            run.id is None
            or run.user_id != practice_session.user_id
            or run.idempotency_key != practice_evaluation_idempotency_key(
                attempt.id
            )
            or payload.attempt_id != attempt.id
            or payload.question_card_id != question_card.id
            or payload.main_answer_id != main_answer.id
            or payload.interaction_language != practice_session.language
            or payload.follow_up_completion_reason != follow_up_completion_reason
            or payload.terminal_follow_up_decision_id != complete_decision.id
            or payload.unanswered_follow_up_question_id
            != (
                unanswered_follow_up_question.id
                if unanswered_follow_up_question is not None
                else None
            )
            or any(
                (question_id is None) != (answer_id is None)
                for question_id, answer_id in payload_pairs
            )
            or actual_pairs != expected_pairs
            or len(follow_up_exchanges) > MAX_PRACTICE_FOLLOW_UPS
            or len(follow_up_exchanges) not in (0, 1, 2)
            or not exchanges_valid
            or not terminal_shape_valid
        ):
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
            )
        return payload

    def _validate_review_run_lineage(
        self,
        run: AgentRun,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        evaluation: PracticeEvaluation,
    ) -> None:
        try:
            payload = validate_review_generation_run(run)
        except ReviewGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_STATE_CONFLICT,
                source_code=error.code,
            ) from None
        if (
            run.id is None
            or run.user_id != practice_session.user_id
            or run.idempotency_key != practice_review_idempotency_key(attempt.id)
            or payload.attempt_id != attempt.id
            or payload.evaluation_id != evaluation.id
            or payload.interaction_language != practice_session.language
        ):
            raise PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
            )

    def _validate_recommendation_run_lineage(
        self,
        run: AgentRun,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        evaluation: PracticeEvaluation,
        review: PracticeReview,
    ) -> None:
        try:
            payload = validate_recommendation_generation_run(run)
        except RecommendationGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT,
                source_code=error.code,
            ) from None
        if (
            run.id is None
            or run.user_id != practice_session.user_id
            or run.idempotency_key
            != practice_recommendation_idempotency_key(attempt.id)
            or payload.attempt_id != attempt.id
            or payload.evaluation_id != evaluation.id
            or payload.review_id != review.id
            or payload.interaction_language != practice_session.language
        ):
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
            )

    async def _load_evaluation_artifact(
        self,
        run: AgentRun,
        *,
        attempt: PracticeAttempt,
        question_card: QuestionCard,
        for_update: bool,
    ) -> PracticeEvaluation | None:
        if run.status in {
            AgentRunStatus.QUEUED,
            AgentRunStatus.RUNNING,
            AgentRunStatus.FAILED,
        }:
            return None
        if run.status != AgentRunStatus.SUCCEEDED or run.id is None:
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
            )
        statement = select(PracticeEvaluation).where(
            PracticeEvaluation.source_agent_run_id == run.id
        )
        if for_update:
            statement = statement.with_for_update()
        evaluation = await self.session.scalar(statement)
        if evaluation is None or evaluation.attempt_id != attempt.id:
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
            )
        try:
            practice_evaluation_output_from_artifact(
                evaluation,
                scoring_focus_count=len(question_card.scoring_focus),
            )
        except (TypeError, ValueError):
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
            ) from None
        return evaluation

    async def _load_review_artifact(
        self,
        run: AgentRun,
        *,
        attempt: PracticeAttempt,
        evaluation: PracticeEvaluation,
        for_update: bool,
    ) -> PracticeReview | None:
        if run.status in {
            AgentRunStatus.QUEUED,
            AgentRunStatus.RUNNING,
            AgentRunStatus.FAILED,
        }:
            return None
        if run.status != AgentRunStatus.SUCCEEDED or run.id is None:
            raise PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
            )
        statement = select(PracticeReview).where(
            PracticeReview.source_agent_run_id == run.id
        )
        if for_update:
            statement = statement.with_for_update()
        review = await self.session.scalar(statement)
        if (
            review is None
            or review.attempt_id != attempt.id
            or review.source_agent_run_id != run.id
        ):
            raise PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
            )
        try:
            practice_review_output_from_artifact(review)
        except (TypeError, ValueError, ValidationError):
            raise PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
            ) from None
        if evaluation.attempt_id != attempt.id:
            raise PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
            )
        return review

    async def _load_recommendation_artifact(
        self,
        run: AgentRun,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        question_card: QuestionCard,
        evaluation: PracticeEvaluation,
        review: PracticeReview,
        follow_up_completion_reason: PracticeEvaluationFollowUpCompletionReason = (
            PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
        ),
        for_update: bool,
    ) -> PracticeRecommendation | None:
        if run.status in {
            AgentRunStatus.QUEUED,
            AgentRunStatus.RUNNING,
            AgentRunStatus.FAILED,
        }:
            return None
        if run.status != AgentRunStatus.SUCCEEDED or run.id is None:
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
            )
        statement = select(PracticeRecommendation).where(
            PracticeRecommendation.source_agent_run_id == run.id
        )
        if for_update:
            statement = statement.with_for_update()
        recommendation = await self.session.scalar(statement)
        if (
            recommendation is None
            or recommendation.attempt_id != attempt.id
            or recommendation.source_agent_run_id != run.id
        ):
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
            )
        try:
            output = practice_recommendation_output_from_artifact(recommendation)
            recommendation_input = self._recommendation_input(
                practice_session=practice_session,
                question_card=question_card,
                evaluation=evaluation,
                review=review,
                follow_up_completion_reason=follow_up_completion_reason,
            )
            validate_recommendation_v1_contract(output, recommendation_input)
        except (
            RecommendationGenerationStateError,
            TypeError,
            ValueError,
            ValidationError,
        ):
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
            ) from None
        return recommendation

    @staticmethod
    def _recommendation_input(
        *,
        practice_session: PracticeSession,
        question_card: QuestionCard,
        evaluation: PracticeEvaluation,
        review: PracticeReview,
        follow_up_completion_reason: PracticeEvaluationFollowUpCompletionReason,
    ) -> PracticeRecommendationInput:
        evaluation_output = practice_evaluation_output_from_artifact(
            evaluation,
            scoring_focus_count=len(question_card.scoring_focus),
        )
        review_output = practice_review_output_from_artifact(review)
        question = PracticeRecommendationQuestionContext.model_validate(
            {
                "prompt": question_card.prompt,
                "question_type": question_card.question_type,
                "difficulty": question_card.difficulty,
                "assessed_capabilities": list(
                    question_card.assessed_capabilities
                ),
                "scoring_focus": list(question_card.scoring_focus),
            }
        )
        return PracticeRecommendationInput(
            interaction_language=practice_session.language,
            question=question,
            follow_up_completion_reason=follow_up_completion_reason,
            evaluation=evaluation_output,
            review=review_output,
        )

    def _follow_up_generation_service(self) -> FollowUpGenerationService:
        return self.follow_up_generation_service_factory(
            self.session,
            llm_model=self.llm_model,
        )

    def _evaluation_generation_service(self) -> EvaluationGenerationService:
        return self.evaluation_generation_service_factory(
            self.session,
            llm_model=self.llm_model,
        )

    def _review_generation_service(self) -> ReviewGenerationService:
        return self.review_generation_service_factory(
            self.session,
            llm_model=self.llm_model,
        )

    def _recommendation_generation_service(
        self,
    ) -> RecommendationGenerationService:
        return self.recommendation_generation_service_factory(
            self.session,
            llm_model=self.llm_model,
        )

    def _reference_answer_generation_service(
        self,
    ) -> ReferenceAnswerGenerationService:
        return self.reference_answer_generation_service_factory(
            self.session,
            llm_model=self.llm_model,
        )

    async def _ensure_review_reference_answers(
        self,
        *,
        user_id: UUID,
        question_card: QuestionCard,
        main_answer: PracticeAnswer,
        follow_up_exchanges: tuple[PracticeAnsweredFollowUpExchangeContext, ...],
        follow_up_completion_reason: PracticeEvaluationFollowUpCompletionReason,
        unanswered_follow_up_question: PracticeFollowUpQuestion | None,
        evaluation_generation_run: AgentRun,
    ) -> bool:
        targets = [
            _PracticeReviewReferenceAnswerTarget(
                follow_up_question_id=None,
                submitted_at=main_answer.submitted_at,
            ),
            *(
                _PracticeReviewReferenceAnswerTarget(
                    follow_up_question_id=exchange.question.id,
                    submitted_at=exchange.answer.submitted_at,
                )
                for exchange in follow_up_exchanges
            ),
        ]
        if (
            follow_up_completion_reason
            == PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
        ):
            if unanswered_follow_up_question is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            try:
                _require_aware_datetime(evaluation_generation_run.created_at)
            except (AttributeError, TypeError, ValueError):
                raise PracticeSessionStateError(
                    PRACTICE_SESSION_STATE_CONFLICT
                ) from None
            targets.append(
                _PracticeReviewReferenceAnswerTarget(
                    follow_up_question_id=unanswered_follow_up_question.id,
                    submitted_at=evaluation_generation_run.created_at,
                )
            )
        elif unanswered_follow_up_question is not None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        generation_service = self._reference_answer_generation_service()
        missing_targets: list[_PracticeReviewReferenceAnswerTarget] = []
        try:
            for target in targets:
                if target.follow_up_question_id is None:
                    state = await generation_service.get_main_generation_state(
                        user_id=user_id,
                        question_card_id=question_card.id,
                        submitted_at=target.submitted_at,
                        for_update=True,
                    )
                else:
                    state = await generation_service.get_follow_up_generation_state(
                        user_id=user_id,
                        question_card_id=question_card.id,
                        follow_up_question_id=target.follow_up_question_id,
                        submitted_at=target.submitted_at,
                        for_update=True,
                    )
                if state.status is PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED:
                    missing_targets.append(target)

            for target in missing_targets:
                if target.follow_up_question_id is None:
                    await generation_service.enqueue_main_generation_in_transaction(
                        user_id=user_id,
                        question_card_id=question_card.id,
                        idempotency_key=practice_main_reference_answer_idempotency_key(
                            question_card.id
                        ),
                    )
                else:
                    await generation_service.enqueue_follow_up_generation_in_transaction(
                        user_id=user_id,
                        question_card_id=question_card.id,
                        follow_up_question_id=target.follow_up_question_id,
                        idempotency_key=practice_follow_up_reference_answer_idempotency_key(
                            target.follow_up_question_id
                        ),
                    )

            all_terminal = True
            for target in targets:
                if target.follow_up_question_id is None:
                    state = await generation_service.get_main_generation_state(
                        user_id=user_id,
                        question_card_id=question_card.id,
                        submitted_at=target.submitted_at,
                        for_update=True,
                    )
                else:
                    state = await generation_service.get_follow_up_generation_state(
                        user_id=user_id,
                        question_card_id=question_card.id,
                        follow_up_question_id=target.follow_up_question_id,
                        submitted_at=target.submitted_at,
                        for_update=True,
                    )
                if state.status not in {
                    PracticeReferenceAnswerLifecycleStatus.REVEALED,
                    PracticeReferenceAnswerLifecycleStatus.UNAVAILABLE,
                }:
                    all_terminal = False
            return all_terminal
        except ReferenceAnswerGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_SESSION_STATE_CONFLICT,
                source_code=error.code,
            ) from None
        except ValueError as error:
            raise PracticeSessionStateError(
                PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE,
                source_code="reference_answer_generation_unavailable",
            ) from error

    def _generation_service(self) -> QuestionGenerationService:
        return self.question_generation_service_factory(
            self.session,
            llm_model=self.llm_model,
        )

    async def _lock_user(self, user_id: UUID) -> None:
        user = await self.session.scalar(
            select(User.id).where(User.id == user_id).with_for_update()
        )
        if user is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_NOT_FOUND)

    async def _load_active_session(
        self,
        user_id: UUID,
        *,
        for_update: bool,
    ) -> PracticeSession | None:
        statement = select(PracticeSession).where(
            PracticeSession.user_id == user_id,
            PracticeSession.status == "active",
        )
        if for_update:
            statement = statement.with_for_update()
        practice_session = await self.session.scalar(statement)
        if practice_session is not None and practice_session.status != "active":
            return None
        return practice_session

    async def _load_attempt_by_number(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        attempt_number: int,
        for_update: bool,
    ) -> PracticeAttempt | None:
        statement = select(PracticeAttempt).where(
            PracticeAttempt.user_id == user_id,
            PracticeAttempt.session_id == session_id,
            PracticeAttempt.attempt_number == attempt_number,
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    async def _load_attempt_by_id(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        attempt_id: UUID,
        for_update: bool,
    ) -> PracticeAttempt | None:
        statement = select(PracticeAttempt).where(
            PracticeAttempt.id == attempt_id,
            PracticeAttempt.user_id == user_id,
            PracticeAttempt.session_id == session_id,
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    async def _load_session(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        for_update: bool,
    ) -> PracticeSession:
        statement = select(PracticeSession).where(
            PracticeSession.id == session_id,
            PracticeSession.user_id == user_id,
        )
        if for_update:
            statement = statement.with_for_update()
        practice_session = await self.session.scalar(statement)
        if practice_session is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_NOT_FOUND)
        return practice_session

    @staticmethod
    def _next_question_selection(
        attempt: PracticeAttempt,
        recommendation: PracticeRecommendation,
    ) -> tuple[QuestionCardQuestionType, QuestionCardDifficulty]:
        if recommendation.action == "nextQuestion":
            if (
                recommendation.next_question_type is None
                or recommendation.next_difficulty is None
            ):
                raise PracticeSessionStateError(
                    PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
                )
            question_type_value = recommendation.next_question_type
            difficulty_value = recommendation.next_difficulty
        elif recommendation.action == "retryCurrent":
            question_type_value = attempt.question_type
            difficulty_value = attempt.difficulty
        else:
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
            )

        try:
            return (
                QuestionCardQuestionType(question_type_value),
                QuestionCardDifficulty(difficulty_value),
            )
        except ValueError:
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
            ) from None

    async def _load_current_attempt(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        for_update: bool,
    ) -> PracticeAttempt | None:
        statement = (
            select(PracticeAttempt)
            .where(
                PracticeAttempt.user_id == user_id,
                PracticeAttempt.session_id == session_id,
            )
            .order_by(PracticeAttempt.attempt_number.desc())
            .limit(1)
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    def _resolve_evaluation_follow_up_snapshot(
        self,
        *,
        evaluation_run: AgentRun,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        chain: _PracticeFollowUpChain,
    ) -> tuple[
        PracticeEvaluationFollowUpCompletionReason,
        PracticeFollowUpQuestion | None,
    ]:
        try:
            payload = validate_evaluation_generation_run(evaluation_run)
        except EvaluationGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT,
                source_code=error.code,
            ) from None

        if chain.completion_reason is None:
            if (
                payload.follow_up_completion_reason
                != PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
                or chain.follow_up_decision is None
                or chain.follow_up_decision.action != "askFollowUp"
                or chain.follow_up_question is None
            ):
                raise PracticeSessionStateError(
                    PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
                )
            completion_reason = (
                PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
            )
            unanswered_question = chain.follow_up_question
        else:
            if chain.follow_up_question is not None:
                raise PracticeSessionStateError(
                    PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
                )
            completion_reason = chain.completion_reason
            unanswered_question = None

        self._validate_evaluation_run_lineage(
            evaluation_run,
            practice_session=practice_session,
            attempt=attempt,
            question_card=chain.card,
            main_answer=chain.main_answer,
            complete_decision=chain.follow_up_decision,
            follow_up_completion_reason=completion_reason,
            follow_up_exchanges=chain.follow_up_exchanges,
            unanswered_follow_up_question=unanswered_question,
        )
        return completion_reason, unanswered_question

    async def _load_active_context(
        self,
        practice_session: PracticeSession,
    ) -> PracticePublicWorkflowContext:
        return await self._load_public_active_context(
            practice_session,
            for_update=True,
        )

    async def _load_public_active_context(
        self,
        practice_session: PracticeSession,
        *,
        for_update: bool,
        current_attempt: PracticeAttempt | None = None,
    ) -> PracticePublicWorkflowContext:
        attempt = current_attempt
        if attempt is None:
            attempt = await self._load_current_attempt(
                user_id=practice_session.user_id,
                session_id=practice_session.id,
                for_update=for_update,
            )
        if attempt is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if attempt.status not in {
            PracticeAttemptStatus.GENERATING_QUESTION.value,
            PracticeAttemptStatus.ANSWERING.value,
            PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value,
            PracticeAttemptStatus.EVALUATING.value,
            PracticeAttemptStatus.REVIEW.value,
        }:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if (
            attempt.status == PracticeAttemptStatus.REVIEW.value
            and (
                attempt.question_card_id is None
                or attempt.completed_at is None
            )
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        run, _ = await self._load_generation_run(
            practice_session,
            attempt,
            for_update=for_update,
        )
        if attempt.status == PracticeAttemptStatus.GENERATING_QUESTION.value:
            if attempt.question_card_id is not None:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
                )
            return PracticeSessionWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_generation_run=run,
                question_card=None,
            )

        if run.status != AgentRunStatus.SUCCEEDED:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if attempt.question_card_id is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        card = await self._load_card_by_id(
            practice_session,
            attempt,
            run,
            for_update=for_update,
        )
        main_answer = await self._load_main_answer(
            attempt,
            for_update=for_update,
        )
        if main_answer is None:
            return PracticeSessionWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_generation_run=run,
                question_card=card,
            )
        _normalize_answer_content(main_answer.content)
        follow_up_run = await self._load_stable_follow_up_run(
            user_id=practice_session.user_id,
            attempt_id=attempt.id,
            order=1,
            for_update=for_update,
        )
        chain = await self._load_follow_up_chain(
            practice_session,
            attempt,
            for_update=for_update,
            primary_records=(card, main_answer, follow_up_run),
            allow_unmaterialized_success=(
                attempt.status == PracticeAttemptStatus.ANSWERING.value
            ),
        )
        if attempt.status == PracticeAttemptStatus.ANSWERING.value:
            return self._primary_context_from_chain(
                practice_session,
                attempt,
                chain,
            )
        if attempt.status == PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value:
            if (
                chain.follow_up_generation_run.status
                != AgentRunStatus.SUCCEEDED
                or chain.follow_up_decision is None
                or chain.follow_up_decision.action != "askFollowUp"
                or chain.follow_up_question is None
                or chain.completion_reason is not None
            ):
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            return self._primary_context_from_chain(
                practice_session,
                attempt,
                chain,
            )
        if (
            chain.follow_up_generation_run.status != AgentRunStatus.SUCCEEDED
            or chain.follow_up_decision is None
        ):
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        evaluation_generation_run = await self._load_stable_evaluation_run(
            user_id=practice_session.user_id,
            attempt_id=attempt.id,
            for_update=for_update,
        )
        follow_up_completion_reason, unanswered_question = (
            self._resolve_evaluation_follow_up_snapshot(
                evaluation_run=evaluation_generation_run,
                practice_session=practice_session,
                attempt=attempt,
                chain=chain,
            )
        )
        evaluation = await self._load_evaluation_artifact(
            evaluation_generation_run,
            attempt=attempt,
            question_card=chain.card,
            for_update=for_update,
        )
        review_generation_run = await self._load_stable_review_run(
            user_id=practice_session.user_id,
            attempt_id=attempt.id,
            for_update=for_update,
            required=False,
        )
        review: PracticeReview | None = None
        recommendation_generation_run: AgentRun | None = None
        recommendation: PracticeRecommendation | None = None
        if review_generation_run is not None:
            if evaluation is None:
                raise PracticeSessionStateError(
                    PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
                )
            self._validate_review_run_lineage(
                review_generation_run,
                practice_session=practice_session,
                attempt=attempt,
                evaluation=evaluation,
            )
            if review_generation_run.status not in {
                AgentRunStatus.QUEUED,
                AgentRunStatus.RUNNING,
                AgentRunStatus.FAILED,
                AgentRunStatus.SUCCEEDED,
            }:
                raise PracticeSessionStateError(
                    PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
                )
            if review_generation_run.status == AgentRunStatus.SUCCEEDED:
                review = await self._load_review_artifact(
                    review_generation_run,
                    attempt=attempt,
                    evaluation=evaluation,
                    for_update=for_update,
                )

        recommendation_generation_run = await self._load_stable_recommendation_run(
            user_id=practice_session.user_id,
            attempt_id=attempt.id,
            for_update=for_update,
            required=False,
        )
        if recommendation_generation_run is not None:
            if evaluation is None or review is None:
                raise PracticeSessionStateError(
                    PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
                )
            self._validate_recommendation_run_lineage(
                recommendation_generation_run,
                practice_session=practice_session,
                attempt=attempt,
                evaluation=evaluation,
                review=review,
            )
            if recommendation_generation_run.status not in {
                AgentRunStatus.QUEUED,
                AgentRunStatus.RUNNING,
                AgentRunStatus.FAILED,
                AgentRunStatus.SUCCEEDED,
            }:
                raise PracticeSessionStateError(
                    PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
                )
            if recommendation_generation_run.status == AgentRunStatus.SUCCEEDED:
                recommendation = await self._load_recommendation_artifact(
                    recommendation_generation_run,
                    practice_session=practice_session,
                    attempt=attempt,
                    question_card=chain.card,
                    evaluation=evaluation,
                    review=review,
                    follow_up_completion_reason=follow_up_completion_reason,
                    for_update=for_update,
                )

        pipeline_context = PracticeEvaluationWorkflowContext(
            session=practice_session,
            attempt=attempt,
            question_card=chain.card,
            main_answer=chain.main_answer,
            follow_up_generation_run=chain.follow_up_generation_run,
            follow_up_decision=chain.follow_up_decision,
            follow_up_question=unanswered_question,
            follow_up_exchanges=chain.follow_up_exchanges,
            follow_up_completion_reason=follow_up_completion_reason,
            evaluation_generation_run=evaluation_generation_run,
            evaluation=evaluation,
            review_generation_run=review_generation_run,
            review=review,
            recommendation_generation_run=recommendation_generation_run,
            recommendation=recommendation,
        )
        if attempt.status == PracticeAttemptStatus.EVALUATING.value:
            return pipeline_context

        if (
            evaluation_generation_run.status != AgentRunStatus.SUCCEEDED
            or evaluation is None
            or review_generation_run is None
            or review_generation_run.status != AgentRunStatus.SUCCEEDED
            or review is None
            or recommendation_generation_run is None
            or recommendation_generation_run.status != AgentRunStatus.SUCCEEDED
            or recommendation is None
        ):
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
            )
        return PracticeReviewWorkflowContext(
            session=pipeline_context.session,
            attempt=pipeline_context.attempt,
            question_card=pipeline_context.question_card,
            main_answer=pipeline_context.main_answer,
            follow_up_generation_run=pipeline_context.follow_up_generation_run,
            follow_up_decision=pipeline_context.follow_up_decision,
            follow_up_question=pipeline_context.follow_up_question,
            follow_up_exchanges=pipeline_context.follow_up_exchanges,
            follow_up_completion_reason=pipeline_context.follow_up_completion_reason,
            evaluation_generation_run=evaluation_generation_run,
            evaluation=evaluation,
            review_generation_run=review_generation_run,
            review=review,
            recommendation_generation_run=recommendation_generation_run,
            recommendation=recommendation,
        )

    async def _load_review_replay_context(
        self,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        *,
        allow_completed: bool = False,
        allow_completed_session: bool = False,
        allow_user_ended_early_session: bool = False,
        for_update: bool = True,
    ) -> PracticeReviewWorkflowContext:
        attempt_state_valid = (
            attempt.status
            in {
                PracticeAttemptStatus.REVIEW.value,
                PracticeAttemptStatus.COMPLETED.value,
            }
            if allow_completed
            else attempt.status == PracticeAttemptStatus.REVIEW.value
        )
        if allow_completed_session:
            allowed_completion_reasons = {
                PracticeSessionCompletionReason.REVIEW_COMPLETED.value
            }
            if allow_user_ended_early_session:
                allowed_completion_reasons.add(
                    PracticeSessionCompletionReason.USER_ENDED_EARLY.value
                )
            session_state_valid = (
                practice_session.status
                == PracticeSessionStatus.COMPLETED.value
                and practice_session.completed_at is not None
                and practice_session.completion_reason in allowed_completion_reasons
            )
        else:
            session_state_valid = (
                practice_session.status == PracticeSessionStatus.ACTIVE.value
                and practice_session.completed_at is None
                and practice_session.completion_reason is None
            )
        if not attempt_state_valid or attempt.completed_at is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if not session_state_valid:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if allow_completed_session:
            completed_at = practice_session.completed_at
            if completed_at is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            _require_aware_datetime(completed_at)

        chain = await self._load_follow_up_chain(
            practice_session,
            attempt,
            for_update=for_update,
        )
        if (
            chain.follow_up_generation_run.status != AgentRunStatus.SUCCEEDED
            or chain.follow_up_decision is None
        ):
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )

        evaluation_run = await self._load_stable_evaluation_run(
            user_id=practice_session.user_id,
            attempt_id=attempt.id,
            for_update=for_update,
        )
        follow_up_completion_reason, unanswered_question = (
            self._resolve_evaluation_follow_up_snapshot(
                evaluation_run=evaluation_run,
                practice_session=practice_session,
                attempt=attempt,
                chain=chain,
            )
        )
        if evaluation_run.status != AgentRunStatus.SUCCEEDED:
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
            )
        evaluation = await self._load_evaluation_artifact(
            evaluation_run,
            attempt=attempt,
            question_card=chain.card,
            for_update=for_update,
        )
        if evaluation is None:
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
            )

        review_run = await self._load_stable_review_run(
            user_id=practice_session.user_id,
            attempt_id=attempt.id,
            for_update=for_update,
        )
        self._validate_review_run_lineage(
            review_run,
            practice_session=practice_session,
            attempt=attempt,
            evaluation=evaluation,
        )
        if review_run.status != AgentRunStatus.SUCCEEDED:
            raise PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
            )
        review = await self._load_review_artifact(
            review_run,
            attempt=attempt,
            evaluation=evaluation,
            for_update=for_update,
        )
        if review is None:
            raise PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
            )

        recommendation_run = await self._load_stable_recommendation_run(
            user_id=practice_session.user_id,
            attempt_id=attempt.id,
            for_update=for_update,
        )
        self._validate_recommendation_run_lineage(
            recommendation_run,
            practice_session=practice_session,
            attempt=attempt,
            evaluation=evaluation,
            review=review,
        )
        if recommendation_run.status != AgentRunStatus.SUCCEEDED:
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
            )
        recommendation = await self._load_recommendation_artifact(
            recommendation_run,
            practice_session=practice_session,
            attempt=attempt,
            question_card=chain.card,
            evaluation=evaluation,
            review=review,
            follow_up_completion_reason=follow_up_completion_reason,
            for_update=for_update,
        )
        if recommendation is None:
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
            )
        return PracticeReviewWorkflowContext(
            session=practice_session,
            attempt=attempt,
            question_card=chain.card,
            main_answer=chain.main_answer,
            follow_up_generation_run=chain.follow_up_generation_run,
            follow_up_decision=chain.follow_up_decision,
            follow_up_question=unanswered_question,
            follow_up_exchanges=chain.follow_up_exchanges,
            follow_up_completion_reason=follow_up_completion_reason,
            evaluation_generation_run=evaluation_run,
            evaluation=evaluation,
            review_generation_run=review_run,
            review=review,
            recommendation_generation_run=recommendation_run,
            recommendation=recommendation,
        )

    async def _load_completed_generation_replay_context(
        self,
        practice_session: PracticeSession,
    ) -> PracticeSessionWorkflowContext:
        attempt = await self._load_current_attempt(
            user_id=practice_session.user_id,
            session_id=practice_session.id,
            for_update=True,
        )
        if attempt is None or attempt.status != PracticeAttemptStatus.ANSWERING.value:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if attempt.question_card_id is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        run, _ = await self._load_generation_run(
            practice_session,
            attempt,
            for_update=True,
        )
        if run.status != AgentRunStatus.SUCCEEDED:
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
            )
        card = await self._load_card_by_id(
            practice_session,
            attempt,
            run,
            for_update=True,
        )
        return PracticeSessionWorkflowContext(
            session=practice_session,
            attempt=attempt,
            question_generation_run=run,
            question_card=card,
        )

    @staticmethod
    def _validate_question_generation_run_lineage(
        run: AgentRun,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        idempotency_key: str,
    ) -> QuestionGenerationRunPayload:
        try:
            payload = validate_question_generation_run(run)
        except QuestionGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_STATE_CONFLICT,
                source_code=error.code,
            ) from None
        if (
            run.id is None
            or run.user_id != practice_session.user_id
            or attempt.user_id != practice_session.user_id
            or attempt.session_id != practice_session.id
            or run.idempotency_key != idempotency_key
            or payload.role_id != practice_session.target_role_id
            or payload.interaction_language != practice_session.language
            or payload.question_type.value != attempt.question_type
            or payload.difficulty.value != attempt.difficulty
        ):
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
            )
        return payload

    async def _resolve_question_source_attempt(
        self,
        *,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        for_update: bool,
    ) -> PracticeAttempt:
        """Walk retry edges to the attempt that owns question provenance."""

        current = attempt
        visited: set[UUID] = set()
        while True:
            if current.id in visited:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
                )
            visited.add(current.id)
            if (
                current.user_id != practice_session.user_id
                or current.session_id != practice_session.id
            ):
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
                )

            if current.retry_of_attempt_id is None:
                if current.question_generation_run_id is None:
                    raise PracticeSessionStateError(
                        PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
                    )
                return current

            if current.question_generation_run_id is not None:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
                )
            parent = await self._load_attempt_by_id(
                user_id=practice_session.user_id,
                session_id=practice_session.id,
                attempt_id=current.retry_of_attempt_id,
                for_update=for_update,
            )
            if parent is None:
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
                )
            if (
                parent.user_id != practice_session.user_id
                or parent.session_id != practice_session.id
                or parent.id != current.retry_of_attempt_id
                or parent.attempt_number + 1 != current.attempt_number
                or parent.attempt_number >= current.attempt_number
                or parent.status != PracticeAttemptStatus.COMPLETED.value
                or parent.completed_at is None
                or current.question_card_id != parent.question_card_id
                or current.question_type != parent.question_type
                or current.difficulty != parent.difficulty
            ):
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
                )
            current = parent

    async def _load_question_source(
        self,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        *,
        for_update: bool,
        require_succeeded: bool,
    ) -> _PracticeQuestionSource:
        source_attempt = await self._resolve_question_source_attempt(
            practice_session=practice_session,
            attempt=attempt,
            for_update=for_update,
        )
        if (
            source_attempt.question_generation_run_id is None
            or source_attempt.question_card_id is None
            or attempt.question_card_id != source_attempt.question_card_id
        ):
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
            )

        statement = select(AgentRun).where(
            AgentRun.id == source_attempt.question_generation_run_id,
            AgentRun.user_id == practice_session.user_id,
            AgentRun.agent_id == "question-generator",
        )
        if for_update:
            statement = statement.with_for_update()
        run = await self.session.scalar(statement)
        if run is None:
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
            )
        payload = self._validate_question_generation_run_lineage(
            run,
            practice_session=practice_session,
            attempt=source_attempt,
            idempotency_key=practice_question_generation_idempotency_key(
                practice_session.id,
                source_attempt.id,
            ),
        )
        if require_succeeded and run.status != AgentRunStatus.SUCCEEDED:
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
            )
        card = await self._load_card_by_id(
            practice_session,
            attempt,
            run,
            for_update=for_update,
        )
        return _PracticeQuestionSource(
            attempt=source_attempt,
            generation_run=run,
            generation_payload=payload,
            question_card=card,
        )

    async def _load_generation_run(
        self,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        *,
        for_update: bool = True,
    ) -> tuple[AgentRun, QuestionGenerationRunPayload]:
        if attempt.retry_of_attempt_id is not None:
            source = await self._load_question_source(
                practice_session,
                attempt,
                for_update=for_update,
                require_succeeded=True,
            )
            return source.generation_run, source.generation_payload

        if attempt.question_generation_run_id is None:
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
            )
        statement = select(AgentRun).where(
            AgentRun.id == attempt.question_generation_run_id
        )
        if for_update:
            statement = statement.with_for_update()
        run = await self.session.scalar(statement)
        if run is None or run.user_id != practice_session.user_id:
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
            )
        try:
            payload = validate_question_generation_run(run)
        except QuestionGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_STATE_CONFLICT,
                source_code=error.code,
            ) from None
        if (
            payload.role_id != practice_session.target_role_id
            or payload.interaction_language != practice_session.language
            or payload.question_type.value != attempt.question_type
            or payload.difficulty.value != attempt.difficulty
        ):
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
            )
        return run, payload

    async def _load_card_for_run(
        self,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        run: AgentRun,
        *,
        for_update: bool = True,
    ) -> QuestionCard:
        statement = select(QuestionCard).where(
            QuestionCard.source_agent_run_id == run.id,
            QuestionCard.user_id == practice_session.user_id,
        )
        if for_update:
            statement = statement.with_for_update()
        card = await self.session.scalar(statement)
        if card is None:
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
            )
        self._validate_question_card(practice_session, attempt, run, card)
        return card

    async def _load_card_by_id(
        self,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        run: AgentRun,
        *,
        for_update: bool = True,
    ) -> QuestionCard:
        assert attempt.question_card_id is not None
        statement = select(QuestionCard).where(
            QuestionCard.id == attempt.question_card_id,
            QuestionCard.user_id == practice_session.user_id,
        )
        if for_update:
            statement = statement.with_for_update()
        card = await self.session.scalar(statement)
        if card is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        self._validate_question_card(practice_session, attempt, run, card)
        return card

    @staticmethod
    def _validate_question_card(
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        run: AgentRun,
        card: QuestionCard,
    ) -> None:
        if (
            card.user_id != practice_session.user_id
            or card.target_role_id != practice_session.target_role_id
            or card.language != practice_session.language
            or card.question_type != attempt.question_type
            or card.difficulty != attempt.difficulty
            or card.source_agent_run_id != run.id
        ):
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
            )

    @staticmethod
    def _same_intent(
        practice_session: PracticeSession,
        *,
        selection: PracticeSessionSelection,
        interaction_language: InteractionLanguage,
    ) -> bool:
        return (
            practice_session.target_role_id == selection.target_role_id
            and practice_session.initial_question_type
            == selection.question_type.value
            and practice_session.initial_difficulty == selection.difficulty.value
            and practice_session.source == selection.source.value
            and practice_session.prioritize_weaknesses
            == selection.prioritize_weaknesses
            and practice_session.language == interaction_language
        )

    @staticmethod
    def _require_supported_selection(
        selection: PracticeSessionSelection,
    ) -> None:
        if selection.source.value != "personalized":
            raise PracticeSessionStateError(
                PRACTICE_SESSION_SOURCE_UNAVAILABLE
            )
        if selection.prioritize_weaknesses:
            raise PracticeSessionStateError(
                PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE
            )


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")


def _valid_expected_version(value: object) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, int)
        and value >= 1
    )


def _normalize_answer_content(value: object) -> str:
    try:
        return TypeAdapter(PracticeAnswerContent).validate_python(value)
    except (TypeError, ValueError, ValidationError):
        raise PracticeSessionStateError(
            PRACTICE_SESSION_STATE_CONFLICT
        ) from None


__all__ = [
    "PRACTICE_QUESTION_GENERATION_FAILED",
    "PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED",
    "PRACTICE_QUESTION_GENERATION_UNAVAILABLE",
    "PRACTICE_QUESTION_GENERATION_STATE_CONFLICT",
    "PRACTICE_FOLLOW_UP_GENERATION_FAILED",
    "PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT",
    "PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE",
    "PRACTICE_EVALUATION_GENERATION_FAILED",
    "PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT",
    "PRACTICE_EVALUATION_GENERATION_UNAVAILABLE",
    "PRACTICE_REVIEW_GENERATION_FAILED",
    "PRACTICE_REVIEW_GENERATION_STATE_CONFLICT",
    "PRACTICE_REVIEW_GENERATION_UNAVAILABLE",
    "PRACTICE_RECOMMENDATION_GENERATION_FAILED",
    "PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT",
    "PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE",
    "PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE",
    "PRACTICE_SESSION_ALREADY_ACTIVE",
    "PRACTICE_SESSION_NOT_FOUND",
    "PRACTICE_SESSION_SOURCE_UNAVAILABLE",
    "PRACTICE_SESSION_STATE_CONFLICT",
    "PRACTICE_SESSION_VERSION_CONFLICT",
    "PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE",
    "PracticeSessionService",
    "PracticeSessionStateError",
    "PracticeSessionStateErrorCode",
    "PracticeAnsweredFollowUpExchangeContext",
    "PracticeCompletedSessionWorkflowContext",
    "PracticeEndedEarlySessionWorkflowContext",
    "PracticePrimaryAnswerWorkflowContext",
    "PracticeReferenceAnswerRequestContext",
    "PracticeEvaluationWorkflowContext",
    "PracticeEvaluationPipelineContext",
    "PracticeReviewWorkflowContext",
    "PracticePublicWorkflowContext",
    "PracticeSessionWorkflowContext",
    "practice_follow_up_idempotency_key",
    "practice_question_generation_idempotency_key",
]
