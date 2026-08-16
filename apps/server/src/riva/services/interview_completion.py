from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.models import (
    AgentRun,
    AgentRunStatus,
    InterviewAnswer,
    InterviewFollowUpQuestion,
    InterviewQuestion,
    InterviewSession,
    User,
)
from riva.schemas.interview_review import (
    InterviewReviewCompletionReason,
    InterviewReviewMode,
)
from riva.services.interview_review import (
    InterviewReviewService,
    InterviewReviewStateError,
)
from riva.utils import utc_now


InterviewCompletionStateErrorCode = Literal[
    "interview_session_not_found",
    "interview_completion_version_conflict",
    "interview_completion_state_invalid",
    "interview_completion_model_not_configured",
    "interview_completion_run_invalid",
]

INTERVIEW_COMPLETION_SESSION_NOT_FOUND: InterviewCompletionStateErrorCode = (
    "interview_session_not_found"
)
INTERVIEW_COMPLETION_VERSION_CONFLICT: InterviewCompletionStateErrorCode = (
    "interview_completion_version_conflict"
)
INTERVIEW_COMPLETION_STATE_INVALID: InterviewCompletionStateErrorCode = (
    "interview_completion_state_invalid"
)
INTERVIEW_COMPLETION_MODEL_NOT_CONFIGURED: InterviewCompletionStateErrorCode = (
    "interview_completion_model_not_configured"
)
INTERVIEW_COMPLETION_RUN_INVALID: InterviewCompletionStateErrorCode = (
    "interview_completion_run_invalid"
)


