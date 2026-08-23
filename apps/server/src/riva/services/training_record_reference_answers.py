from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import (
    PracticeAnswer,
    PracticeAttempt,
    PracticeFollowUpQuestion,
    PracticeSession,
    QuestionCard,
)
from riva.schemas.training_records import (
    TargetedPracticeFollowUpReferenceAnswerTargetResponse,
    TargetedPracticeMainReferenceAnswerTargetResponse,
    TargetedPracticeReferenceAnswerRequest,
    TrainingRecordReferenceAnswerResponse,
)
from riva.services.practice_api import (
    build_practice_follow_up_reference_answer_response,
    build_practice_main_reference_answer_response,
)
from riva.services.practice_sessions import PracticeSessionStateError
from riva.services.reference_answer_generation import (
    PracticeReferenceAnswerLifecycleStatus,
    PracticeReferenceAnswerWorkflowState,
    ReferenceAnswerGenerationService,
    ReferenceAnswerGenerationStateError,
)

TrainingRecordReferenceAnswerStateErrorCode = Literal[
    "training_record_not_found",
    "training_record_question_not_found",
    "training_record_follow_up_not_found",
    "training_record_state_conflict",
    "reference_answer_generation_unavailable",
]

TRAINING_RECORD_NOT_FOUND: TrainingRecordReferenceAnswerStateErrorCode = (
    "training_record_not_found"
)
TRAINING_RECORD_QUESTION_NOT_FOUND: TrainingRecordReferenceAnswerStateErrorCode = (
    "training_record_question_not_found"
)
TRAINING_RECORD_FOLLOW_UP_NOT_FOUND: TrainingRecordReferenceAnswerStateErrorCode = (
    "training_record_follow_up_not_found"
)
TRAINING_RECORD_STATE_CONFLICT: TrainingRecordReferenceAnswerStateErrorCode = (
    "training_record_state_conflict"
)
REFERENCE_ANSWER_GENERATION_UNAVAILABLE: TrainingRecordReferenceAnswerStateErrorCode = (
    "reference_answer_generation_unavailable"
)


