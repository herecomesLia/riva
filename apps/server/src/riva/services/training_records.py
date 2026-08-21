from collections.abc import Callable, Iterable, Sequence
from datetime import datetime
from math import floor
from typing import Literal
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import and_, case, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.evaluation import (
    practice_evaluation_output_from_artifact,
)
from riva.models import (
    PracticeAnswer,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeReview,
    PracticeSession,
    QuestionCard,
    TargetRole,
)
from riva.schemas.evaluation import PracticeEvaluationFollowUpCompletionReason
from riva.schemas.practice_sessions import (
    PracticeAnswerResponse,
    PracticeQuestionSource,
)
from riva.schemas.training_records import (
    MockInterviewTrainingRecordDetailResponse,
    TargetedPracticeAttemptRecordResponse,
    TargetedPracticeQuestionRecordResponse,
    TargetedPracticeSetupResponse,
    TargetedPracticeTrainingRecordDetailResponse,
    TargetedPracticeTrainingRecordSummaryResponse,
    TrainingRecordEvaluationResponse,
    TrainingRecordFollowUpResponse,
    TrainingRecordKind,
    TrainingRecordKindOverviewResponse,
    TrainingRecordReviewResponse,
    TrainingRecordsOverviewResponse,
    TrainingRecordsPageResponse,
    TrainingRecordStatus,
    TrainingRecordSummaryResponse,
    TrainingRecordTargetRoleResponse,
)
from riva.services.interview_training_records import (
    TRAINING_RECORD_NOT_FOUND,
    TRAINING_RECORD_STATE_CONFLICT,
    InterviewTrainingRecordService,
    TrainingRecordStateError,
    TrainingRecordStateErrorCode,
)
from riva.services.practice_api import (
    build_practice_follow_up_reference_answer_response,
    build_practice_main_reference_answer_response,
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
    ReferenceAnswerGenerationService,
    ReferenceAnswerGenerationStateError,
)
from riva.services.review_generation import practice_review_output_from_artifact

PracticeSessionServiceFactory = Callable[..., PracticeSessionService]
ReferenceAnswerGenerationServiceFactory = Callable[
    ..., ReferenceAnswerGenerationService
]
InterviewTrainingRecordServiceFactory = Callable[
    [AsyncSession], InterviewTrainingRecordService
]