class InterviewCompletionStateError(RuntimeError):
    safe_message = "The interview completion state is invalid."

    def __init__(self, code: InterviewCompletionStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


Clock = Callable[[], datetime]
ReviewServiceFactory = Callable[..., InterviewReviewService]


class InterviewCompletionService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_model: str | None = None,
        review_service_factory: ReviewServiceFactory = InterviewReviewService,
        clock: Clock = utc_now,
    ) -> None:
        self.session = session
        self.llm_model = llm_model
        self.review_service_factory = review_service_factory
        self.clock = clock

    async def finish(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        version: int,
    ) -> InterviewSession:
        try:
            await self._lock_user(user_id)
            interview_session = await self._locked_session(user_id, session_id)
            self._require_version(interview_session, version)
            if interview_session.status != "candidateQuestions":
                raise InterviewCompletionStateError(
                    INTERVIEW_COMPLETION_STATE_INVALID
                )
            run = await self._review_service().enqueue_review_in_transaction(
                user_id=user_id,
                interview_session=interview_session,
                completion_reason=InterviewReviewCompletionReason.FORMAL_QUESTIONS_COMPLETED,
                review_mode=InterviewReviewMode.COMPLETE,
                session_state_version=version + 1,
                idempotency_key=f"interview-review:{session_id}:formalQuestionsCompleted",
            )
            interview_session.review_run_id = run.id
            interview_session.status = "generatingReview"
            interview_session.version += 1
            await self.session.commit()
            return interview_session
        except InterviewCompletionStateError:
            await self.session.rollback()
            raise
        except InterviewReviewStateError as error:
            await self.session.rollback()
            raise _completion_error(error) from None
        except Exception:
            await self.session.rollback()
            raise

    async def end(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        version: int,
    ) -> InterviewSession:
        try:
            await self._lock_user(user_id)
            interview_session = await self._locked_session(user_id, session_id)
            self._require_version(interview_session, version)
            if interview_session.status == "opening":
                await self._review_service().persist_unavailable_without_agent(
                    interview_session,
                    completion_reason=InterviewReviewCompletionReason.USER_ENDED_EARLY,
                )
                return interview_session
            if interview_session.status not in {"question", "followUp"}:
                raise InterviewCompletionStateError(
                    INTERVIEW_COMPLETION_STATE_INVALID
                )

            if interview_session.status == "followUp":
                current_question = await self._current_question(
                    interview_session.id,
                )
                if current_question is None or current_question.answer is None:
                    raise InterviewCompletionStateError(
                        INTERVIEW_COMPLETION_STATE_INVALID
                    )
                current_question.completed_at = self._now()

            main_answer_count = int(
                await self.session.scalar(
                    select(func.count(InterviewAnswer.id)).where(
                        InterviewAnswer.session_id == interview_session.id,
                    )
                )
                or 0
            )
            review_mode = (
                InterviewReviewMode.PARTIAL
                if main_answer_count > 0
                else InterviewReviewMode.UNAVAILABLE
            )
            run = await self._review_service().enqueue_review_in_transaction(
                user_id=user_id,
                interview_session=interview_session,
                completion_reason=InterviewReviewCompletionReason.USER_ENDED_EARLY,
                review_mode=review_mode,
                session_state_version=version + 1,
                idempotency_key=f"interview-review:{session_id}:userEndedEarly",
            )
            interview_session.review_run_id = run.id
            interview_session.status = "generatingReview"
            interview_session.version += 1
            await self.session.commit()
            return interview_session
        except InterviewCompletionStateError:
            await self.session.rollback()
            raise
        except InterviewReviewStateError as error:
            await self.session.rollback()
            raise _completion_error(error) from None
        except Exception:
            await self.session.rollback()
            raise

    async def retry_review(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        version: int,
    ) -> InterviewSession:
        try:
            await self._lock_user(user_id)
            interview_session = await self._locked_session(user_id, session_id)
            self._require_version(interview_session, version)
            if (
                interview_session.status != "generatingReview"
                or interview_session.review_run_id is None
            ):
                raise InterviewCompletionStateError(
                    INTERVIEW_COMPLETION_STATE_INVALID
                )
            failed_run = await self.session.scalar(
                select(AgentRun)
                .where(AgentRun.id == interview_session.review_run_id)
                .with_for_update()
            )
            if failed_run is None:
                raise InterviewCompletionStateError(
                    INTERVIEW_COMPLETION_RUN_INVALID
                )
            if _status_value(failed_run.status) != AgentRunStatus.FAILED.value:
                raise InterviewCompletionStateError(
                    INTERVIEW_COMPLETION_STATE_INVALID
                )
            run = await self._review_service().retry_review_in_transaction(
                user_id=user_id,
                interview_session=interview_session,
                failed_run=failed_run,
                idempotency_key=(
                    f"interview-review-retry:{session_id}:run:{failed_run.id}"
                ),
            )
            interview_session.review_run_id = run.id
            interview_session.version += 1
            await self.session.commit()
            return interview_session
        except InterviewCompletionStateError:
            await self.session.rollback()
            raise
        except InterviewReviewStateError as error:
            await self.session.rollback()
            raise _completion_error(error) from None
        except Exception:
            await self.session.rollback()
            raise

    def _review_service(self) -> InterviewReviewService:
        return self.review_service_factory(
            self.session,
            llm_model=self.llm_model,
            clock=self.clock,
        )

    async def _lock_user(self, user_id: UUID) -> None:
        if (
            await self.session.scalar(
                select(User.id).where(User.id == user_id).with_for_update()
            )
            is None
        ):
            raise InterviewCompletionStateError(
                INTERVIEW_COMPLETION_SESSION_NOT_FOUND
            )

    async def _locked_session(
        self,
        user_id: UUID,
        session_id: UUID,
    ) -> InterviewSession:
        interview_session = await self.session.scalar(
            select(InterviewSession)
            .where(
                InterviewSession.id == session_id,
                InterviewSession.user_id == user_id,
            )
            .options(
                selectinload(InterviewSession.questions).selectinload(
                    InterviewQuestion.answer
                )
            )
            .with_for_update()
        )
        if interview_session is None:
            raise InterviewCompletionStateError(
                INTERVIEW_COMPLETION_SESSION_NOT_FOUND
            )
        return interview_session

    @staticmethod
    def _require_version(session: InterviewSession, version: int) -> None:
        if session.version != version:
            raise InterviewCompletionStateError(
                INTERVIEW_COMPLETION_VERSION_CONFLICT
            )

    async def _current_question(
        self,
        session_id: UUID,
    ) -> InterviewQuestion | None:
        return await self.session.scalar(
            select(InterviewQuestion)
            .options(selectinload(InterviewQuestion.answer))
            .where(
                InterviewQuestion.session_id == session_id,
                InterviewQuestion.completed_at.is_(None),
            )
            .order_by(InterviewQuestion.order.desc())
            .limit(1)
            .with_for_update()
        )

    def _now(self) -> datetime:
        value = self.clock()
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("clock must return a timezone-aware datetime")
        return value.astimezone(UTC)


def _completion_error(error: InterviewReviewStateError) -> InterviewCompletionStateError:
    if error.code == "interview_review_model_not_configured":
        return InterviewCompletionStateError(
            INTERVIEW_COMPLETION_MODEL_NOT_CONFIGURED
        )
    if error.code == "interview_session_not_found":
        return InterviewCompletionStateError(
            INTERVIEW_COMPLETION_SESSION_NOT_FOUND
        )
    if error.code == "interview_review_version_conflict":
        return InterviewCompletionStateError(INTERVIEW_COMPLETION_VERSION_CONFLICT)
    if error.code == "interview_review_run_invalid":
        return InterviewCompletionStateError(INTERVIEW_COMPLETION_RUN_INVALID)
    return InterviewCompletionStateError(INTERVIEW_COMPLETION_STATE_INVALID)


def _status_value(value: object) -> str:
    return str(getattr(value, "value", value))


__all__ = [
    "INTERVIEW_COMPLETION_MODEL_NOT_CONFIGURED",
    "INTERVIEW_COMPLETION_RUN_INVALID",
    "INTERVIEW_COMPLETION_SESSION_NOT_FOUND",
    "INTERVIEW_COMPLETION_STATE_INVALID",
    "INTERVIEW_COMPLETION_VERSION_CONFLICT",
    "InterviewCompletionService",
    "InterviewCompletionStateError",
    "InterviewCompletionStateErrorCode",
]
