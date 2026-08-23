from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.agents.practice.evaluation import PracticeEvaluationAgent
from riva.agents.practice.evaluation_types import (
    EvaluationFollowUpExchange,
    EvaluationInput,
    EvaluationMainAnswer,
    EvaluationQuestionContext,
    PracticeEvaluationFollowUpCompletionReason,
)
from riva.agents.practice.follow_up import FollowUpAgent
from riva.agents.practice.follow_up_types import (
    FollowUpCompleteOutput,
    FollowUpInput,
    FollowUpPreviousExchange,
    FollowUpQuestionContext,
    FollowUpQuestionOutput,
)
from riva.agents.practice.interaction_types import (
    MAX_PRACTICE_FOLLOW_UPS,
    PracticeAnswerContent,
    PracticeAnswerKind,
    PracticeAnswerSnapshot,
)
from riva.agents.practice.recommendation import PracticeRecommendationAgent
from riva.agents.practice.recommendation_types import (
    PracticeRecommendationInput,
    PracticeRecommendationQuestionContext,
)
from riva.agents.practice.reference_types import (
    PracticeReferenceAnswerTargetType,
)
from riva.agents.practice.review import PracticeReviewAgent
from riva.agents.practice.review_types import PracticeReviewInput
from riva.integrations.llm import LLMProvider
from riva.models import (
    PracticeAnswer,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeRecommendation,
    PracticeReview,
    PracticeSession,
    QuestionCard,
    TargetRole,
)
from riva.services.practice.question_types import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.services.practice.questions import QuestionGenerationService
from riva.services.practice.reference_answer import (
    PracticeReferenceAnswerWorkflowState,
    ReferenceAnswerGenerationService,
)
from riva.services.practice.types import (
    PracticeAttemptStatus,
    PracticeQuestionSourceAvailability,
    PracticeSessionSelection,
    PracticeSetupCapabilitiesResponse,
)
from riva.services.practice.weakness import (
    PracticeWeaknessFocus,
    PracticeWeaknessService,
)
from riva.services.training.memory import TrainingMemoryService
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

PRACTICE_SESSION_NOT_FOUND: PracticeSessionStateErrorCode = "practice_session_not_found"
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

REUSED_QUESTION_SOURCES = frozenset({"saved", "history"})


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
    follow_up_decision: PracticeFollowUpDecision | None
    follow_up_question: PracticeFollowUpQuestion | None
    follow_up_exchanges: tuple[PracticeAnsweredFollowUpExchangeContext, ...] = field(
        default_factory=tuple,
        kw_only=True,
    )
    follow_up_completion_reason: PracticeEvaluationFollowUpCompletionReason | None = (
        field(default=None, kw_only=True)
    )


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
    evaluation: PracticeEvaluation
    review: PracticeReview | None = None
    recommendation: PracticeRecommendation | None = None


@dataclass(frozen=True)
class PracticeReviewWorkflowContext(PracticeEvaluationWorkflowContext):
    review: PracticeReview
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
    completed_attempt_review_contexts: tuple[PracticeReviewWorkflowContext, ...] = (
        field(default_factory=tuple, kw_only=True)
    )


PracticeEvaluationPipelineContext = PracticeEvaluationWorkflowContext
PracticePublicWorkflowContext = (
    PracticeSessionWorkflowContext
    | PracticePrimaryAnswerWorkflowContext
    | PracticeEvaluationWorkflowContext
    | PracticeReviewWorkflowContext
)


