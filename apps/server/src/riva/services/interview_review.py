from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Literal, cast
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.models import (
    AgentRun,
    AgentRunStatus,
    InterviewAnswer,
    InterviewCandidateQuestionExchange,
    InterviewFollowUpQuestion,
    InterviewPlan,
    InterviewQuestion,
    InterviewReview,
    InterviewSession,
    InterviewTurnAssessment,
    User,
)
from riva.prompts import INTERVIEW_REVIEW_PROMPT
from riva.schemas.interview import InterviewConfiguration, InterviewQuestionType
from riva.schemas.interview_candidate_question import (
    InterviewCandidateQuestionExchangeSnapshot,
    InterviewCandidateQuestionSnapshot,
)
from riva.schemas.interview_planning import (
    InterviewPlanningQuestion,
    InterviewPlanningRunPayload,
)
from riva.schemas.interview_review import (
    InterviewReviewAnswerSnapshot,
    InterviewReviewCompletionReason,
    InterviewReviewDimension,
    InterviewReviewFollowUpAssessment,
    InterviewReviewFollowUpSnapshot,
    InterviewReviewInput,
    InterviewReviewMode,
    InterviewReviewOutput,
    InterviewReviewQuestionAssessment,
    InterviewReviewQuestionSnapshot,
    InterviewReviewReferenceAnswer,
    InterviewReviewRunPayload,
    InterviewReviewSessionSnapshot,
    InterviewReviewTurnAssessmentSnapshot,
)
from riva.schemas.training_memory import TrainingMemoryContext
from riva.services.agent_runs import AgentRunService
from riva.services.competency_ingestion import CompetencyIngestionService
from riva.services.interview_planning_prompt_versions import (
    get_interview_planning_prompt,
)
from riva.services.interview_review_prompt_versions import (
    INTERVIEW_REVIEW_ACCEPTED_PROMPT_VERSIONS,
    get_interview_review_prompt,
)
from riva.services.training_memory import TrainingMemoryService
from riva.utils import utc_now


InterviewReviewStateErrorCode = Literal[
    "interview_session_not_found",
    "interview_review_version_conflict",
    "interview_review_state_invalid",
    "interview_review_run_invalid",
    "interview_review_snapshot_invalid",
    "interview_review_model_not_configured",
    "interview_review_artifact_conflict",
]

INTERVIEW_REVIEW_SESSION_NOT_FOUND: InterviewReviewStateErrorCode = (
    "interview_session_not_found"
)
INTERVIEW_REVIEW_VERSION_CONFLICT: InterviewReviewStateErrorCode = (
    "interview_review_version_conflict"
)
INTERVIEW_REVIEW_STATE_INVALID: InterviewReviewStateErrorCode = (
    "interview_review_state_invalid"
)
INTERVIEW_REVIEW_RUN_INVALID: InterviewReviewStateErrorCode = (
    "interview_review_run_invalid"
)
INTERVIEW_REVIEW_SNAPSHOT_INVALID: InterviewReviewStateErrorCode = (
    "interview_review_snapshot_invalid"
)
INTERVIEW_REVIEW_MODEL_NOT_CONFIGURED: InterviewReviewStateErrorCode = (
    "interview_review_model_not_configured"
)
INTERVIEW_REVIEW_ARTIFACT_CONFLICT: InterviewReviewStateErrorCode = (
    "interview_review_artifact_conflict"
)