class TrainingRecordService:
    """Coordinate read-only projections for completed training sessions."""

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
        interview_training_record_service_factory: (
            InterviewTrainingRecordServiceFactory
        ) = InterviewTrainingRecordService,
    ) -> None:
        self.session = session
        self.practice_service_factory = practice_service_factory
        self.reference_answer_generation_service_factory = (
            reference_answer_generation_service_factory
        )
        self.interview_training_record_service_factory = (
            interview_training_record_service_factory
        )

    async def list_training_records(
        self,
        *,
        user_id: UUID,
        kinds: Sequence[TrainingRecordKind] | None = None,
        statuses: Sequence[TrainingRecordStatus] | None = None,
        target_role_id: UUID | None = None,
        started_at_from: datetime | None = None,
        started_at_to: datetime | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> TrainingRecordsPageResponse:
        """Return one globally sorted page across both record projections."""

        _validate_pagination(page=page, page_size=page_size)
        if started_at_from is not None:
            _require_aware_timestamp(started_at_from)
        if started_at_to is not None:
            _require_aware_timestamp(started_at_to)

        requested_kinds = {kind.value for kind in kinds or ()}
        items: list[TrainingRecordSummaryResponse] = []
        if not requested_kinds or TrainingRecordKind.TARGETED_PRACTICE.value in (
            requested_kinds
        ):
            items.extend(
                await self._list_targeted_practice_summaries(
                    user_id=user_id,
                    statuses=statuses,
                    target_role_id=target_role_id,
                    started_at_from=started_at_from,
                    started_at_to=started_at_to,
                )
            )
        if not requested_kinds or TrainingRecordKind.MOCK_INTERVIEW.value in (
            requested_kinds
        ):
            items.extend(
                await self._interview_training_record_service().list_summaries(
                    user_id=user_id,
                    statuses=statuses,
                    target_role_id=target_role_id,
                    started_at_from=started_at_from,
                    started_at_to=started_at_to,
                )
            )

        items.sort(
            key=lambda item: (item.started_at, str(item.record_id)),
            reverse=True,
        )
        total_items = len(items)
        items = items[(page - 1) * page_size : page * page_size]
        total_pages = (total_items + page_size - 1) // page_size if total_items else 0
        return TrainingRecordsPageResponse(
            items=items,
            pagination={
                "page": page,
                "pageSize": page_size,
                "totalItems": total_items,
                "totalPages": total_pages,
            },
        )

    async def list_all_summaries(
        self,
        user_id: UUID,
    ) -> list[TrainingRecordSummaryResponse]:
        """Return the complete read-only summary projection for a user.

        This intentionally does not paginate or impose dashboard ordering.
        Consumers that need a window or a latest-record projection should do
        that from the same summaries returned here.
        """

        targeted = await self._list_targeted_practice_summaries(user_id=user_id)
        interviews = await self._interview_training_record_service().list_summaries(
            user_id=user_id
        )
        return [*targeted, *interviews]

    async def get_training_records_overview(
        self,
        *,
        user_id: UUID,
    ) -> TrainingRecordsOverviewResponse:
        """Return aggregate metrics across both completed record projections."""

        targeted = await self._list_targeted_practice_summaries(user_id=user_id)
        interviews = await self._interview_training_record_service().list_summaries(
            user_id=user_id
        )
        records: list[TrainingRecordSummaryResponse] = [*targeted, *interviews]
        scores = [
            float(record.overall_score)
            for record in records
            if record.overall_score is not None
        ]
        average_score = _round_optional_average_score(
            sum(scores) / len(scores) if scores else None
        )
        by_kind = {
            kind: _build_kind_overview(
                [record for record in records if record.kind == kind]
            )
            for kind in TrainingRecordKind
        }
        roles_by_id = {
            str(record.target_role.id): record.target_role for record in records
        }
        target_roles = sorted(
            roles_by_id.values(),
            key=lambda role: (role.title, str(role.id)),
        )
        return TrainingRecordsOverviewResponse(
            total_record_count=len(records),
            completed_record_count=sum(
                1
                for record in records
                if record.status == TrainingRecordStatus.COMPLETED
            ),
            total_duration_seconds=sum(record.duration_seconds for record in records),
            answered_question_count=sum(
                record.answered_question_count for record in records
            ),
            average_score=average_score,
            target_roles=target_roles,
            by_kind=by_kind,
        )

    async def get_mock_interview_record(
        self,
        *,
        user_id: UUID,
        record_id: UUID,
    ) -> MockInterviewTrainingRecordDetailResponse:
        return await self._interview_training_record_service().get_record(
            user_id=user_id,
            record_id=record_id,
        )

    async def _list_targeted_practice_summaries(
        self,
        *,
        user_id: UUID,
        statuses: Sequence[TrainingRecordStatus] | None = None,
        target_role_id: UUID | None = None,
        started_at_from: datetime | None = None,
        started_at_to: datetime | None = None,
    ) -> list[TrainingRecordSummaryResponse]:
        eligible_records = _build_eligible_training_records_subquery(user_id=user_id)
        statement = select(eligible_records)
        if statuses:
            statement = statement.where(
                eligible_records.c.record_status.in_(
                    [status.value for status in statuses]
                )
            )
        if target_role_id is not None:
            statement = statement.where(
                eligible_records.c.target_role_id == target_role_id
            )
        if started_at_from is not None:
            statement = statement.where(
                eligible_records.c.started_at >= started_at_from
            )
        if started_at_to is not None:
            statement = statement.where(eligible_records.c.started_at <= started_at_to)
        rows = (
            await self.session.execute(
                statement.order_by(
                    eligible_records.c.started_at.desc(),
                    eligible_records.c.record_id.desc(),
                )
            )
        ).mappings()
        return [self._build_summary(row) for row in rows]

    def _interview_training_record_service(self) -> InterviewTrainingRecordService:
        return self.interview_training_record_service_factory(self.session)

    @staticmethod
    def _build_summary(row) -> TargetedPracticeTrainingRecordSummaryResponse:
        started_at = row["started_at"]
        ended_at = row["ended_at"]
        if ended_at is None:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)
        _require_aware_timestamp(started_at)
        _require_aware_timestamp(ended_at)
        duration_seconds = max(0, int((ended_at - started_at).total_seconds()))
        average_score = _round_optional_average_score(row["overall_score"])
        return TargetedPracticeTrainingRecordSummaryResponse(
            record_id=row["record_id"],
            kind=TrainingRecordKind.TARGETED_PRACTICE,
            language=row["language"],
            status=TrainingRecordStatus(row["record_status"]),
            started_at=started_at,
            ended_at=ended_at,
            duration_seconds=duration_seconds,
            target_role={
                "id": row["target_role_id"],
                "title": row["target_role_title"],
                "company": row["target_role_company"],
            },
            answered_question_count=int(row["answered_question_count"] or 0),
            total_question_count=int(row["total_question_count"] or 0),
            overall_score=average_score,
            review_summary=row["review_summary"],
            question_type=row["question_type"],
            difficulty=row["difficulty"],
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
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT) from None

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
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT) from None

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
        review_contexts = self._ordered_review_contexts(context.attempt_review_contexts)
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
        except AttributeError, TypeError, ValueError, ValidationError:
            raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT) from None
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
                    reference_answer=(_build_follow_up_reference_answer(state)),
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
                    reference_answer=(_build_follow_up_reference_answer(state)),
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