class PracticeSessionService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: LLMProvider | None = None,
        llm_model: str | None = None,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()
        self.clock = clock

    async def get_setup_capabilities(
        self,
        *,
        user_id: UUID,
        interaction_language: str,
    ) -> PracticeSetupCapabilitiesResponse:
        grouping = (
            QuestionCard.target_role_id,
            QuestionCard.question_type,
            QuestionCard.difficulty,
        )
        saved = await self.session.execute(
            select(*grouping, func.count(QuestionCard.id))
            .join(
                TargetRole,
                and_(
                    TargetRole.id == QuestionCard.target_role_id,
                    TargetRole.user_id == QuestionCard.user_id,
                ),
            )
            .where(
                QuestionCard.user_id == user_id,
                QuestionCard.language == interaction_language,
                QuestionCard.is_saved.is_(True),
                TargetRole.preparation_status != "archived",
            )
            .group_by(*grouping)
        )
        history = await self.session.execute(
            select(*grouping, func.count(func.distinct(QuestionCard.id)))
            .join(
                TargetRole,
                and_(
                    TargetRole.id == QuestionCard.target_role_id,
                    TargetRole.user_id == QuestionCard.user_id,
                ),
            )
            .join(
                PracticeAttempt,
                and_(
                    PracticeAttempt.question_card_id == QuestionCard.id,
                    PracticeAttempt.user_id == user_id,
                    PracticeAttempt.status == PracticeAttemptStatus.COMPLETED.value,
                ),
            )
            .where(
                QuestionCard.user_id == user_id,
                QuestionCard.language == interaction_language,
                TargetRole.preparation_status != "archived",
            )
            .group_by(*grouping)
        )
        counts: dict[tuple[UUID, str, str], dict[str, int]] = {}
        for role_id, question_type, difficulty, count in saved.all():
            counts[(role_id, question_type, difficulty)] = {
                "saved": int(count),
                "history": 0,
            }
        for role_id, question_type, difficulty, count in history.all():
            counts.setdefault(
                (role_id, question_type, difficulty),
                {"saved": 0, "history": 0},
            )["history"] = int(count)
        availability = [
            PracticeQuestionSourceAvailability(
                target_role_id=role_id,
                question_type=question_type,
                difficulty=difficulty,
                saved_question_count=values["saved"],
                history_question_count=values["history"],
            )
            for (role_id, question_type, difficulty), values in sorted(
                counts.items(), key=lambda item: tuple(str(v) for v in item[0])
            )
        ]
        can_prioritize = await PracticeWeaknessService(
            self.session
        ).has_eligible_weakness(
            user_id=user_id,
            interaction_language=interaction_language,
        )
        return PracticeSetupCapabilitiesResponse(
            saved_question_count=sum(
                item.saved_question_count for item in availability
            ),
            history_question_count=sum(
                item.history_question_count for item in availability
            ),
            question_source_availability=availability,
            can_prioritize_weaknesses=can_prioritize,
        )

    async def start_session(
        self,
        *,
        user_id: UUID,
        selection: PracticeSessionSelection,
        interaction_language: str,
    ) -> PracticePublicWorkflowContext:
        try:
            active = await self._active_session(user_id, for_update=True)
            if active is not None:
                if not self._same_intent(active, selection, interaction_language):
                    raise PracticeSessionStateError(PRACTICE_SESSION_ALREADY_ACTIVE)
                return await self._active_context(active)
            if selection.prioritize_weaknesses and not await PracticeWeaknessService(
                self.session
            ).has_eligible_weakness(
                user_id=user_id,
                interaction_language=interaction_language,
            ):
                raise PracticeSessionStateError(
                    PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE
                )
            card = None
            if selection.source.value in REUSED_QUESTION_SOURCES:
                card = await self._reused_card(
                    user_id=user_id,
                    selection=selection,
                    language=interaction_language,
                )
                if card is None:
                    raise PracticeSessionStateError(PRACTICE_SESSION_SOURCE_UNAVAILABLE)
            now = self.clock()
            session = PracticeSession(
                id=uuid4(),
                user_id=user_id,
                target_role_id=selection.target_role_id,
                language=interaction_language,
                version=1,
                status="active",
                initial_question_type=selection.question_type.value,
                initial_difficulty=selection.difficulty.value,
                source=selection.source.value,
                prioritize_weaknesses=selection.prioritize_weaknesses,
                started_at=now,
                created_at=now,
                updated_at=now,
            )
            self.session.add(session)
            await self.session.flush()
            attempt = await self._create_attempt(
                session=session,
                attempt_number=1,
                question_type=selection.question_type,
                difficulty=selection.difficulty,
                card=card,
                retry_of=None,
            )
            if card is None:
                focus = await self._weakness_focus(
                    session=session,
                    question_type=selection.question_type,
                )
                card = await self._generate_question(
                    user_id=user_id,
                    session=session,
                    question_type=selection.question_type,
                    difficulty=selection.difficulty,
                    weakness_focus=focus,
                )
                attempt.question_card = card
                attempt.question_card_id = card.id
            attempt.status = PracticeAttemptStatus.ANSWERING.value
            await self.session.commit()
            return PracticeSessionWorkflowContext(session, attempt, card)
        except PracticeSessionStateError:
            await self.session.rollback()
            raise
        except Exception as error:
            await self.session.rollback()
            if isinstance(error, ValueError):
                raise PracticeSessionStateError(
                    PRACTICE_QUESTION_GENERATION_UNAVAILABLE
                ) from None
            raise

    async def continue_to_next_question(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
    ) -> PracticeSessionWorkflowContext:
        session, current = await self._load_current(
            user_id, session_id, expected_version
        )
        if (
            current.status != PracticeAttemptStatus.REVIEW.value
            or current.question_card_id != question_id
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if current.recommendation is None:
            raise PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
            )
        question_type = QuestionCardQuestionType(
            current.recommendation.next_question_type or current.question_type
        )
        difficulty = QuestionCardDifficulty(
            current.recommendation.next_difficulty or current.difficulty
        )
        try:
            current.status = PracticeAttemptStatus.COMPLETED.value
            current.completed_at = self.clock()
            card = None
            if session.source in REUSED_QUESTION_SOURCES:
                card = await self._reused_card(
                    user_id=user_id,
                    selection=PracticeSessionSelection(
                        target_role_id=session.target_role_id,
                        question_type=question_type,
                        difficulty=difficulty,
                        source=session.source,
                        prioritize_weaknesses=session.prioritize_weaknesses,
                    ),
                    language=session.language,
                    exclude_id=current.question_card_id,
                )
                if card is None:
                    raise PracticeSessionStateError(PRACTICE_SESSION_SOURCE_UNAVAILABLE)
            attempt = await self._create_attempt(
                session=session,
                attempt_number=current.attempt_number + 1,
                question_type=question_type,
                difficulty=difficulty,
                card=card,
                retry_of=None,
            )
            if card is None:
                card = await self._generate_question(
                    user_id=user_id,
                    session=session,
                    question_type=question_type,
                    difficulty=difficulty,
                    weakness_focus=await self._weakness_focus(
                        session=session,
                        question_type=question_type,
                    ),
                )
                attempt.question_card = card
                attempt.question_card_id = card.id
            attempt.status = PracticeAttemptStatus.ANSWERING.value
            session.version += 1
            session.updated_at = self.clock()
            await self.session.commit()
            return PracticeSessionWorkflowContext(session, attempt, card)
        except PracticeSessionStateError:
            await self.session.rollback()
            raise
        except Exception:
            await self.session.rollback()
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_FAILED
            ) from None

    async def skip_current_question(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
    ) -> PracticeSessionWorkflowContext:
        session, current = await self._load_current(
            user_id, session_id, expected_version
        )
        if (
            current.status != PracticeAttemptStatus.ANSWERING.value
            or current.question_card_id != question_id
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        current.status = PracticeAttemptStatus.COMPLETED.value
        current.completed_at = self.clock()
        try:
            card = None
            if session.source in REUSED_QUESTION_SOURCES:
                card = await self._reused_card(
                    user_id=user_id,
                    selection=PracticeSessionSelection(
                        target_role_id=session.target_role_id,
                        question_type=QuestionCardQuestionType(current.question_type),
                        difficulty=QuestionCardDifficulty(current.difficulty),
                        source=session.source,
                        prioritize_weaknesses=session.prioritize_weaknesses,
                    ),
                    language=session.language,
                    exclude_id=current.question_card_id,
                )
                if card is None:
                    raise PracticeSessionStateError(PRACTICE_SESSION_SOURCE_UNAVAILABLE)
            attempt = await self._create_attempt(
                session=session,
                attempt_number=current.attempt_number + 1,
                question_type=QuestionCardQuestionType(current.question_type),
                difficulty=QuestionCardDifficulty(current.difficulty),
                card=card,
                retry_of=None,
            )
            if card is None:
                card = await self._generate_question(
                    user_id=user_id,
                    session=session,
                    question_type=QuestionCardQuestionType(current.question_type),
                    difficulty=QuestionCardDifficulty(current.difficulty),
                    weakness_focus=await self._weakness_focus(
                        session=session,
                        question_type=QuestionCardQuestionType(current.question_type),
                    ),
                )
                attempt.question_card = card
                attempt.question_card_id = card.id
            attempt.status = PracticeAttemptStatus.ANSWERING.value
            session.version += 1
            session.updated_at = self.clock()
            await self.session.commit()
            return PracticeSessionWorkflowContext(session, attempt, card)
        except PracticeSessionStateError:
            await self.session.rollback()
            raise
        except Exception:
            await self.session.rollback()
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_FAILED
            ) from None

    async def retry_current_question(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
    ) -> PracticeSessionWorkflowContext:
        session, current = await self._load_current(
            user_id, session_id, expected_version
        )
        if (
            current.status != PracticeAttemptStatus.REVIEW.value
            or current.question_card_id != question_id
            or current.question_card is None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        try:
            current.status = PracticeAttemptStatus.COMPLETED.value
            current.completed_at = self.clock()
            attempt = await self._create_attempt(
                session=session,
                attempt_number=current.attempt_number + 1,
                question_type=QuestionCardQuestionType(current.question_type),
                difficulty=QuestionCardDifficulty(current.difficulty),
                card=current.question_card,
                retry_of=current,
            )
            session.version += 1
            session.status = "active"
            session.completed_at = None
            session.completion_reason = None
            session.updated_at = self.clock()
            await self.session.commit()
            return PracticeSessionWorkflowContext(
                session, attempt, current.question_card
            )
        except Exception:
            await self.session.rollback()
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT) from None

    async def submit_primary_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        content: PracticeAnswerContent,
    ) -> PracticePublicWorkflowContext:
        session, attempt = await self._load_current(
            user_id, session_id, expected_version
        )
        card = attempt.question_card
        if (
            attempt.status != PracticeAttemptStatus.ANSWERING.value
            or card is None
            or card.id != question_id
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        try:
            answer = PracticeAnswer(
                id=uuid4(),
                attempt_id=attempt.id,
                kind=PracticeAnswerKind.MAIN.value,
                order=1,
                content=content,
                submitted_at=self.clock(),
            )
            self.session.add(answer)
            await self.session.flush()
            decision, question = await self._generate_follow_up(
                session=session,
                attempt=attempt,
                card=card,
                main_answer=answer,
                next_order=1,
            )
            if decision.action == "complete":
                return await self._finish_pipeline(
                    session=session,
                    attempt=attempt,
                    card=card,
                    main_answer=answer,
                    reason=PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED,
                    unanswered_question=None,
                )
            attempt.status = PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
            session.version += 1
            session.updated_at = self.clock()
            await self.session.commit()
            return self._primary_context(
                session, attempt, card, answer, decision, question
            )
        except PracticeSessionStateError:
            await self.session.rollback()
            raise
        except Exception:
            await self.session.rollback()
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_FAILED
            ) from None

    async def submit_follow_up_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        follow_up_question_id: UUID,
        content: PracticeAnswerContent,
    ) -> PracticePublicWorkflowContext:
        session, attempt = await self._load_current(
            user_id, session_id, expected_version
        )
        card = attempt.question_card
        follow_up = next(
            (
                item
                for item in attempt.follow_up_questions
                if item.id == follow_up_question_id
            ),
            None,
        )
        main = self._main_answer(attempt)
        if (
            attempt.status != PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
            or card is None
            or card.id != question_id
            or follow_up is None
            or follow_up.answer is not None
            or main is None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        try:
            answer = PracticeAnswer(
                id=uuid4(),
                attempt_id=attempt.id,
                kind=PracticeAnswerKind.FOLLOW_UP.value,
                order=follow_up.order + 1,
                content=content,
                follow_up_question_id=follow_up.id,
                submitted_at=self.clock(),
            )
            self.session.add(answer)
            await self.session.flush()
            next_order = follow_up.order + 1
            if next_order <= MAX_PRACTICE_FOLLOW_UPS:
                decision, next_question = await self._generate_follow_up(
                    session=session,
                    attempt=attempt,
                    card=card,
                    main_answer=main,
                    next_order=next_order,
                )
                if decision.action == "askFollowUp":
                    attempt.status = PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
                    session.version += 1
                    session.updated_at = self.clock()
                    await self.session.commit()
                    return self._primary_context(
                        session,
                        attempt,
                        card,
                        main,
                        decision,
                        next_question,
                    )
            return await self._finish_pipeline(
                session=session,
                attempt=attempt,
                card=card,
                main_answer=main,
                reason=PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED,
                unanswered_question=None,
            )
        except PracticeSessionStateError:
            await self.session.rollback()
            raise
        except Exception:
            await self.session.rollback()
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_FAILED
            ) from None

    async def end_follow_ups(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        follow_up_question_id: UUID,
    ) -> PracticeReviewWorkflowContext:
        session, attempt = await self._load_current(
            user_id, session_id, expected_version
        )
        card = attempt.question_card
        main = self._main_answer(attempt)
        question = next(
            (
                item
                for item in attempt.follow_up_questions
                if item.id == follow_up_question_id
            ),
            None,
        )
        if (
            attempt.status != PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
            or card is None
            or card.id != question_id
            or question is None
            or question.answer is not None
            or main is None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        try:
            return await self._finish_pipeline(
                session=session,
                attempt=attempt,
                card=card,
                main_answer=main,
                reason=PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY,
                unanswered_question=question,
            )
        except PracticeSessionStateError:
            await self.session.rollback()
            raise
        except Exception:
            await self.session.rollback()
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_FAILED
            ) from None

    async def request_question_reference_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
    ) -> None:
        context = await self._reference_context(
            user_id=user_id,
            session_id=session_id,
            expected_version=expected_version,
            question_id=question_id,
            follow_up_question_id=None,
        )
        await ReferenceAnswerGenerationService(
            self.session,
            llm_provider=self.llm_provider,
            llm_model=self.llm_model,
        ).generate_main(
            user_id=user_id,
            question_card=context.question_card,
            language=context.session.language,
        )
        await self.session.commit()

    async def request_follow_up_reference_answer(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        follow_up_question_id: UUID,
    ) -> None:
        context = await self._reference_context(
            user_id=user_id,
            session_id=session_id,
            expected_version=expected_version,
            question_id=question_id,
            follow_up_question_id=follow_up_question_id,
        )
        await ReferenceAnswerGenerationService(
            self.session,
            llm_provider=self.llm_provider,
            llm_model=self.llm_model,
        ).generate_follow_up(
            user_id=user_id,
            question_card=context.question_card,
            follow_up_question=context.follow_up_question,
            attempt=context.attempt,
            language=context.session.language,
        )
        await self.session.commit()

    async def reveal_question_hint(
        self, **kwargs: object
    ) -> PracticePublicWorkflowContext:
        return await self._set_card_guidance(reveal_hint=True, **kwargs)  # type: ignore[arg-type]

    async def reveal_question_framework(
        self, **kwargs: object
    ) -> PracticePublicWorkflowContext:
        return await self._set_card_guidance(reveal_framework=True, **kwargs)  # type: ignore[arg-type]

    async def reveal_follow_up_hint(
        self, **kwargs: object
    ) -> PracticePublicWorkflowContext:
        return await self._set_follow_up_guidance(reveal_hint=True, **kwargs)  # type: ignore[arg-type]

    async def reveal_follow_up_framework(
        self, **kwargs: object
    ) -> PracticePublicWorkflowContext:
        return await self._set_follow_up_guidance(reveal_framework=True, **kwargs)  # type: ignore[arg-type]

    async def set_question_saved(
        self, **kwargs: object
    ) -> PracticePublicWorkflowContext:
        return await self._set_card_flag(flag="is_saved", **kwargs)  # type: ignore[arg-type]

    async def set_question_weak(
        self, **kwargs: object
    ) -> PracticePublicWorkflowContext:
        return await self._set_card_flag(flag="is_marked_weak", **kwargs)  # type: ignore[arg-type]

    async def complete_session_after_review(
        self, *, user_id: UUID, session_id: UUID, expected_version: int
    ) -> PracticeCompletedSessionWorkflowContext:
        session, current = await self._load_current(
            user_id, session_id, expected_version
        )
        if current.status != PracticeAttemptStatus.REVIEW.value:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        reviews = await self._review_contexts(session)
        final = self._review_context_from_attempt(session, current)
        now = self.clock()
        current.status = PracticeAttemptStatus.COMPLETED.value
        current.completed_at = now
        session.status = "completed"
        session.completion_reason = "reviewCompleted"
        session.completed_at = now
        session.version += 1
        session.updated_at = now
        await self.session.commit()
        return PracticeCompletedSessionWorkflowContext(
            session=session,
            final_attempt=current,
            final_review_context=final,
            attempt_review_contexts=tuple(reviews),
        )

    async def end_session_early(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
    ) -> PracticeEndedEarlySessionWorkflowContext:
        session, current = await self._load_current(
            user_id, session_id, expected_version
        )
        if current.question_card is None or current.question_card.id != question_id:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if current.status not in {
            PracticeAttemptStatus.ANSWERING.value,
            PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value,
        }:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        question_context = PracticeSessionWorkflowContext(
            session, current, current.question_card
        )
        now = self.clock()
        current.status = PracticeAttemptStatus.ENDED_EARLY.value
        current.completed_at = now
        session.status = "completed"
        session.completion_reason = "userEndedEarly"
        session.completed_at = now
        session.version += 1
        session.updated_at = now
        completed = await self._review_contexts(session)
        await self.session.commit()
        return PracticeEndedEarlySessionWorkflowContext(
            session=session,
            unfinished_attempt=current,
            question_context=question_context,
            completed_attempt_review_contexts=tuple(completed),
        )

    async def get_session_context(
        self, *, user_id: UUID, session_id: UUID
    ) -> (
        PracticePublicWorkflowContext
        | PracticeCompletedSessionWorkflowContext
        | PracticeEndedEarlySessionWorkflowContext
    ):
        session = await self._load_session(user_id, session_id)
        if session.status == "completed":
            return await self._completed_context(session)
        return await self._active_context(session)

    async def get_active_session_context(
        self, *, user_id: UUID
    ) -> (
        PracticePublicWorkflowContext
        | PracticeCompletedSessionWorkflowContext
        | PracticeEndedEarlySessionWorkflowContext
        | None
    ):
        session = await self._active_session(user_id, for_update=False)
        if session is None:
            return None
        return await self._active_context(session)

    async def _generate_question(
        self,
        *,
        user_id: UUID,
        session: PracticeSession,
        question_type: QuestionCardQuestionType,
        difficulty: QuestionCardDifficulty,
        weakness_focus: PracticeWeaknessFocus,
    ) -> QuestionCard:
        if self.llm_provider is None or not self.llm_model:
            raise PracticeSessionStateError(PRACTICE_QUESTION_GENERATION_UNAVAILABLE)
        try:
            return await QuestionGenerationService(
                self.session,
                llm_provider=self.llm_provider,
                llm_model=self.llm_model,
            ).generate(
                user_id=user_id,
                target_role_id=session.target_role_id,
                question_type=question_type,
                difficulty=difficulty,
                interaction_language=session.language,
                weakness_focus=weakness_focus,
                commit=False,
            )
        except PracticeSessionStateError:
            raise
        except Exception:
            raise PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_FAILED
            ) from None

    async def _generate_follow_up(
        self,
        *,
        session: PracticeSession,
        attempt: PracticeAttempt,
        card: QuestionCard,
        main_answer: PracticeAnswer,
        next_order: int,
    ) -> tuple[PracticeFollowUpDecision, PracticeFollowUpQuestion | None]:
        if self.llm_provider is None or not self.llm_model:
            raise PracticeSessionStateError(PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE)
        input_snapshot = FollowUpInput(
            interaction_language=session.language,
            question=FollowUpQuestionContext(
                prompt=card.prompt,
                question_type=card.question_type,
                difficulty=card.difficulty,
                assessed_capabilities=card.assessed_capabilities,
                follow_up_directions=card.follow_up_directions,
                scoring_focus=card.scoring_focus,
            ),
            main_answer=PracticeAnswerSnapshot(content=main_answer.content, order=1),
            previous_follow_ups=[
                FollowUpPreviousExchange(
                    order=question.order,
                    prompt=question.prompt,
                    answer=question.answer.content,
                )
                for question in attempt.follow_up_questions
                if question.answer is not None
            ],
            next_follow_up_order=next_order,
        )
        try:
            output = (
                await FollowUpAgent(self.llm_provider, self.llm_model).run(
                    input_snapshot
                )
            ).output
        except Exception:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_FAILED
            ) from None
        decision = PracticeFollowUpDecision(
            id=uuid4(),
            attempt_id=attempt.id,
            order=next_order,
            action=(
                "complete"
                if isinstance(output, FollowUpCompleteOutput)
                else "askFollowUp"
            ),
            created_at=self.clock(),
        )
        question = None
        if isinstance(output, FollowUpQuestionOutput):
            question = PracticeFollowUpQuestion(
                id=uuid4(),
                attempt_id=attempt.id,
                order=next_order,
                prompt=output.prompt,
                focus=output.focus,
                answer_hints=output.answer_hints,
                answer_framework=output.answer_framework,
                created_at=self.clock(),
            )
            decision.follow_up_question = question
            self.session.add(question)
        self.session.add(decision)
        await self.session.flush()
        return decision, question

    async def _finish_pipeline(
        self,
        *,
        session: PracticeSession,
        attempt: PracticeAttempt,
        card: QuestionCard,
        main_answer: PracticeAnswer,
        reason: PracticeEvaluationFollowUpCompletionReason,
        unanswered_question: PracticeFollowUpQuestion | None,
    ) -> PracticeReviewWorkflowContext:
        if self.llm_provider is None or not self.llm_model:
            raise PracticeSessionStateError(PRACTICE_EVALUATION_GENERATION_UNAVAILABLE)
        evaluation_input = self._evaluation_input(
            session, attempt, card, main_answer, reason
        )
        try:
            evaluation_output = (
                await PracticeEvaluationAgent(self.llm_provider, self.llm_model).run(
                    evaluation_input
                )
            ).output
            review_input = PracticeReviewInput(
                interaction_language=evaluation_input.interaction_language,
                question=evaluation_input.question,
                main_answer=evaluation_input.main_answer,
                follow_up_exchanges=evaluation_input.follow_up_exchanges,
                follow_up_completion_reason=evaluation_input.follow_up_completion_reason,
                evaluation=evaluation_output,
            )
            review_output = (
                await PracticeReviewAgent(self.llm_provider, self.llm_model).run(
                    review_input
                )
            ).output
            recommendation_input = PracticeRecommendationInput(
                interaction_language=session.language,
                question=PracticeRecommendationQuestionContext(
                    prompt=card.prompt,
                    question_type=card.question_type,
                    difficulty=card.difficulty,
                    assessed_capabilities=card.assessed_capabilities,
                    scoring_focus=card.scoring_focus,
                ),
                follow_up_completion_reason=reason,
                evaluation=evaluation_output,
                review=review_output,
                training_memory=await TrainingMemoryService(self.session).get_context(
                    session.user_id
                ),
            )
            recommendation_output = (
                await PracticeRecommendationAgent(
                    self.llm_provider,
                    self.llm_model,
                ).run(recommendation_input)
            ).output
        except Exception:
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_FAILED
            ) from None

        evaluation = PracticeEvaluation(
            id=uuid4(),
            attempt_id=attempt.id,
            overall_score=evaluation_output.overall_score,
            dimension_scores=[
                item.model_dump(mode="json", by_alias=True)
                for item in evaluation_output.dimension_scores
            ],
            focus_assessments=[
                item.model_dump(mode="json", by_alias=True)
                for item in evaluation_output.focus_assessments
            ],
            evaluated_at=self.clock(),
        )
        review = PracticeReview(
            id=uuid4(),
            attempt_id=attempt.id,
            overall_performance=review_output.overall_performance,
            highlights=review_output.highlights,
            main_issues=review_output.main_issues,
            improvement_suggestions=review_output.improvement_suggestions,
            reusable_answer_structure=review_output.reusable_answer_structure,
            exposed_weaknesses=review_output.exposed_weaknesses,
            reviewed_at=self.clock(),
        )
        next_question = getattr(recommendation_output, "next_question", None)
        recommendation = PracticeRecommendation(
            id=uuid4(),
            attempt_id=attempt.id,
            action=recommendation_output.action.value,
            reason=recommendation_output.reason,
            next_question_type=next_question.question_type.value
            if next_question
            else None,
            next_difficulty=next_question.difficulty.value if next_question else None,
            focus_areas=next_question.focus_areas if next_question else [],
            recommended_at=self.clock(),
        )
        attempt.evaluation = evaluation
        attempt.review = review
        attempt.recommendation = recommendation
        attempt.status = PracticeAttemptStatus.REVIEW.value
        session.version += 1
        session.updated_at = self.clock()
        await self.session.flush()
        return PracticeReviewWorkflowContext(
            session=session,
            attempt=attempt,
            question_card=card,
            main_answer=main_answer,
            follow_up_decision=self._last_decision(attempt),
            follow_up_question=unanswered_question,
            follow_up_exchanges=tuple(self._answered_exchanges(attempt)),
            follow_up_completion_reason=reason,
            evaluation=evaluation,
            review=review,
            recommendation=recommendation,
        )

    def _evaluation_input(
        self,
        session: PracticeSession,
        attempt: PracticeAttempt,
        card: QuestionCard,
        main_answer: PracticeAnswer,
        reason: PracticeEvaluationFollowUpCompletionReason,
    ) -> EvaluationInput:
        return EvaluationInput(
            interaction_language=session.language,
            question=EvaluationQuestionContext(
                prompt=card.prompt,
                question_type=card.question_type,
                difficulty=card.difficulty,
                assessed_capabilities=card.assessed_capabilities,
                scoring_focus=card.scoring_focus,
            ),
            main_answer=EvaluationMainAnswer(content=main_answer.content),
            follow_up_exchanges=[
                EvaluationFollowUpExchange(
                    order=question.order,
                    prompt=question.prompt,
                    focus=question.focus,
                    answer=question.answer.content,
                )
                for question in attempt.follow_up_questions
                if question.answer is not None
            ],
            follow_up_completion_reason=reason,
        )

    async def _load_current(
        self,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
    ) -> tuple[PracticeSession, PracticeAttempt]:
        session = await self._load_session(user_id, session_id, for_update=True)
        if session.status != "active":
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if session.version != expected_version:
            raise PracticeSessionStateError(PRACTICE_SESSION_VERSION_CONFLICT)
        attempt = max(
            session.attempts, key=lambda value: value.attempt_number, default=None
        )
        if attempt is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        return session, attempt

    async def _load_session(
        self,
        user_id: UUID,
        session_id: UUID,
        *,
        for_update: bool = False,
    ) -> PracticeSession:
        statement = (
            select(PracticeSession)
            .options(*self._load_options())
            .where(
                PracticeSession.id == session_id,
                PracticeSession.user_id == user_id,
            )
        )
        if for_update:
            statement = statement.with_for_update()
        session = await self.session.scalar(statement)
        if session is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_NOT_FOUND)
        return session

    async def _active_session(
        self, user_id: UUID, *, for_update: bool
    ) -> PracticeSession | None:
        statement = (
            select(PracticeSession)
            .options(*self._load_options())
            .where(
                PracticeSession.user_id == user_id, PracticeSession.status == "active"
            )
            .order_by(PracticeSession.created_at.desc(), PracticeSession.id.desc())
            .limit(1)
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    @staticmethod
    def _load_options():
        return (
            selectinload(PracticeSession.attempts).selectinload(
                PracticeAttempt.question_card
            ),
            selectinload(PracticeSession.attempts).selectinload(
                PracticeAttempt.answers
            ),
            selectinload(PracticeSession.attempts)
            .selectinload(PracticeAttempt.follow_up_questions)
            .selectinload(PracticeFollowUpQuestion.answer),
            selectinload(PracticeSession.attempts).selectinload(
                PracticeAttempt.follow_up_decisions
            ),
            selectinload(PracticeSession.attempts).selectinload(
                PracticeAttempt.evaluation
            ),
            selectinload(PracticeSession.attempts).selectinload(PracticeAttempt.review),
            selectinload(PracticeSession.attempts).selectinload(
                PracticeAttempt.recommendation
            ),
        )

    async def _active_context(
        self, session: PracticeSession
    ) -> PracticePublicWorkflowContext:
        attempt = max(
            session.attempts, key=lambda value: value.attempt_number, default=None
        )
        if attempt is None or attempt.question_card is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if attempt.status == PracticeAttemptStatus.ANSWERING.value:
            return PracticeSessionWorkflowContext(
                session, attempt, attempt.question_card
            )
        main = self._main_answer(attempt)
        if main is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if attempt.status == PracticeAttemptStatus.REVIEW.value:
            return self._review_context_from_attempt(session, attempt)
        if attempt.status in {
            PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value,
        }:
            decision = self._last_decision(attempt)
            question = self._current_follow_up(attempt)
            return self._primary_context(
                session, attempt, attempt.question_card, main, decision, question
            )
        raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

    async def _completed_context(
        self, session: PracticeSession
    ) -> (
        PracticeCompletedSessionWorkflowContext
        | PracticeEndedEarlySessionWorkflowContext
    ):
        attempt = max(
            session.attempts, key=lambda value: value.attempt_number, default=None
        )
        if attempt is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        reviews = tuple(await self._review_contexts(session))
        if session.completion_reason == "userEndedEarly":
            if attempt.question_card is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            return PracticeEndedEarlySessionWorkflowContext(
                session=session,
                unfinished_attempt=attempt,
                question_context=PracticeSessionWorkflowContext(
                    session, attempt, attempt.question_card
                ),
                completed_attempt_review_contexts=reviews,
            )
        final = self._review_context_from_attempt(session, attempt)
        return PracticeCompletedSessionWorkflowContext(
            session=session,
            final_attempt=attempt,
            final_review_context=final,
            attempt_review_contexts=reviews,
        )

    async def _review_contexts(
        self, session: PracticeSession
    ) -> list[PracticeReviewWorkflowContext]:
        return [
            self._review_context_from_attempt(session, attempt)
            for attempt in session.attempts
            if attempt.review is not None
            and attempt.evaluation is not None
            and attempt.recommendation is not None
            and attempt.question_card is not None
            and self._main_answer(attempt) is not None
        ]

    def _review_context_from_attempt(
        self, session: PracticeSession, attempt: PracticeAttempt
    ) -> PracticeReviewWorkflowContext:
        card = attempt.question_card
        main = self._main_answer(attempt)
        if (
            card is None
            or main is None
            or attempt.evaluation is None
            or attempt.review is None
            or attempt.recommendation is None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        reason = self._completion_reason(attempt)
        return PracticeReviewWorkflowContext(
            session=session,
            attempt=attempt,
            question_card=card,
            main_answer=main,
            follow_up_decision=self._last_decision(attempt),
            follow_up_question=self._unanswered_follow_up(attempt),
            follow_up_exchanges=tuple(self._answered_exchanges(attempt)),
            follow_up_completion_reason=reason,
            evaluation=attempt.evaluation,
            review=attempt.review,
            recommendation=attempt.recommendation,
        )

    def _primary_context(
        self,
        session: PracticeSession,
        attempt: PracticeAttempt,
        card: QuestionCard,
        main: PracticeAnswer,
        decision: PracticeFollowUpDecision | None,
        question: PracticeFollowUpQuestion | None,
    ) -> PracticePrimaryAnswerWorkflowContext:
        return PracticePrimaryAnswerWorkflowContext(
            session=session,
            attempt=attempt,
            question_card=card,
            main_answer=main,
            follow_up_decision=decision,
            follow_up_question=question,
            follow_up_exchanges=tuple(self._answered_exchanges(attempt)),
        )

    async def _create_attempt(
        self,
        *,
        session: PracticeSession,
        attempt_number: int,
        question_type: QuestionCardQuestionType,
        difficulty: QuestionCardDifficulty,
        card: QuestionCard | None,
        retry_of: PracticeAttempt | None,
    ) -> PracticeAttempt:
        attempt = PracticeAttempt(
            id=uuid4(),
            user_id=session.user_id,
            session_id=session.id,
            attempt_number=attempt_number,
            question_type=question_type.value,
            difficulty=difficulty.value,
            status=PracticeAttemptStatus.ANSWERING.value,
            question_card_id=card.id if card is not None else None,
            retry_of_attempt_id=retry_of.id if retry_of is not None else None,
            created_at=self.clock(),
            updated_at=self.clock(),
        )
        if card is not None:
            attempt.question_card = card
        self.session.add(attempt)
        await self.session.flush()
        return attempt

    async def _weakness_focus(
        self, *, session: PracticeSession, question_type: QuestionCardQuestionType
    ) -> PracticeWeaknessFocus:
        if not session.prioritize_weaknesses:
            return PracticeWeaknessFocus()
        return await PracticeWeaknessService(self.session).get_focus(
            user_id=session.user_id,
            target_role_id=session.target_role_id,
            question_type=question_type,
            interaction_language=session.language,
        )

    async def _reused_card(
        self,
        *,
        user_id: UUID,
        selection: PracticeSessionSelection,
        language: str,
        exclude_id: UUID | None = None,
    ) -> QuestionCard | None:
        statement = select(QuestionCard).where(
            QuestionCard.user_id == user_id,
            QuestionCard.target_role_id == selection.target_role_id,
            QuestionCard.language == language,
            QuestionCard.question_type == selection.question_type.value,
            QuestionCard.difficulty == selection.difficulty.value,
        )
        if exclude_id is not None:
            statement = statement.where(QuestionCard.id != exclude_id)
        if selection.source.value == "saved":
            statement = statement.where(QuestionCard.is_saved.is_(True))
        else:
            statement = statement.join(
                PracticeAttempt,
                PracticeAttempt.question_card_id == QuestionCard.id,
            ).where(PracticeAttempt.status == PracticeAttemptStatus.COMPLETED.value)
        return await self.session.scalar(
            statement.order_by(
                QuestionCard.created_at.asc(), QuestionCard.id.asc()
            ).limit(1)
        )

    async def _reference_context(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        follow_up_question_id: UUID | None,
    ) -> PracticeReferenceAnswerRequestContext:
        session, attempt = await self._load_current(
            user_id, session_id, expected_version
        )
        card = attempt.question_card
        follow_up = (
            next(
                (
                    item
                    for item in attempt.follow_up_questions
                    if item.id == follow_up_question_id
                ),
                None,
            )
            if follow_up_question_id is not None
            else None
        )
        if (
            card is None
            or card.id != question_id
            or (follow_up_question_id and follow_up is None)
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        return PracticeReferenceAnswerRequestContext(
            target_type=(
                PracticeReferenceAnswerTargetType.FOLLOW_UP
                if follow_up is not None
                else PracticeReferenceAnswerTargetType.MAIN
            ),
            session=session,
            attempt=attempt,
            question_card=card,
            follow_up_question=follow_up,
            generation_state=PracticeReferenceAnswerWorkflowState.not_requested(),
        )

    async def _set_card_flag(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        flag: Literal["is_saved", "is_marked_weak"],
        **kwargs: object,
    ) -> PracticePublicWorkflowContext:
        session, attempt = await self._load_current(
            user_id, session_id, expected_version
        )
        if attempt.question_card is None or attempt.question_card.id != question_id:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        value = (
            kwargs.get("is_saved")
            if flag == "is_saved"
            else kwargs.get("is_marked_weak")
        )
        setattr(attempt.question_card, flag, bool(value))
        session.version += 1
        session.updated_at = self.clock()
        await self.session.commit()
        return await self._active_context(session)

    async def _set_card_guidance(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        reveal_hint: bool = False,
        reveal_framework: bool = False,
    ) -> PracticePublicWorkflowContext:
        session, attempt = await self._load_current(
            user_id, session_id, expected_version
        )
        card = attempt.question_card
        if card is None or card.id != question_id:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if reveal_hint:
            card.answer_hints_revealed = True
        if reveal_framework:
            card.answer_framework_revealed = True
        session.version += 1
        session.updated_at = self.clock()
        await self.session.commit()
        return await self._active_context(session)

    async def _set_follow_up_guidance(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        expected_version: int,
        question_id: UUID,
        follow_up_question_id: UUID,
        reveal_hint: bool = False,
        reveal_framework: bool = False,
    ) -> PracticePublicWorkflowContext:
        session, attempt = await self._load_current(
            user_id, session_id, expected_version
        )
        question = next(
            (
                item
                for item in attempt.follow_up_questions
                if item.id == follow_up_question_id
            ),
            None,
        )
        if (
            attempt.question_card is None
            or attempt.question_card.id != question_id
            or question is None
        ):
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if reveal_hint:
            question.answer_hints_revealed = True
        if reveal_framework:
            question.answer_framework_revealed = True
        session.version += 1
        session.updated_at = self.clock()
        await self.session.commit()
        return await self._active_context(session)

    @staticmethod
    def _same_intent(
        session: PracticeSession,
        selection: PracticeSessionSelection,
        language: str,
    ) -> bool:
        return (
            session.target_role_id == selection.target_role_id
            and session.language == language
            and session.initial_question_type == selection.question_type.value
            and session.initial_difficulty == selection.difficulty.value
            and session.source == selection.source.value
            and session.prioritize_weaknesses == selection.prioritize_weaknesses
        )

    @staticmethod
    def _main_answer(attempt: PracticeAttempt) -> PracticeAnswer | None:
        return next((answer for answer in attempt.answers if answer.order == 1), None)

    @staticmethod
    def _last_decision(attempt: PracticeAttempt) -> PracticeFollowUpDecision | None:
        return max(
            attempt.follow_up_decisions, key=lambda item: item.order, default=None
        )

    @staticmethod
    def _current_follow_up(attempt: PracticeAttempt) -> PracticeFollowUpQuestion | None:
        decision = PracticeSessionService._last_decision(attempt)
        if decision is None or decision.action != "askFollowUp":
            return None
        return next(
            (
                question
                for question in attempt.follow_up_questions
                if question.id == decision.follow_up_question_id
            ),
            None,
        )

    @staticmethod
    def _unanswered_follow_up(
        attempt: PracticeAttempt,
    ) -> PracticeFollowUpQuestion | None:
        return next(
            (
                question
                for question in attempt.follow_up_questions
                if question.answer is None
            ),
            None,
        )

    @staticmethod
    def _answered_exchanges(
        attempt: PracticeAttempt,
    ) -> list[PracticeAnsweredFollowUpExchangeContext]:
        return [
            PracticeAnsweredFollowUpExchangeContext(question, question.answer)
            for question in sorted(
                attempt.follow_up_questions, key=lambda item: item.order
            )
            if question.answer is not None
        ]

    @staticmethod
    def _completion_reason(
        attempt: PracticeAttempt,
    ) -> PracticeEvaluationFollowUpCompletionReason:
        if PracticeSessionService._unanswered_follow_up(attempt) is not None:
            return PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
        return (
            PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
            if attempt.follow_up_questions
            else PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
        )
