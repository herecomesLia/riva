from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Literal, cast
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.models import (
    InterviewAnswer,
    InterviewCandidateQuestionExchange,
    InterviewFollowUpQuestion,
    InterviewQuestion,
    InterviewReview,
    InterviewSession,
)
from riva.services.interview.types import (
    InterviewAnswerResponse,
    InterviewCandidateQuestionExchangeResponse,
    InterviewCandidateQuestionFeedbackResponse,
    InterviewCandidateQuestionResponse,
    InterviewCompleteReviewResponse,
    InterviewCompleteReviewStateResponse,
    InterviewCompletionReason,
    InterviewDifficulty,
    InterviewFollowUpLearningDetailResponse,
    InterviewFollowUpQuestionResponse,
    InterviewFollowUpRecordResponse,
    InterviewPartialReviewResponse,
    InterviewPartialReviewStateResponse,
    InterviewQuestionLearningDetailResponse,
    InterviewQuestionRecordResponse,
    InterviewQuestionResponse,
    InterviewQuestionType,
    InterviewRound,
    InterviewSessionReviewResponse,
    InterviewUnavailableReviewResponse,
)
from riva.services.training.types import (
    MockInterviewTrainingRecordDetailResponse,
    MockInterviewTrainingRecordSummaryResponse,
    TrainingRecordKind,
    TrainingRecordStatus,
    TrainingRecordTargetRoleResponse,
)

TrainingRecordStateErrorCode = Literal[
    "training_record_not_found",
    "training_record_state_conflict",
]
TRAINING_RECORD_NOT_FOUND: TrainingRecordStateErrorCode = "training_record_not_found"
TRAINING_RECORD_STATE_CONFLICT: TrainingRecordStateErrorCode = (
    "training_record_state_conflict"
)