class InterviewReviewStateError(RuntimeError):
    safe_message = "The interview review state is invalid."

    def __init__(self, code: InterviewReviewStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


Clock = Callable[[], datetime]


class InterviewReviewService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_model: str | None = None,
        clock: Clock = utc_now,
        competency_ingestion_service_factory: Callable[
            [AsyncSession], CompetencyIngestionService
        ] = CompetencyIngestionService,
        training_memory_service_factory: Callable[
            [AsyncSession], TrainingMemoryService
        ] = TrainingMemoryService,
    ) -> None:
        self.session = session
        self.llm_model = (llm_model or "").strip()
        self.clock = clock
        self.competency_ingestion_service_factory = (
            competency_ingestion_service_factory
        )
        self.training_memory_service_factory = training_memory_service_factory

    async def enqueue_review_in_transaction(
        self,
        *,
        user_id: UUID,
        interview_session: InterviewSession,
        completion_reason: InterviewReviewCompletionReason,
        review_mode: InterviewReviewMode,
        session_state_version: int,
        idempotency_key: str,
    ) -> AgentRun:
        if not self.llm_model:
            raise InterviewReviewStateError(INTERVIEW_REVIEW_MODEL_NOT_CONFIGURED)
        if interview_session.version + 1 != session_state_version:
            raise InterviewReviewStateError(INTERVIEW_REVIEW_STATE_INVALID)
        training_memory = await self.training_memory_service_factory(
            self.session
        ).get_context(user_id)
        input_snapshot = await self.build_review_input(
            interview_session,
            completion_reason=completion_reason,
            review_mode=review_mode,
            training_memory=training_memory,
        )
        payload = InterviewReviewRunPayload(
            session_id=interview_session.id,
            session_version=interview_session.version,
            session_state_version=session_state_version,
            completion_reason=completion_reason,
            review_mode=review_mode,
            interaction_language=interview_session.language,
            interview_review_input=input_snapshot,
        )
        return await AgentRunService(self.session).enqueue_in_transaction(
            user_id=user_id,
            agent_id=INTERVIEW_REVIEW_PROMPT.prompt_id,
            prompt_id=INTERVIEW_REVIEW_PROMPT.prompt_id,
            prompt_version=INTERVIEW_REVIEW_PROMPT.version,
            output_schema_id=INTERVIEW_REVIEW_PROMPT.output_schema_id,
            model=self.llm_model,
            payload=cast(
                dict[str, object],
                payload.model_dump(mode="json", by_alias=True),
            ),
            idempotency_key=idempotency_key,
            max_attempts=3,
        )

    async def retry_review_in_transaction(
        self,
        *,
        user_id: UUID,
        interview_session: InterviewSession,
        failed_run: AgentRun,
        idempotency_key: str,
    ) -> AgentRun:
        if not self.llm_model:
            raise InterviewReviewStateError(INTERVIEW_REVIEW_MODEL_NOT_CONFIGURED)
        payload = self._validate_run_payload(failed_run)
        if (
            payload.session_id != interview_session.id
            or payload.session_state_version != interview_session.version
        ):
            raise InterviewReviewStateError(INTERVIEW_REVIEW_RUN_INVALID)
        retry_payload = payload.model_copy(
            update={
                "session_state_version": interview_session.version + 1,
                "retry_of_run_id": failed_run.id,
            }
        )
        prompt = get_interview_review_prompt(failed_run.prompt_version)
        return await AgentRunService(self.session).enqueue_in_transaction(
            user_id=user_id,
            agent_id=prompt.prompt_id,
            prompt_id=prompt.prompt_id,
            prompt_version=prompt.version,
            output_schema_id=prompt.output_schema_id,
            model=self.llm_model,
            payload=cast(
                dict[str, object],
                retry_payload.model_dump(
                    mode="json",
                    by_alias=True,
                ),
            ),
            idempotency_key=idempotency_key,
            max_attempts=3,
        )

    async def build_review_input(
        self,
        interview_session: InterviewSession,
        *,
        completion_reason: InterviewReviewCompletionReason,
        review_mode: InterviewReviewMode,
        training_memory: TrainingMemoryContext | None = None,
    ) -> InterviewReviewInput:
        try:
            plan = await self.session.scalar(
                select(InterviewPlan).where(
                    InterviewPlan.session_id == interview_session.id,
                    InterviewPlan.revision == interview_session.plan_revision,
                )
            )
            if plan is None:
                raise InterviewReviewStateError(INTERVIEW_REVIEW_STATE_INVALID)
            planning_run = await self.session.get(AgentRun, plan.source_agent_run_id)
            if planning_run is None:
                raise InterviewReviewStateError(INTERVIEW_REVIEW_SNAPSHOT_INVALID)
            try:
                planning_prompt = get_interview_planning_prompt(
                    planning_run.prompt_version
                )
            except ValueError:
                raise InterviewReviewStateError(
                    INTERVIEW_REVIEW_SNAPSHOT_INVALID
                ) from None
            if (
                planning_run.user_id != interview_session.user_id
                or planning_run.agent_id != planning_prompt.prompt_id
                or planning_run.prompt_id != planning_prompt.prompt_id
                or planning_run.output_schema_id != planning_prompt.output_schema_id
                or _status_value(planning_run.status) != AgentRunStatus.SUCCEEDED.value
            ):
                raise InterviewReviewStateError(INTERVIEW_REVIEW_SNAPSHOT_INVALID)
            planner_payload = InterviewPlanningRunPayload.model_validate(
                planning_run.payload
            )
            planner_context = planner_payload.interview_planning_input
            configuration = _session_configuration(interview_session)
            if planner_context.configuration != configuration:
                raise InterviewReviewStateError(INTERVIEW_REVIEW_SNAPSHOT_INVALID)
            if training_memory is None:
                training_memory = planner_context.training_memory

            questions = list(
                (
                    await self.session.scalars(
                        select(InterviewQuestion)
                        .options(
                            selectinload(InterviewQuestion.answer),
                            selectinload(InterviewQuestion.follow_up_questions).selectinload(
                                InterviewFollowUpQuestion.answer
                            ),
                            selectinload(InterviewQuestion.turn_assessments),
                        )
                        .where(
                            InterviewQuestion.session_id == interview_session.id,
                        )
                        .order_by(InterviewQuestion.order.asc())
                    )
                ).all()
            )
            exchanges = list(
                (
                    await self.session.scalars(
                        select(InterviewCandidateQuestionExchange)
                        .options(selectinload(InterviewCandidateQuestionExchange.question))
                        .where(
                            InterviewCandidateQuestionExchange.session_id
                            == interview_session.id,
                        )
                    )
                ).all()
            )
            exchanges.sort(key=lambda item: item.question.order)
            return InterviewReviewInput(
                completion_reason=completion_reason,
                review_mode=review_mode,
                session=InterviewReviewSessionSnapshot(
                    id=interview_session.id,
                    version=interview_session.version,
                    status=interview_session.status,
                    language=interview_session.language,
                    configuration=configuration,
                ),
                configuration=configuration,
                interaction_language=interview_session.language,
                planner_context=planner_context,
                questions=[
                    _review_question_snapshot(item, plan.questions)
                    for item in questions
                ],
                candidate_question_exchanges=[
                    _review_exchange_snapshot(item) for item in exchanges
                ],
                training_memory=training_memory,
            )
        except InterviewReviewStateError:
            raise
        except (TypeError, ValueError, ValidationError):
            raise InterviewReviewStateError(
                INTERVIEW_REVIEW_SNAPSHOT_INVALID
            ) from None

    async def load_review_input(self, run: AgentRun) -> InterviewReviewInput:
        payload = self._validate_run_payload(run)
        return payload.interview_review_input

    async def get_completed_review(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
    ) -> tuple[InterviewSession, InterviewReview]:
        interview_session = await self.session.scalar(
            select(InterviewSession)
            .options(selectinload(InterviewSession.review))
            .where(
                InterviewSession.id == session_id,
                InterviewSession.user_id == user_id,
                InterviewSession.status == "completed",
            )
        )
        if interview_session is None or interview_session.review is None:
            raise InterviewReviewStateError(INTERVIEW_REVIEW_SESSION_NOT_FOUND)
        return interview_session, interview_session.review

    async def persist_success(
        self,
        run: AgentRun,
        output: InterviewReviewOutput,
    ) -> InterviewReviewOutput:
        try:
            payload = self._validate_run_payload(run)
            validated_output = _validate_output(output, payload.review_mode)
            await self._lock_user(run.user_id)
            persisted_run = await self.session.scalar(
                select(AgentRun)
                .where(AgentRun.id == run.id)
                .with_for_update()
            )
            if persisted_run is None or _status_value(persisted_run.status) != (
                AgentRunStatus.RUNNING.value
            ):
                raise InterviewReviewStateError(INTERVIEW_REVIEW_RUN_INVALID)
            self._validate_run_metadata(persisted_run, run.user_id)
            interview_session = await self._locked_session(
                run.user_id,
                payload.session_id,
            )
            if (
                interview_session.review_run_id != run.id
                or interview_session.status != "generatingReview"
                or interview_session.version != payload.session_state_version
            ):
                raise InterviewReviewStateError(INTERVIEW_REVIEW_RUN_INVALID)

            existing = await self.session.scalar(
                select(InterviewReview)
                .where(InterviewReview.session_id == interview_session.id)
                .with_for_update()
            )
            if existing is not None:
                if existing.source_agent_run_id != run.id:
                    raise InterviewReviewStateError(
                        INTERVIEW_REVIEW_ARTIFACT_CONFLICT
                    )
                await self.competency_ingestion_service_factory(
                    self.session
                ).ingest_interview_review(
                    user_id=run.user_id,
                    interview_session=interview_session,
                    review=existing,
                )
                await self.session.commit()
                return validated_output

            now = self._now()
            question_details = await self.build_question_details(
                interview_session,
                validated_output,
                now=now,
            )
            review_json = _review_json(validated_output, payload.review_mode, now)
            review = InterviewReview(
                id=uuid4(),
                session_id=interview_session.id,
                source_agent_run_id=run.id,
                status=payload.review_mode.value,
                review=review_json,
                question_details=question_details,
                created_at=now,
            )
            self.session.add(review)
            await self.session.flush()
            await self.competency_ingestion_service_factory(
                self.session
            ).ingest_interview_review(
                user_id=run.user_id,
                interview_session=interview_session,
                review=review,
            )
            interview_session.status = "completed"
            interview_session.completion_reason = payload.completion_reason.value
            interview_session.completed_at = now
            interview_session.version += 1
            await self.session.commit()
            return validated_output
        except InterviewReviewStateError:
            await self.session.rollback()
            raise
        except (TypeError, ValueError, ValidationError):
            await self.session.rollback()
            raise InterviewReviewStateError(
                INTERVIEW_REVIEW_SNAPSHOT_INVALID
            ) from None
        except Exception:
            await self.session.rollback()
            raise

    async def persist_unavailable_without_agent(
        self,
        interview_session: InterviewSession,
        *,
        completion_reason: InterviewReviewCompletionReason,
    ) -> InterviewReview:
        try:
            if interview_session.status != "opening":
                raise InterviewReviewStateError(INTERVIEW_REVIEW_STATE_INVALID)
            if interview_session.version < 1:
                raise InterviewReviewStateError(INTERVIEW_REVIEW_STATE_INVALID)
            now = self._now()
            review = InterviewReview(
                id=uuid4(),
                session_id=interview_session.id,
                source_agent_run_id=None,
                status=InterviewReviewMode.UNAVAILABLE.value,
                review=None,
                question_details=[],
                created_at=now,
            )
            self.session.add(review)
            await self.session.flush()
            await self.competency_ingestion_service_factory(
                self.session
            ).ingest_interview_review(
                user_id=interview_session.user_id,
                interview_session=interview_session,
                review=review,
            )
            interview_session.status = "completed"
            interview_session.completion_reason = completion_reason.value
            interview_session.completed_at = now
            interview_session.version += 1
            await self.session.commit()
            return review
        except InterviewReviewStateError:
            await self.session.rollback()
            raise
        except Exception:
            await self.session.rollback()
            raise

    async def build_question_details(
        self,
        interview_session: InterviewSession,
        output: InterviewReviewOutput,
        *,
        now: datetime,
    ) -> list[dict[str, object]]:
        questions = list(
            (
                await self.session.scalars(
                    select(InterviewQuestion)
                    .options(
                        selectinload(InterviewQuestion.answer),
                        selectinload(InterviewQuestion.follow_up_questions).selectinload(
                            InterviewFollowUpQuestion.answer
                        ),
                        selectinload(InterviewQuestion.turn_assessments),
                    )
                    .where(
                        InterviewQuestion.session_id == interview_session.id,
                    )
                    .order_by(InterviewQuestion.order.asc())
                )
            ).all()
        )
        question_reviews = {
            str(item.question_id): item for item in output.question_reviews
        }
        follow_up_reviews = {
            str(item.follow_up_question_id): item
            for item in output.follow_up_reviews
        }
        references = {
            _reference_key(item): item for item in output.reference_answers
        }
        details: list[dict[str, object]] = []
        for question in questions:
            main_reference = references.get(f"main:{question.id}")
            if main_reference is None:
                raise InterviewReviewStateError(
                    INTERVIEW_REVIEW_ARTIFACT_CONFLICT
                )
            answer = question.answer
            follow_up_records: list[dict[str, object]] = []
            follow_up_details: list[dict[str, object]] = []
            for follow_up in sorted(
                question.follow_up_questions,
                key=lambda item: item.order,
            ):
                follow_up_reference = references.get(f"followUp:{follow_up.id}")
                if follow_up_reference is None:
                    raise InterviewReviewStateError(
                        INTERVIEW_REVIEW_ARTIFACT_CONFLICT
                    )
                follow_up_answer = follow_up.answer
                follow_up_record = {
                    "status": "answered"
                    if follow_up_answer is not None
                    else "unanswered",
                    "question": _follow_up_response_dict(follow_up),
                    "answer": (
                        None
                        if follow_up_answer is None
                        else _answer_response_dict(follow_up_answer)
                    ),
                }
                follow_up_records.append(follow_up_record)
                follow_up_assessment = follow_up_reviews.get(str(follow_up.id))
                if follow_up_answer is None:
                    performance = None
                else:
                    performance = _follow_up_performance(
                        follow_up_assessment,
                        question,
                        follow_up_answer.id,
                    )
                follow_up_details.append(
                    {
                        "record": follow_up_record,
                        "performance": performance,
                        "referenceAnswer": _reference_response_dict(
                            follow_up_reference,
                            now,
                        ),
                    }
                )
            if answer is None:
                record = {
                    "status": "unanswered",
                    "question": _question_response_dict(question),
                    "answer": None,
                    "followUps": [],
                }
                performance = None
            else:
                record = {
                    "status": "answered",
                    "question": _question_response_dict(question),
                    "answer": _answer_response_dict(answer),
                    "followUps": follow_up_records,
                }
                performance = _question_performance(
                    question_reviews.get(str(question.id)),
                    question,
                )
            details.append(
                {
                    "record": record,
                    "performance": performance,
                    "referenceAnswer": _reference_response_dict(
                        main_reference,
                        now,
                    ),
                    "followUps": follow_up_details,
                }
            )
        return details

    async def _lock_user(self, user_id: UUID) -> None:
        if (
            await self.session.scalar(
                select(User.id).where(User.id == user_id).with_for_update()
            )
            is None
        ):
            raise InterviewReviewStateError(INTERVIEW_REVIEW_SESSION_NOT_FOUND)

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
            .with_for_update()
        )
        if interview_session is None:
            raise InterviewReviewStateError(INTERVIEW_REVIEW_SESSION_NOT_FOUND)
        return interview_session

    def _now(self) -> datetime:
        value = self.clock()
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("clock must return a timezone-aware datetime")
        return value.astimezone(UTC)

    @staticmethod
    def _validate_run_metadata(run: AgentRun, user_id: UUID) -> None:
        try:
            prompt = get_interview_review_prompt(run.prompt_version)
        except ValueError:
            raise InterviewReviewStateError(INTERVIEW_REVIEW_RUN_INVALID) from None
        if (
            run.user_id != user_id
            or run.agent_id != prompt.prompt_id
            or run.prompt_id != prompt.prompt_id
            or run.prompt_version not in INTERVIEW_REVIEW_ACCEPTED_PROMPT_VERSIONS
            or run.prompt_version != prompt.version
            or run.output_schema_id != prompt.output_schema_id
        ):
            raise InterviewReviewStateError(INTERVIEW_REVIEW_RUN_INVALID)

    @classmethod
    def _validate_run_payload(cls, run: AgentRun) -> InterviewReviewRunPayload:
        cls._validate_run_metadata(run, run.user_id)
        try:
            return InterviewReviewRunPayload.model_validate(run.payload)
        except (TypeError, ValueError, ValidationError):
            raise InterviewReviewStateError(
                INTERVIEW_REVIEW_SNAPSHOT_INVALID
            ) from None


