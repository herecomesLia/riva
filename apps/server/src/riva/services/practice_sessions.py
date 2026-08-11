from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.language import InteractionLanguage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAttempt,
    PracticeSession,
    QuestionCard,
    User,
)
from riva.prompts import QUESTION_GENERATION_PROMPT
from riva.schemas.practice_sessions import (
    PracticeAttemptStatus,
    PracticeSessionSelection,
)
from riva.schemas.question_generation import QuestionGenerationRunPayload
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


QuestionGenerationServiceFactory = Callable[
    ...,
    QuestionGenerationService,
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
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.llm_model = (llm_model or "").strip()
        self.question_generation_service_factory = (
            question_generation_service_factory
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
            active_session = await self._load_active_session(user_id)
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
    ) -> PracticeSessionWorkflowContext:
        try:
            practice_session = await self._load_session(
                user_id=user_id,
                session_id=session_id,
                for_update=False,
            )
            if practice_session.status != "active":
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            attempt = await self._load_current_attempt(
                user_id=user_id,
                session_id=practice_session.id,
                for_update=False,
            )
            if attempt is None:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)
            if attempt.status not in {
                PracticeAttemptStatus.GENERATING_QUESTION.value,
                PracticeAttemptStatus.ANSWERING.value,
            }:
                raise PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT)

            run, _ = await self._load_generation_run(
                practice_session,
                attempt,
                for_update=False,
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
                for_update=False,
            )
            return PracticeSessionWorkflowContext(
                session=practice_session,
                attempt=attempt,
                question_generation_run=run,
                question_card=card,
            )
        except BaseException:
            await self.session.rollback()
            raise

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

    async def _load_active_session(self, user_id: UUID) -> PracticeSession | None:
        return await self.session.scalar(
            select(PracticeSession)
            .where(
                PracticeSession.user_id == user_id,
                PracticeSession.status == "active",
            )
            .with_for_update()
        )

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


__all__ = [
    "PRACTICE_QUESTION_GENERATION_FAILED",
    "PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED",
    "PRACTICE_QUESTION_GENERATION_STATE_CONFLICT",
    "PRACTICE_SESSION_ALREADY_ACTIVE",
    "PRACTICE_SESSION_NOT_FOUND",
    "PRACTICE_SESSION_SOURCE_UNAVAILABLE",
    "PRACTICE_SESSION_STATE_CONFLICT",
    "PRACTICE_SESSION_VERSION_CONFLICT",
    "PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE",
    "PracticeSessionService",
    "PracticeSessionStateError",
    "PracticeSessionStateErrorCode",
    "PracticeSessionWorkflowContext",
]