class TrainingRecordReferenceAnswerStateError(RuntimeError):
    safe_message = "The training record reference answer state is invalid."

    def __init__(self, code: TrainingRecordReferenceAnswerStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


@dataclass(frozen=True)
class _ReferenceAnswerTarget:
    record: PracticeSession
    attempt: PracticeAttempt
    follow_up_question: PracticeFollowUpQuestion | None
    submitted_at: datetime | None


ReferenceAnswerGenerationServiceFactory = Callable[
    ..., ReferenceAnswerGenerationService
]


class TrainingRecordReferenceAnswerService:
    """Reference-answer mutations for completed targeted-practice records."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: object | None = None,
        llm_model: str | None = None,
        reference_answer_generation_service_factory: (
            ReferenceAnswerGenerationServiceFactory
        ) = ReferenceAnswerGenerationService,
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()
        self.reference_answer_generation_service_factory = (
            reference_answer_generation_service_factory
        )

    async def request_reference_answer(
        self,
        *,
        user_id: UUID,
        record_id: UUID,
        payload: TargetedPracticeReferenceAnswerRequest,
    ) -> TrainingRecordReferenceAnswerResponse:
        try:
            target = await self._resolve_target(
                user_id=user_id,
                record_id=record_id,
                payload=payload,
            )
            generation_service = self._generation_service()
            state = await self._read_state(
                generation_service,
                user_id=user_id,
                target=target,
                for_update=True,
            )
            if state.status is PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED:
                self._require_llm_configuration()
                try:
                    if target.follow_up_question is None:
                        await generation_service.generate_main(
                            user_id=user_id,
                            question_card=await self._question_card(target),
                            language=target.record.language,
                        )
                    else:
                        await generation_service.generate_follow_up(
                            user_id=user_id,
                            question_card=await self._question_card(target),
                            follow_up_question=target.follow_up_question,
                            attempt=target.attempt,
                            language=target.record.language,
                        )
                except ReferenceAnswerGenerationStateError:
                    raise TrainingRecordReferenceAnswerStateError(
                        TRAINING_RECORD_STATE_CONFLICT
                    ) from None
                except ValueError:
                    raise TrainingRecordReferenceAnswerStateError(
                        REFERENCE_ANSWER_GENERATION_UNAVAILABLE
                    ) from None
                state = await self._read_state(
                    generation_service,
                    user_id=user_id,
                    target=target,
                    for_update=True,
                )
            await self.session.commit()
            return _build_response(record_id=record_id, target=target, state=state)
        except BaseException:
            await self.session.rollback()
            raise

    async def _resolve_target(
        self,
        *,
        user_id: UUID,
        record_id: UUID,
        payload: TargetedPracticeReferenceAnswerRequest,
    ) -> _ReferenceAnswerTarget:
        record = await self.session.scalar(
            select(PracticeSession).where(
                PracticeSession.id == record_id,
                PracticeSession.user_id == user_id,
            )
        )
        if (
            record is None
            or record.user_id != user_id
            or record.status != "completed"
            or record.completed_at is None
            or record.completion_reason not in {"reviewCompleted", "userEndedEarly"}
        ):
            raise TrainingRecordReferenceAnswerStateError(TRAINING_RECORD_NOT_FOUND)

        attempt = await self.session.scalar(
            select(PracticeAttempt).where(
                PracticeAttempt.id == payload.question_id,
                PracticeAttempt.user_id == user_id,
                PracticeAttempt.session_id == record.id,
            )
        )
        if (
            attempt is None
            or attempt.user_id != user_id
            or attempt.session_id != record.id
            or attempt.question_card_id is None
        ):
            raise TrainingRecordReferenceAnswerStateError(
                TRAINING_RECORD_QUESTION_NOT_FOUND
            )

        if payload.subject == "mainQuestion":
            answer = await self.session.scalar(
                select(PracticeAnswer).where(
                    PracticeAnswer.attempt_id == attempt.id,
                    PracticeAnswer.kind == "main",
                )
            )
            return _ReferenceAnswerTarget(
                record=record,
                attempt=attempt,
                follow_up_question=None,
                submitted_at=answer.submitted_at if answer is not None else None,
            )

        follow_up_question = await self.session.scalar(
            select(PracticeFollowUpQuestion).where(
                PracticeFollowUpQuestion.id == payload.follow_up_id,
                PracticeFollowUpQuestion.attempt_id == attempt.id,
            )
        )
        if follow_up_question is None:
            raise TrainingRecordReferenceAnswerStateError(
                TRAINING_RECORD_FOLLOW_UP_NOT_FOUND
            )
        answer = await self.session.scalar(
            select(PracticeAnswer).where(
                PracticeAnswer.attempt_id == attempt.id,
                PracticeAnswer.kind == "followUp",
                PracticeAnswer.follow_up_question_id == follow_up_question.id,
            )
        )
        return _ReferenceAnswerTarget(
            record=record,
            attempt=attempt,
            follow_up_question=follow_up_question,
            submitted_at=answer.submitted_at if answer is not None else None,
        )

    async def _read_state(
        self,
        generation_service: ReferenceAnswerGenerationService,
        *,
        user_id: UUID,
        target: _ReferenceAnswerTarget,
        for_update: bool,
    ) -> PracticeReferenceAnswerWorkflowState:
        try:
            if target.follow_up_question is None:
                return await generation_service.get_main_generation_state(
                    user_id=user_id,
                    question_card_id=target.attempt.question_card_id,
                    submitted_at=target.submitted_at,
                    for_update=for_update,
                )
            return await generation_service.get_follow_up_generation_state(
                user_id=user_id,
                question_card_id=target.attempt.question_card_id,
                follow_up_question_id=target.follow_up_question.id,
                submitted_at=target.submitted_at,
                for_update=for_update,
            )
        except ReferenceAnswerGenerationStateError:
            raise TrainingRecordReferenceAnswerStateError(
                TRAINING_RECORD_STATE_CONFLICT
            ) from None

    async def _question_card(self, target: _ReferenceAnswerTarget) -> QuestionCard:
        card = await self.session.scalar(
            select(QuestionCard).where(
                QuestionCard.id == target.attempt.question_card_id
            )
        )
        if card is None:
            raise TrainingRecordReferenceAnswerStateError(
                TRAINING_RECORD_QUESTION_NOT_FOUND
            )
        return card

    def _generation_service(self) -> ReferenceAnswerGenerationService:
        return self.reference_answer_generation_service_factory(
            self.session,
            llm_provider=self.llm_provider,
            llm_model=self.llm_model,
        )

    def _require_llm_configuration(self) -> None:
        if self.llm_provider is None or not self.llm_model:
            raise TrainingRecordReferenceAnswerStateError(
                REFERENCE_ANSWER_GENERATION_UNAVAILABLE
            )


def _build_response(
    *,
    record_id: UUID,
    target: _ReferenceAnswerTarget,
    state: PracticeReferenceAnswerWorkflowState,
) -> TrainingRecordReferenceAnswerResponse:
    try:
        if target.follow_up_question is None:
            response_target = TargetedPracticeMainReferenceAnswerTargetResponse(
                kind="targetedPractice",
                record_id=record_id,
                question_id=target.attempt.id,
                subject="mainQuestion",
            )
            reference_answer = build_practice_main_reference_answer_response(state)
        else:
            response_target = TargetedPracticeFollowUpReferenceAnswerTargetResponse(
                kind="targetedPractice",
                record_id=record_id,
                question_id=target.attempt.id,
                subject="followUp",
                follow_up_id=target.follow_up_question.id,
            )
            reference_answer = build_practice_follow_up_reference_answer_response(state)
        return TrainingRecordReferenceAnswerResponse(
            target=response_target,
            reference_answer=reference_answer,
        )
    except TrainingRecordReferenceAnswerStateError:
        raise
    except AttributeError, TypeError, ValueError, PracticeSessionStateError:
        raise TrainingRecordReferenceAnswerStateError(
            TRAINING_RECORD_STATE_CONFLICT
        ) from None


__all__ = [
    "REFERENCE_ANSWER_GENERATION_UNAVAILABLE",
    "TRAINING_RECORD_FOLLOW_UP_NOT_FOUND",
    "TRAINING_RECORD_NOT_FOUND",
    "TRAINING_RECORD_QUESTION_NOT_FOUND",
    "TRAINING_RECORD_STATE_CONFLICT",
    "TrainingRecordReferenceAnswerService",
    "TrainingRecordReferenceAnswerStateError",
    "TrainingRecordReferenceAnswerStateErrorCode",
]