def _review_question_snapshot(
    question: InterviewQuestion,
    planned_questions: list[dict[str, object]],
) -> InterviewReviewQuestionSnapshot:
    try:
        planned = InterviewPlanningQuestion.model_validate(
            next(
                item
                for item in planned_questions
                if int(item["order"]) == question.order
            )
        )
        return InterviewReviewQuestionSnapshot(
            id=question.id,
            order=question.order,
            prompt=question.prompt,
            question_type=question.question_type,
            assessed_capabilities=list(question.assessed_capabilities),
            objective=planned.objective,
            follow_up_directions=list(planned.follow_up_directions),
            scoring_focus=list(planned.scoring_focus),
            answer=(
                None
                if question.answer is None
                else _review_answer_snapshot(question.answer)
            ),
            follow_ups=[
                InterviewReviewFollowUpSnapshot(
                    id=follow_up.id,
                    parent_question_id=follow_up.parent_question_id,
                    order=follow_up.order,
                    prompt=follow_up.prompt,
                    answer=(
                        None
                        if follow_up.answer is None
                        else _review_answer_snapshot(follow_up.answer)
                    ),
                )
                for follow_up in sorted(
                    question.follow_up_questions,
                    key=lambda item: item.order,
                )
            ],
            turn_assessments=[
                InterviewReviewTurnAssessmentSnapshot(
                    id=assessment.id,
                    question_id=assessment.question_id,
                    main_answer_id=assessment.main_answer_id,
                    follow_up_answer_id=assessment.follow_up_answer_id,
                    score=assessment.score,
                    summary=assessment.summary,
                    strengths=list(assessment.strengths),
                    issues=list(assessment.issues),
                    decision=assessment.decision,
                    created_at=assessment.created_at,
                )
                for assessment in sorted(
                    question.turn_assessments,
                    key=lambda item: item.created_at,
                )
            ],
        )
    except (StopIteration, TypeError, ValueError, ValidationError, AttributeError):
        raise InterviewReviewStateError(INTERVIEW_REVIEW_SNAPSHOT_INVALID) from None


