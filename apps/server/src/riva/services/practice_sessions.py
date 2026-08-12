from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
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
    PracticeSession,
    QuestionCard,
    User,
)
from riva.prompts import (
    FOLLOW_UP_PROMPT,
    PRACTICE_EVALUATION_PROMPT,
    QUESTION_GENERATION_PROMPT,
)
from riva.schemas.evaluation import (
    EvaluationRunPayload,
    PracticeEvaluationFollowUpCompletionReason,
)
from riva.schemas.follow_up import FollowUpRunPayload
from riva.schemas.practice_interactions import (
    PracticeAnswerContent,
    PracticeAnswerKind,
)
from riva.schemas.practice_sessions import (
    PracticeAttemptStatus,
    PracticeSessionSelection,
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
from riva.services.question_generation import (
    QuestionGenerationService,
    QuestionGenerationStateError,
    validate_question_generation_run,
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
    "practice_question_generation_failed",
    "practice_question_generation_state_conflict",
    "practice_follow_up_generation_failed",
    "practice_follow_up_generation_state_conflict",
    "practice_evaluation_generation_state_conflict",
    "practice_evaluation_generation_unavailable",
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
PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT: PracticeSessionStateErrorCode = (
    "practice_evaluation_generation_state_conflict"
)
PRACTICE_EVALUATION_GENERATION_UNAVAILABLE: PracticeSessionStateErrorCode = (
    "practice_evaluation_generation_unavailable"
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
class PracticePrimaryAnswerWorkflowContext:
    session: PracticeSession
    attempt: PracticeAttempt
    question_card: QuestionCard
    main_answer: PracticeAnswer
    follow_up_generation_run: AgentRun
    follow_up_decision: PracticeFollowUpDecision | None
    follow_up_question: PracticeFollowUpQuestion | None


@dataclass(frozen=True)
class PracticeEvaluationWorkflowContext(PracticePrimaryAnswerWorkflowContext):
    evaluation_generation_run: AgentRun
    evaluation: PracticeEvaluation | None


PracticePublicWorkflowContext = (
    PracticeSessionWorkflowContext
    | PracticePrimaryAnswerWorkflowContext
    | PracticeEvaluationWorkflowContext
)


QuestionGenerationServiceFactory = Callable[
    ...,
    QuestionGenerationService,
]
FollowUpGenerationServiceFactory = Callable[
    ...,
    FollowUpGenerationService,
]
EvaluationGenerationServiceFactory = Callable[
    ...,
    EvaluationGenerationService,
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
        self.clock = clock

    async def start_session(
        self,
        *,
        user_id: UUID,
        selection: PracticeSessionSelection,
        interaction_language: InteractionLanguage,
    ) -> PracticeSessionWorkflowContext:
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
                    idempotency_key=(
                        f"practice-session:{practice_session.id}:"
                        f"attempt:{attempt.id}:question-generation"
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

            (
                card,
                main_answer,
                follow_up_run,
                _,
            ) = await self._load_primary_follow_up_records(
                practice_session,
                attempt,
            )

            if follow_up_run.status in (
                AgentRunStatus.QUEUED,
                AgentRunStatus.RUNNING,
            ):
                await self.session.commit()
                return PracticePrimaryAnswerWorkflowContext(
                    session=practice_session,
                    attempt=attempt,
                    question_card=card,
                    main_answer=main_answer,
                    follow_up_generation_run=follow_up_run,
                    follow_up_decision=None,
                    follow_up_question=None,
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

            decision, question = await self._load_canonical_follow_up_artifact(
                follow_up_run,
                attempt=attempt,
            )
            now = self.clock()
            _require_aware_datetime(now)
            if decision.action == "askFollowUp":
                attempt.status = PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
                attempt.updated_at = now
                practice_session.version += 1
                practice_session.updated_at = now
                await self.session.commit()
                return PracticePrimaryAnswerWorkflowContext(
                    session=practice_session,
                    attempt=attempt,
                    question_card=card,
                    main_answer=main_answer,
                    follow_up_generation_run=follow_up_run,
                    follow_up_decision=decision,
                    follow_up_question=question,
                )
            if decision.action != "complete":
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
                        question_card=card,
                        main_answer=main_answer,
                        complete_decision=decision,
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
                question_card=card,
                main_answer=main_answer,
                follow_up_generation_run=follow_up_run,
                follow_up_decision=decision,
                follow_up_question=question,
                evaluation_generation_run=evaluation_generation_run,
                evaluation=None,
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
    ) -> PracticePublicWorkflowContext:
        try:
            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=False,
            )
            if practice_session.status != "active":
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            return await self._load_public_active_context(
                practice_session,
                for_update=False,
            )
        except BaseException:
            await self.session.rollback()
            raise

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
            PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value,
            PracticeAttemptStatus.EVALUATING.value,
        }:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        card, main_answer, follow_up_run, _ = (
            await self._load_primary_follow_up_records(
                practice_session,
                attempt,
            )
        )
        if follow_up_run.status != AgentRunStatus.SUCCEEDED:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        decision, question = await self._load_canonical_follow_up_artifact(
            follow_up_run,
            attempt=attempt,
        )
        if decision.action == "askFollowUp":
            expected_status = PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
        elif decision.action == "complete":
            expected_status = PracticeAttemptStatus.EVALUATING.value
        else:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        if attempt.status != expected_status:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
            )
        if decision.action == "complete":
            evaluation_generation_run = await self._load_stable_evaluation_run(
                user_id=practice_session.user_id,
                attempt_id=attempt.id,
                for_update=True,
            )
            self._validate_evaluation_run_lineage(
                evaluation_generation_run,
                practice_session=practice_session,
                attempt=attempt,
                question_card=card,
                main_answer=main_answer,
                complete_decision=decision,
            )
            evaluation = await self._load_evaluation_artifact(
                evaluation_generation_run,
                attempt=attempt,
                question_card=card,
                for_update=True,
            )
            return PracticeEvaluationWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_card=card,
                main_answer=main_answer,
                follow_up_generation_run=follow_up_run,
                follow_up_decision=decision,
                follow_up_question=question,
                evaluation_generation_run=evaluation_generation_run,
                evaluation=evaluation,
            )
        return PracticePrimaryAnswerWorkflowContext(
            session=practice_session,
            attempt=attempt,
            question_card=card,
            main_answer=main_answer,
            follow_up_generation_run=follow_up_run,
            follow_up_decision=decision,
            follow_up_question=question,
        )

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
        for_update: bool = True,
    ) -> tuple[
        PracticeFollowUpDecision,
        PracticeFollowUpQuestion | None,
    ]:
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
            or decision.order != 1
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
            or question.order != 1
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

    async def _enqueue_follow_up_generation(
        self,
        *,
        user_id: UUID,
        session: PracticeSession,
        attempt: PracticeAttempt,
    ) -> AgentRun:
        try:
            return await self._follow_up_generation_service().enqueue_generation_in_transaction(
                user_id=user_id,
                attempt_id=attempt.id,
                next_follow_up_order=1,
                interaction_language=session.language,
                idempotency_key=practice_follow_up_idempotency_key(
                    attempt.id,
                    1,
                ),
            )
        except FollowUpGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT,
                source_code=error.code,
            ) from None
        except ValueError:
            raise PracticeSessionStateError(
                PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT,
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
    ) -> AgentRun:
        try:
            run = await self._evaluation_generation_service().enqueue_generation_in_transaction(
                user_id=user_id,
                attempt_id=attempt.id,
                interaction_language=practice_session.language,
                follow_up_completion_reason=(
                    PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
                ),
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
            != practice_follow_up_idempotency_key(attempt.id, 1)
            or payload.attempt_id != attempt.id
            or payload.question_card_id != question_card.id
            or payload.main_answer_id != main_answer.id
            or payload.interaction_language != practice_session.language
            or payload.next_follow_up_order != 1
            or payload.previous_follow_up_question_id is not None
            or payload.previous_follow_up_answer_id is not None
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
    ) -> EvaluationRunPayload:
        try:
            payload = validate_evaluation_generation_run(run)
        except EvaluationGenerationStateError as error:
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT,
                source_code=error.code,
            ) from None
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
            or payload.follow_up_completion_reason
            != PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
            or payload.terminal_follow_up_decision_id != complete_decision.id
            or any(
                value is not None
                for value in (
                    payload.follow_up_question_1_id,
                    payload.follow_up_answer_1_id,
                    payload.follow_up_question_2_id,
                    payload.follow_up_answer_2_id,
                )
            )
        ):
            raise PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
            )
        return payload

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

    async def _load_active_context(
        self,
        practice_session: PracticeSession,
    ) -> PracticeSessionWorkflowContext:
        attempt = await self._load_current_attempt(
            user_id=practice_session.user_id,
            session_id=practice_session.id,
            for_update=True,
        )
        if attempt is None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        run, _ = await self._load_generation_run(practice_session, attempt)
        card: QuestionCard | None = None
        if attempt.question_card_id is not None:
            card = await self._load_card_by_id(
                practice_session,
                attempt,
                run,
            )
        elif run.status == AgentRunStatus.SUCCEEDED:
            card = await self._load_card_for_run(
                practice_session,
                attempt,
                run,
            )

        valid_active_statuses = {
            PracticeAttemptStatus.GENERATING_QUESTION.value,
            PracticeAttemptStatus.ANSWERING.value,
            PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value,
            PracticeAttemptStatus.EVALUATING.value,
            PracticeAttemptStatus.REVIEW.value,
        }
        if attempt.status not in valid_active_statuses:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        if attempt.status != PracticeAttemptStatus.GENERATING_QUESTION.value:
            if run.status != AgentRunStatus.SUCCEEDED or card is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
        elif run.status in (
            AgentRunStatus.QUEUED,
            AgentRunStatus.RUNNING,
            AgentRunStatus.FAILED,
        ) and card is not None:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        return PracticeSessionWorkflowContext(
            session=practice_session,
            attempt=attempt,
            question_generation_run=run,
            question_card=card,
        )

    async def _load_public_active_context(
        self,
        practice_session: PracticeSession,
        *,
        for_update: bool,
    ) -> PracticePublicWorkflowContext:
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
        }:
            raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

        if attempt.status in {
            PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value,
            PracticeAttemptStatus.EVALUATING.value,
        }:
            (
                card,
                main_answer,
                follow_up_run,
                _,
            ) = await self._load_primary_follow_up_records(
                practice_session,
                attempt,
                for_update=for_update,
            )
            if follow_up_run.status != AgentRunStatus.SUCCEEDED:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            decision, question = await self._load_canonical_follow_up_artifact(
                follow_up_run,
                attempt=attempt,
                for_update=for_update,
            )
            if attempt.status == PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value:
                if decision.action != "askFollowUp" or question is None:
                    raise PracticeSessionStateError(
                        PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                    )
                return PracticePrimaryAnswerWorkflowContext(
                    session=practice_session,
                    attempt=attempt,
                    question_card=card,
                    main_answer=main_answer,
                    follow_up_generation_run=follow_up_run,
                    follow_up_decision=decision,
                    follow_up_question=question,
                )
            if decision.action != "complete" or question is not None:
                raise PracticeSessionStateError(
                    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
                )
            evaluation_generation_run = await self._load_stable_evaluation_run(
                user_id=practice_session.user_id,
                attempt_id=attempt.id,
                for_update=for_update,
            )
            self._validate_evaluation_run_lineage(
                evaluation_generation_run,
                practice_session=practice_session,
                attempt=attempt,
                question_card=card,
                main_answer=main_answer,
                complete_decision=decision,
            )
            evaluation = await self._load_evaluation_artifact(
                evaluation_generation_run,
                attempt=attempt,
                question_card=card,
                for_update=for_update,
            )
            return PracticeEvaluationWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_card=card,
                main_answer=main_answer,
                follow_up_generation_run=follow_up_run,
                follow_up_decision=decision,
                follow_up_question=question,
                evaluation_generation_run=evaluation_generation_run,
                evaluation=evaluation,
            )

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

    async def _load_generation_run(
        self,
        practice_session: PracticeSession,
        attempt: PracticeAttempt,
        *,
        for_update: bool = True,
    ) -> tuple[AgentRun, QuestionGenerationRunPayload]:
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
    "PRACTICE_QUESTION_GENERATION_STATE_CONFLICT",
    "PRACTICE_FOLLOW_UP_GENERATION_FAILED",
    "PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT",
    "PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT",
    "PRACTICE_EVALUATION_GENERATION_UNAVAILABLE",
    "PRACTICE_SESSION_ALREADY_ACTIVE",
    "PRACTICE_SESSION_NOT_FOUND",
    "PRACTICE_SESSION_SOURCE_UNAVAILABLE",
    "PRACTICE_SESSION_STATE_CONFLICT",
    "PRACTICE_SESSION_VERSION_CONFLICT",
    "PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE",
    "PracticeSessionService",
    "PracticeSessionStateError",
    "PracticeSessionStateErrorCode",
    "PracticePrimaryAnswerWorkflowContext",
    "PracticeEvaluationWorkflowContext",
    "PracticePublicWorkflowContext",
    "PracticeSessionWorkflowContext",
    "practice_follow_up_idempotency_key",
]
