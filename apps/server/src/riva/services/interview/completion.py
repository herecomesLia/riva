from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.agents.interview.review_types import (
    InterviewReviewCompletionReason,
    InterviewReviewMode,
)
from riva.integrations.llm import LLMProvider
from riva.models import InterviewAnswer, InterviewQuestion, InterviewSession, User
from riva.services.errors import ServiceError, service_error_for_code
from riva.services.interview.review import (
    InterviewReviewService,
)
from riva.utils import utc_now

INTERVIEW_COMPLETION_SESSION_NOT_FOUND: str = "interview_session_not_found"
INTERVIEW_COMPLETION_VERSION_CONFLICT: str = "interview_completion_version_conflict"
INTERVIEW_COMPLETION_STATE_INVALID: str = "interview_completion_state_invalid"
INTERVIEW_COMPLETION_MODEL_NOT_CONFIGURED: str = (
    "interview_completion_model_not_configured"
)


Clock = Callable[[], datetime]
ReviewServiceFactory = Callable[..., InterviewReviewService]


class InterviewCompletionService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: LLMProvider | None = None,
        llm_model: str | None = None,
        review_service_factory: ReviewServiceFactory = InterviewReviewService,
        clock: Clock = utc_now,
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()
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
                raise service_error_for_code(INTERVIEW_COMPLETION_STATE_INVALID)
            await self._review_service().generate_review(
                user_id=user_id,
                interview_session=interview_session,
                completion_reason=InterviewReviewCompletionReason.FORMAL_QUESTIONS_COMPLETED,
                review_mode=InterviewReviewMode.COMPLETE,
            )
            await self.session.commit()
            return interview_session
        except ServiceError as error:
            await self.session.rollback()
            if error.error.startswith("interview_review_") or error.error == (
                "interview_session_not_found"
            ):
                raise _completion_error(error) from None
            raise
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
                await self.session.commit()
                return interview_session
            if interview_session.status not in {"question", "followUp"}:
                raise service_error_for_code(INTERVIEW_COMPLETION_STATE_INVALID)
            if interview_session.status == "followUp":
                current_question = await self._current_question(interview_session.id)
                if current_question is None or current_question.answer is None:
                    raise service_error_for_code(INTERVIEW_COMPLETION_STATE_INVALID)
                current_question.completed_at = self._now()

            main_answer_count = int(
                await self.session.scalar(
                    select(func.count(InterviewAnswer.id)).where(
                        InterviewAnswer.session_id == interview_session.id
                    )
                )
                or 0
            )
            if main_answer_count == 0:
                await self._review_service().persist_unavailable_without_agent(
                    interview_session,
                    completion_reason=InterviewReviewCompletionReason.USER_ENDED_EARLY,
                )
            else:
                await self._review_service().generate_review(
                    user_id=user_id,
                    interview_session=interview_session,
                    completion_reason=InterviewReviewCompletionReason.USER_ENDED_EARLY,
                    review_mode=InterviewReviewMode.PARTIAL,
                )
            await self.session.commit()
            return interview_session
        except ServiceError as error:
            await self.session.rollback()
            if error.error.startswith("interview_review_") or error.error == (
                "interview_session_not_found"
            ):
                raise _completion_error(error) from None
            raise
        except Exception:
            await self.session.rollback()
            raise

    def _review_service(self) -> InterviewReviewService:
        return self.review_service_factory(
            self.session,
            llm_provider=self.llm_provider,
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
            raise service_error_for_code(INTERVIEW_COMPLETION_SESSION_NOT_FOUND)

    async def _locked_session(
        self, user_id: UUID, session_id: UUID
    ) -> InterviewSession:
        interview_session = await self.session.scalar(
            select(InterviewSession)
            .where(
                InterviewSession.id == session_id, InterviewSession.user_id == user_id
            )
            .options(
                selectinload(InterviewSession.questions).selectinload(
                    InterviewQuestion.answer
                )
            )
            .with_for_update()
        )
        if interview_session is None:
            raise service_error_for_code(INTERVIEW_COMPLETION_SESSION_NOT_FOUND)
        return interview_session

    @staticmethod
    def _require_version(session: InterviewSession, version: int) -> None:
        if session.version != version:
            raise service_error_for_code(INTERVIEW_COMPLETION_VERSION_CONFLICT)

    async def _current_question(self, session_id: UUID) -> InterviewQuestion | None:
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


def _completion_error(
    error: ServiceError,
) -> ServiceError:
    if error.error == "interview_review_model_not_configured":
        return service_error_for_code(INTERVIEW_COMPLETION_MODEL_NOT_CONFIGURED)
    if error.error == "interview_session_not_found":
        return service_error_for_code(INTERVIEW_COMPLETION_SESSION_NOT_FOUND)
    if error.error == "interview_review_version_conflict":
        return service_error_for_code(INTERVIEW_COMPLETION_VERSION_CONFLICT)
    return service_error_for_code(INTERVIEW_COMPLETION_STATE_INVALID)