def _review_answer_snapshot(answer: InterviewAnswer) -> InterviewReviewAnswerSnapshot:
    return InterviewReviewAnswerSnapshot(
        id=answer.id,
        content=answer.content,
        submitted_at=answer.submitted_at,
    )


def _review_exchange_snapshot(
    exchange: InterviewCandidateQuestionExchange,
) -> InterviewCandidateQuestionExchangeSnapshot:
    return InterviewCandidateQuestionExchangeSnapshot(
        question=InterviewCandidateQuestionSnapshot(
            id=exchange.question.id,
            content=exchange.question.content,
            submitted_at=exchange.question.submitted_at,
            order=exchange.question.order,
        ),
        interviewer_answer=exchange.interviewer_answer,
        feedback_summary=exchange.feedback_summary,
        strengths=list(exchange.strengths),
        improvement_suggestions=list(exchange.improvement_suggestions),
        suggested_alternatives=list(exchange.suggested_alternatives),
    )


def _validate_output(
    output: object,
    mode: InterviewReviewMode,
) -> InterviewReviewOutput:
    try:
        validated = InterviewReviewOutput.model_validate(output)
    except (TypeError, ValueError, ValidationError):
        raise InterviewReviewStateError(INTERVIEW_REVIEW_SNAPSHOT_INVALID) from None
    if mode == InterviewReviewMode.COMPLETE:
        if (
            validated.overall_performance is None
            or validated.overall_score is None
            or validated.next_training is None
            or len(validated.dimension_scores) != 8
            or {
                item.dimension for item in validated.dimension_scores
            }
            != set(InterviewReviewDimension)
        ):
            raise InterviewReviewStateError(INTERVIEW_REVIEW_ARTIFACT_CONFLICT)
    elif mode == InterviewReviewMode.PARTIAL:
        if (
            validated.overall_performance is None
            or validated.overall_score is not None
            or validated.dimension_scores
            or validated.next_training is not None
        ):
            raise InterviewReviewStateError(INTERVIEW_REVIEW_ARTIFACT_CONFLICT)
    elif (
        validated.overall_performance is not None
        or validated.overall_score is not None
        or validated.dimension_scores
        or validated.next_training is not None
        or validated.question_reviews
        or validated.follow_up_reviews
        or validated.main_strengths
        or validated.frequent_issues
        or validated.exposed_weaknesses
        or validated.risk_points
        or validated.communication_suggestions
        or validated.preparation_suggestions
    ):
        raise InterviewReviewStateError(INTERVIEW_REVIEW_ARTIFACT_CONFLICT)
    return validated