def _build_main_reference_answer(state):
    try:
        return build_practice_main_reference_answer_response(state)
    except PracticeSessionStateError:
        raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT) from None


def _build_follow_up_reference_answer(state):
    try:
        return build_practice_follow_up_reference_answer_response(state)
    except PracticeSessionStateError:
        raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT) from None


def _require_aware_timestamp(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise TrainingRecordStateError(TRAINING_RECORD_STATE_CONFLICT)


def _validate_pagination(*, page: int, page_size: int) -> None:
    if not isinstance(page, int) or page < 1:
        raise ValueError("Training record page must be a positive integer.")
    if not isinstance(page_size, int) or not 1 <= page_size <= 100:
        raise ValueError(
            "Training record page size must be an integer between 1 and 100."
        )


def _build_eligible_training_records_subquery(*, user_id: UUID):
    attempt_summary = (
        select(
            PracticeAttempt.session_id.label("session_id"),
            func.count(PracticeAttempt.id).label("total_question_count"),
            func.count(PracticeAttempt.id)
            .filter(PracticeAttempt.status == "completed")
            .label("completed_attempt_count"),
        )
        .where(PracticeAttempt.user_id == user_id)
        .group_by(PracticeAttempt.session_id)
        .subquery("practice_record_attempt_summary")
    )
    answer_summary = (
        select(
            PracticeAttempt.session_id.label("session_id"),
            func.count(PracticeAnswer.id).label("answered_question_count"),
        )
        .select_from(PracticeAttempt)
        .outerjoin(
            PracticeAnswer,
            and_(
                PracticeAnswer.attempt_id == PracticeAttempt.id,
                PracticeAnswer.kind == "main",
            ),
        )
        .where(PracticeAttempt.user_id == user_id)
        .group_by(PracticeAttempt.session_id)
        .subquery("practice_record_answer_summary")
    )
    score_summary = (
        select(
            PracticeAttempt.session_id.label("session_id"),
            func.avg(PracticeEvaluation.overall_score).label("overall_score"),
        )
        .select_from(PracticeAttempt)
        .join(
            PracticeEvaluation,
            PracticeEvaluation.attempt_id == PracticeAttempt.id,
        )
        .where(
            PracticeAttempt.user_id == user_id,
            PracticeAttempt.status == "completed",
        )
        .group_by(PracticeAttempt.session_id)
        .subquery("practice_record_score_summary")
    )
    completed_attempt_count = func.coalesce(
        attempt_summary.c.completed_attempt_count,
        0,
    )
    record_status = _record_status_expression(completed_attempt_count)
    last_completed_attempt_id = (
        select(PracticeAttempt.id)
        .where(
            PracticeAttempt.user_id == user_id,
            PracticeAttempt.session_id == PracticeSession.id,
            PracticeAttempt.status == "completed",
        )
        .order_by(
            PracticeAttempt.attempt_number.desc(),
            PracticeAttempt.id.desc(),
        )
        .limit(1)
        .correlate(PracticeSession)
        .scalar_subquery()
    )
    review_summary = (
        select(PracticeReview.overall_performance)
        .where(PracticeReview.attempt_id == last_completed_attempt_id)
        .limit(1)
        .correlate(PracticeSession)
        .scalar_subquery()
        .label("review_summary")
    )
    return (
        select(
            PracticeSession.id.label("record_id"),
            PracticeSession.language.label("language"),
            PracticeSession.started_at.label("started_at"),
            PracticeSession.completed_at.label("ended_at"),
            PracticeSession.initial_question_type.label("question_type"),
            PracticeSession.initial_difficulty.label("difficulty"),
            TargetRole.id.label("target_role_id"),
            TargetRole.title.label("target_role_title"),
            TargetRole.company.label("target_role_company"),
            func.coalesce(
                answer_summary.c.answered_question_count,
                0,
            ).label("answered_question_count"),
            func.coalesce(
                attempt_summary.c.total_question_count,
                0,
            ).label("total_question_count"),
            score_summary.c.overall_score.label("overall_score"),
            review_summary,
            record_status,
        )
        .select_from(PracticeSession)
        .join(
            TargetRole,
            and_(
                TargetRole.id == PracticeSession.target_role_id,
                TargetRole.user_id == PracticeSession.user_id,
            ),
        )
        .outerjoin(
            attempt_summary,
            attempt_summary.c.session_id == PracticeSession.id,
        )
        .outerjoin(
            answer_summary,
            answer_summary.c.session_id == PracticeSession.id,
        )
        .outerjoin(
            score_summary,
            score_summary.c.session_id == PracticeSession.id,
        )
        .where(
            PracticeSession.user_id == user_id,
            PracticeSession.status == "completed",
            PracticeSession.completion_reason.in_(
                ("reviewCompleted", "userEndedEarly")
            ),
        )
        .subquery("eligible_training_records")
    )


def _record_status_expression(completed_attempt_count):
    return case(
        (
            PracticeSession.completion_reason == "reviewCompleted",
            literal(TrainingRecordStatus.COMPLETED.value),
        ),
        (
            and_(
                PracticeSession.completion_reason == "userEndedEarly",
                completed_attempt_count > 0,
            ),
            literal(TrainingRecordStatus.PARTIALLY_COMPLETED.value),
        ),
        (
            PracticeSession.completion_reason == "userEndedEarly",
            literal(TrainingRecordStatus.ENDED_EARLY.value),
        ),
        else_=literal(TrainingRecordStatus.ENDED_EARLY.value),
    ).label("record_status")


def _empty_training_records_page(
    *,
    page: int,
    page_size: int,
) -> TrainingRecordsPageResponse:
    return TrainingRecordsPageResponse(
        items=[],
        pagination={
            "page": page,
            "pageSize": page_size,
            "totalItems": 0,
            "totalPages": 0,
        },
    )


def _build_kind_overview(
    records: Sequence[TrainingRecordSummaryResponse],
) -> TrainingRecordKindOverviewResponse:
    scores = [
        float(record.overall_score)
        for record in records
        if record.overall_score is not None
    ]
    return TrainingRecordKindOverviewResponse(
        record_count=len(records),
        completed_record_count=sum(
            1 for record in records if record.status == TrainingRecordStatus.COMPLETED
        ),
        average_score=_round_optional_average_score(
            sum(scores) / len(scores) if scores else None
        ),
    )


def _round_average_score(value: float) -> float:
    """Match the frontend's one-decimal Math.round convention."""

    return floor(value * 10 + 0.5) / 10


def _round_optional_average_score(value: object | None) -> float | None:
    if value is None:
        return None
    return _round_average_score(float(value))


__all__ = [
    "TRAINING_RECORD_NOT_FOUND",
    "TRAINING_RECORD_STATE_CONFLICT",
    "TrainingRecordService",
    "TrainingRecordStateError",
    "TrainingRecordStateErrorCode",
]