class TrainingRecordStateError(RuntimeError):
    safe_message = "The training record state is invalid."

    def __init__(self, code: TrainingRecordStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


class InterviewTrainingRecordService:
    """Read-only projections for completed Mock Interview sessions."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_summaries(
        self,
        *,
        user_id: UUID,
        statuses: Sequence[TrainingRecordStatus] | None = None,
        target_role_id: UUID | None = None,
        started_at_from: datetime | None = None,
        started_at_to: datetime | None = None,
    ) -> list[MockInterviewTrainingRecordSummaryResponse]:
        records = await self._load_completed_sessions(
            user_id=user_id,
            target_role_id=target_role_id,
            started_at_from=started_at_from,
            started_at_to=started_at_to,
        )
        requested_statuses = {status.value for status in statuses or ()}
        summaries = [self._build_summary(record) for record in records]
        if requested_statuses:
            summaries = [
                summary
                for summary in summaries
                if summary.status.value in requested_statuses
            ]
        return summaries

    async def get_record(
        self,
        *,
        user_id: UUID,
        record_id: UUID,
    ) -> MockInterviewTrainingRecordDetailResponse:
        record = await self.session.scalar(
            select(InterviewSession)
            .options(*self._detail_load_options())
            .where(
                InterviewSession.id == record_id,
                InterviewSession.user_id == user_id,
                InterviewSession.status == "completed",
            )
        )
        if record is None:
            raise TrainingRecordStateError(TRAINING_RECORD_NOT_FOUND)
        return self._build_detail(record)

    async def _load_completed_sessions(
        self,
        *,
        user_id: UUID,
        target_role_id: UUID | None,
        started_at_from: datetime | None,
        started_at_to: datetime | None,
    ) -> list[InterviewSession]:
        statement = (
            select(InterviewSession)
            .options(
                selectinload(InterviewSession.target_role),
                selectinload(InterviewSession.review),
                selectinload(InterviewSession.questions).selectinload(
                    InterviewQuestion.answer
                ),
            )
            .where(
                InterviewSession.user_id == user_id,
                InterviewSession.status == "completed",
                InterviewSession.completion_reason.in_(
                    ("formalQuestionsCompleted", "userEndedEarly")
                ),
                InterviewSession.completed_at.is_not(None),
            )
        )
        if target_role_id is not None:
            statement = statement.where(
                InterviewSession.target_role_id == target_role_id
            )
        if started_at_from is not None:
            statement = statement.where(InterviewSession.started_at >= started_at_from)
        if started_at_to is not None:
            statement = statement.where(InterviewSession.started_at <= started_at_to)
        return list((await self.session.scalars(statement)).all())

    @staticmethod
    def _detail_load_options():
        return (
            selectinload(InterviewSession.target_role),
            selectinload(InterviewSession.review),
            selectinload(InterviewSession.questions).selectinload(
                InterviewQuestion.answer
            ),
            selectinload(InterviewSession.questions)
            .selectinload(InterviewQuestion.follow_up_questions)
            .selectinload(InterviewFollowUpQuestion.answer),
            selectinload(InterviewSession.candidate_question_exchanges).selectinload(
                InterviewCandidateQuestionExchange.question
            ),
        )

    @classmethod
    def _build_summary(
        cls,
        record: InterviewSession,
    ) -> MockInterviewTrainingRecordSummaryResponse:
        role = record.target_role
        review = record.review
        completed_at = record.completed_at
        if role is None or review is None or completed_at is None:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        status, overall_score, review_summary = cls._summary_review_values(
            record,
            review,
        )
        answered_count = sum(
            1 for question in record.questions if question.answer is not None
        )
        return MockInterviewTrainingRecordSummaryResponse(
            record_id=record.id,
            kind=TrainingRecordKind.MOCK_INTERVIEW,
            language=record.language,
            status=status,
            started_at=record.started_at,
            ended_at=completed_at,
            duration_seconds=_duration_seconds(record.started_at, completed_at),
            target_role=TrainingRecordTargetRoleResponse(
                id=role.id,
                title=role.title,
                company=role.company,
            ),
            answered_question_count=answered_count,
            total_question_count=len(record.questions),
            overall_score=overall_score,
            review_summary=review_summary,
            round=InterviewRound(record.round),
            difficulty=InterviewDifficulty(record.difficulty),
        )

    @classmethod
    def _summary_review_values(
        cls,
        record: InterviewSession,
        review: InterviewReview,
    ) -> tuple[TrainingRecordStatus, int | None, str | None]:
        answered_count = sum(
            1 for question in record.questions if question.answer is not None
        )
        if record.completion_reason == "formalQuestionsCompleted":
            status = TrainingRecordStatus.COMPLETED
        elif record.completion_reason == "userEndedEarly":
            status = (
                TrainingRecordStatus.PARTIALLY_COMPLETED
                if answered_count
                else TrainingRecordStatus.ENDED_EARLY
            )
        else:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)

        parsed_review = cls._review_state(review)
        if parsed_review.status != cls._expected_review_status(record, answered_count):
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        if parsed_review.status == "unavailable":
            return status, None, None
        review_payload = parsed_review.review
        return (
            status,
            getattr(review_payload, "overall_score", None),
            review_payload.overall_performance,
        )

    @classmethod
    def _build_detail(
        cls,
        record: InterviewSession,
    ) -> MockInterviewTrainingRecordDetailResponse:
        role = record.target_role
        review = record.review
        completed_at = record.completed_at
        if (
            role is None
            or review is None
            or completed_at is None
            or record.completion_reason
            not in {
                "formalQuestionsCompleted",
                "userEndedEarly",
            }
        ):
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)

        details = cls._authoritative_question_details(record, review)
        review_state = cls._review_state(review)
        answered_count = sum(
            1 for question in record.questions if question.answer is not None
        )
        if review_state.status != cls._expected_review_status(record, answered_count):
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        status = (
            TrainingRecordStatus.COMPLETED
            if record.completion_reason == "formalQuestionsCompleted"
            else (
                TrainingRecordStatus.PARTIALLY_COMPLETED
                if answered_count
                else TrainingRecordStatus.ENDED_EARLY
            )
        )
        return MockInterviewTrainingRecordDetailResponse(
            record_id=record.id,
            kind=TrainingRecordKind.MOCK_INTERVIEW,
            status=status,
            language=record.language,
            started_at=record.started_at,
            ended_at=completed_at,
            duration_seconds=_duration_seconds(record.started_at, completed_at),
            target_role=TrainingRecordTargetRoleResponse(
                id=role.id,
                title=role.title,
                company=role.company,
            ),
            completion_reason=cast(
                InterviewCompletionReason,
                record.completion_reason,
            ),
            setup={
                "round": InterviewRound(record.round),
                "difficulty": InterviewDifficulty(record.difficulty),
                "planned_duration_minutes": record.duration_minutes,
            },
            question_details=details,
            review=review_state,
            candidate_question_exchanges=cls._candidate_exchanges(record),
        )

    @classmethod
    def _authoritative_question_details(
        cls,
        record: InterviewSession,
        review: InterviewReview,
    ) -> list[InterviewQuestionLearningDetailResponse]:
        try:
            snapshots = [
                InterviewQuestionLearningDetailResponse.model_validate(item)
                for item in review.question_details
            ]
        except TypeError, ValueError, ValidationError:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT) from None

        snapshot_by_question_id = {
            detail.record.question.id: detail for detail in snapshots
        }
        questions = sorted(record.questions, key=lambda item: item.order)
        if len(snapshot_by_question_id) != len(snapshots) or set(
            snapshot_by_question_id
        ) != {question.id for question in questions}:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)

        result: list[InterviewQuestionLearningDetailResponse] = []
        for question in questions:
            snapshot = snapshot_by_question_id[question.id]
            cls._require_ready_reference(snapshot.reference_answer)
            answer = question.answer
            if answer is None:
                if (
                    snapshot.performance is not None
                    or snapshot.follow_ups
                    or question.follow_up_questions
                ):
                    raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
                result.append(
                    InterviewQuestionLearningDetailResponse(
                        record=InterviewQuestionRecordResponse(
                            status="unanswered",
                            question=cls._question_response(question),
                            answer=None,
                            follow_ups=[],
                        ),
                        performance=None,
                        reference_answer=snapshot.reference_answer,
                        follow_ups=[],
                    )
                )
                continue

            snapshot_follow_ups = {
                detail.record.question.id: detail for detail in snapshot.follow_ups
            }
            follow_up_questions = sorted(
                question.follow_up_questions,
                key=lambda item: item.order,
            )
            if len(snapshot_follow_ups) != len(snapshot.follow_ups) or set(
                snapshot_follow_ups
            ) != {follow_up.id for follow_up in follow_up_questions}:
                raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)

            follow_up_records: list[InterviewFollowUpRecordResponse] = []
            follow_up_details: list[InterviewFollowUpLearningDetailResponse] = []
            for follow_up in follow_up_questions:
                follow_up_snapshot = snapshot_follow_ups[follow_up.id]
                cls._require_ready_reference(follow_up_snapshot.reference_answer)
                follow_up_answer = follow_up.answer
                if (
                    follow_up_answer is None
                    and follow_up_snapshot.performance is not None
                ):
                    raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
                follow_up_record = InterviewFollowUpRecordResponse(
                    status="answered" if follow_up_answer is not None else "unanswered",
                    question=cls._follow_up_question_response(follow_up),
                    answer=(
                        None
                        if follow_up_answer is None
                        else cls._answer_response(follow_up_answer)
                    ),
                )
                follow_up_records.append(follow_up_record)
                follow_up_details.append(
                    InterviewFollowUpLearningDetailResponse(
                        record=follow_up_record,
                        performance=(
                            follow_up_snapshot.performance
                            if follow_up_answer is not None
                            else None
                        ),
                        reference_answer=follow_up_snapshot.reference_answer,
                    )
                )

            result.append(
                InterviewQuestionLearningDetailResponse(
                    record=InterviewQuestionRecordResponse(
                        status="answered",
                        question=cls._question_response(question),
                        answer=cls._answer_response(answer),
                        follow_ups=follow_up_records,
                    ),
                    performance=(
                        snapshot.performance
                        if snapshot.performance is not None
                        else None
                    ),
                    reference_answer=snapshot.reference_answer,
                    follow_ups=follow_up_details,
                )
            )
        return result

    @staticmethod
    def _review_state(review: InterviewReview) -> InterviewSessionReviewResponse:
        try:
            if review.status == "unavailable":
                if review.review is not None:
                    raise ValueError
                return InterviewUnavailableReviewResponse(
                    status="unavailable",
                    reason="insufficientAnswers",
                )
            if review.review is None:
                raise ValueError
            if review.status == "partial":
                return InterviewPartialReviewStateResponse(
                    status="partial",
                    review=InterviewPartialReviewResponse.model_validate(review.review),
                )
            if review.status == "complete":
                return InterviewCompleteReviewStateResponse(
                    status="complete",
                    review=InterviewCompleteReviewResponse.model_validate(
                        review.review
                    ),
                )
        except TypeError, ValueError, ValidationError:
            pass
        raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)

    @staticmethod
    def _expected_review_status(
        record: InterviewSession,
        answered_count: int,
    ) -> Literal["unavailable", "partial", "complete"]:
        if record.completion_reason == "formalQuestionsCompleted":
            return "complete"
        if record.completion_reason == "userEndedEarly":
            return "partial" if answered_count else "unavailable"
        raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)

    @staticmethod
    def _candidate_exchanges(
        record: InterviewSession,
    ) -> list[InterviewCandidateQuestionExchangeResponse]:
        try:
            exchanges = sorted(
                record.candidate_question_exchanges,
                key=lambda item: (
                    item.question.order,
                    item.created_at,
                    item.id,
                ),
            )
            return [
                InterviewCandidateQuestionExchangeResponse(
                    question=InterviewCandidateQuestionResponse(
                        id=exchange.question.id,
                        content=exchange.question.content,
                        submitted_at=exchange.question.submitted_at,
                    ),
                    interviewer_answer=exchange.interviewer_answer,
                    feedback=InterviewCandidateQuestionFeedbackResponse(
                        summary=exchange.feedback_summary,
                        strengths=list(exchange.strengths),
                        improvement_suggestions=list(exchange.improvement_suggestions),
                        suggested_alternatives=list(exchange.suggested_alternatives),
                    ),
                )
                for exchange in exchanges
            ]
        except AttributeError, TypeError, ValueError:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT) from None

    @staticmethod
    def _question_response(question: InterviewQuestion) -> InterviewQuestionResponse:
        try:
            return InterviewQuestionResponse(
                id=question.id,
                prompt=question.prompt,
                type=InterviewQuestionType(question.question_type),
                assessed_capabilities=list(question.assessed_capabilities),
                order=question.order,
            )
        except AttributeError, TypeError, ValueError:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT) from None

    @staticmethod
    def _answer_response(answer: InterviewAnswer) -> InterviewAnswerResponse:
        try:
            return InterviewAnswerResponse(
                id=answer.id,
                content=answer.content,
                submitted_at=answer.submitted_at,
            )
        except AttributeError, TypeError, ValueError:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT) from None

    @staticmethod
    def _follow_up_question_response(
        question: InterviewFollowUpQuestion,
    ) -> InterviewFollowUpQuestionResponse:
        try:
            return InterviewFollowUpQuestionResponse(
                id=question.id,
                parent_question_id=question.parent_question_id,
                prompt=question.prompt,
                order=question.order,
                created_at=question.created_at,
            )
        except AttributeError, TypeError, ValueError:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT) from None

    @staticmethod
    def _require_ready_reference(reference_answer: object) -> None:
        if getattr(reference_answer, "status", None) != "ready":
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)


def _duration_seconds(started_at: datetime, ended_at: datetime) -> int:
    _require_aware_timestamp(started_at)
    _require_aware_timestamp(ended_at)
    duration = ended_at - started_at
    if duration.total_seconds() < 0:
        raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
    return int(duration.total_seconds())


def _require_aware_timestamp(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