def _review_json(
    output: InterviewReviewOutput,
    mode: InterviewReviewMode,
    now: datetime,
) -> dict[str, object] | None:
    if mode == InterviewReviewMode.UNAVAILABLE:
        return None
    data = {
        "overallPerformance": output.overall_performance,
        "questionReviews": [
            item.model_dump(mode="json", by_alias=True)
            for item in output.question_reviews
        ],
        "mainStrengths": list(output.main_strengths),
        "frequentIssues": list(output.frequent_issues),
        "exposedWeaknesses": list(output.exposed_weaknesses),
        "riskPoints": list(output.risk_points),
        "communicationSuggestions": list(output.communication_suggestions),
        "preparationSuggestions": list(output.preparation_suggestions),
        "generatedAt": now.isoformat(),
    }
    if mode == InterviewReviewMode.COMPLETE:
        data.update(
            {
                "overallScore": output.overall_score,
                "dimensionScores": [
                    item.model_dump(mode="json", by_alias=True)
                    for item in output.dimension_scores
                ],
                "nextTraining": output.next_training.model_dump(
                    mode="json",
                    by_alias=True,
                )
                if output.next_training is not None
                else None,
            }
        )
    return data


def _reference_key(reference: InterviewReviewReferenceAnswer) -> str:
    if reference.target_type == "main":
        return f"main:{reference.question_id}"
    return f"followUp:{reference.follow_up_question_id}"


def _reference_response_dict(
    reference: InterviewReviewReferenceAnswer,
    now: datetime,
) -> dict[str, object]:
    return {
        "status": "ready",
        "content": {
            "recommendedStructure": list(reference.recommended_structure),
            "keyPoints": list(reference.key_points),
            "exampleAnswer": reference.example_answer,
            "usageGuidance": reference.usage_guidance,
            "generatedAt": now.isoformat(),
        },
    }


def _question_response_dict(question: InterviewQuestion) -> dict[str, object]:
    return {
        "id": str(question.id),
        "prompt": question.prompt,
        "type": question.question_type,
        "assessedCapabilities": list(question.assessed_capabilities),
        "order": question.order,
    }


def _answer_response_dict(answer: object) -> dict[str, object]:
    return {
        "id": str(answer.id),
        "content": answer.content,
        "submittedAt": answer.submitted_at.isoformat(),
    }


def _follow_up_response_dict(
    follow_up: InterviewFollowUpQuestion,
) -> dict[str, object]:
    return {
        "id": str(follow_up.id),
        "parentQuestionId": str(follow_up.parent_question_id),
        "prompt": follow_up.prompt,
        "order": follow_up.order,
        "createdAt": follow_up.created_at.isoformat(),
    }


def _question_performance(
    assessment: InterviewReviewQuestionAssessment | None,
    question: InterviewQuestion,
) -> dict[str, object] | None:
    if assessment is None:
        return _assessment_from_turn(question, None)
    return {
        "questionId": str(question.id),
        "score": assessment.score,
        "summary": assessment.summary,
        "strengths": list(assessment.strengths),
        "issues": list(assessment.issues),
    }


def _follow_up_performance(
    assessment: InterviewReviewFollowUpAssessment | None,
    question: InterviewQuestion,
    answer_id: UUID,
) -> dict[str, object] | None:
    if assessment is None:
        return _assessment_from_turn(question, answer_id)
    return {
        "followUpQuestionId": str(assessment.follow_up_question_id),
        "score": assessment.score,
        "summary": assessment.summary,
        "strengths": list(assessment.strengths),
        "issues": list(assessment.issues),
    }


def _assessment_from_turn(
    question: InterviewQuestion,
    answer_id: UUID | None,
) -> dict[str, object] | None:
    for assessment in question.turn_assessments:
        if answer_id is None and assessment.main_answer_id is not None:
            return {
                "questionId": str(question.id),
                "score": assessment.score,
                "summary": assessment.summary,
                "strengths": list(assessment.strengths),
                "issues": list(assessment.issues),
            }
        if answer_id is not None and assessment.follow_up_answer_id == answer_id:
            return {
                "followUpQuestionId": str(
                    next(
                        (
                            item.id
                            for item in question.follow_up_questions
                            if item.answer is not None
                            and item.answer.id == answer_id
                        ),
                        answer_id,
                    )
                ),
                "score": assessment.score,
                "summary": assessment.summary,
                "strengths": list(assessment.strengths),
                "issues": list(assessment.issues),
            }
    return None


def _session_configuration(session: InterviewSession) -> InterviewConfiguration:
    return InterviewConfiguration(
        target_role_id=session.target_role_id,
        round=session.round,
        difficulty=session.difficulty,
        duration_minutes=session.duration_minutes,
    )


def _status_value(value: object) -> str:
    return str(getattr(value, "value", value))


__all__ = [
    "INTERVIEW_REVIEW_ARTIFACT_CONFLICT",
    "INTERVIEW_REVIEW_MODEL_NOT_CONFIGURED",
    "INTERVIEW_REVIEW_RUN_INVALID",
    "INTERVIEW_REVIEW_SESSION_NOT_FOUND",
    "INTERVIEW_REVIEW_SNAPSHOT_INVALID",
    "INTERVIEW_REVIEW_STATE_INVALID",
    "INTERVIEW_REVIEW_VERSION_CONFLICT",
    "InterviewReviewService",
    "InterviewReviewStateError",
    "InterviewReviewStateErrorCode",
]
