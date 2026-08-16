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
    InterviewCandidateQuestion,
    InterviewCandidateQuestionExchange,
    InterviewFollowUpQuestion,
    InterviewPlan,
    InterviewQuestion,
    InterviewSession,
    User,
)
from riva.prompts import (
    INTERVIEW_CANDIDATE_QUESTION_PROMPT,
    INTERVIEW_PLANNING_PROMPT,
)
from riva.schemas.interview import InterviewConfiguration
from riva.schemas.interview_candidate_question import (
    InterviewCandidateCompletedFollowUpSnapshot,
    InterviewCandidateCompletedQuestionSnapshot,
    InterviewCandidateQuestionAnswerSnapshot,
    InterviewCandidateQuestionExchangeSnapshot,
    InterviewCandidateQuestionInput,
    InterviewCandidateQuestionRunPayload,
    InterviewCandidateQuestionSessionSnapshot,
    InterviewCandidateQuestionSnapshot,
    InterviewCandidateQuestionOutput,
)
from riva.schemas.interview_planning import InterviewPlanningRunPayload
from riva.services.agent_runs import AgentRunService
from riva.utils import utc_now


InterviewCandidateQuestionStateErrorCode = Literal[
    "interview_session_not_found",
    "interview_candidate_question_version_conflict",
    "interview_candidate_question_state_invalid",
    "interview_candidate_question_run_invalid",
    "interview_candidate_question_snapshot_invalid",
    "interview_candidate_question_model_not_configured",
    "interview_candidate_question_content_invalid",
]

INTERVIEW_CANDIDATE_QUESTION_SESSION_NOT_FOUND: InterviewCandidateQuestionStateErrorCode = (
    "interview_session_not_found"
)
INTERVIEW_CANDIDATE_QUESTION_VERSION_CONFLICT: InterviewCandidateQuestionStateErrorCode = (
    "interview_candidate_question_version_conflict"
)
INTERVIEW_CANDIDATE_QUESTION_STATE_INVALID: InterviewCandidateQuestionStateErrorCode = (
    "interview_candidate_question_state_invalid"
)
INTERVIEW_CANDIDATE_QUESTION_RUN_INVALID: InterviewCandidateQuestionStateErrorCode = (
    "interview_candidate_question_run_invalid"
)
INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID: InterviewCandidateQuestionStateErrorCode = (
    "interview_candidate_question_snapshot_invalid"
)
INTERVIEW_CANDIDATE_QUESTION_MODEL_NOT_CONFIGURED: InterviewCandidateQuestionStateErrorCode = (
    "interview_candidate_question_model_not_configured"
)
INTERVIEW_CANDIDATE_QUESTION_CONTENT_INVALID: InterviewCandidateQuestionStateErrorCode = (
    "interview_candidate_question_content_invalid"
)


class InterviewCandidateQuestionStateError(RuntimeError):
    safe_message = "The interview candidate-question state is invalid."

    def __init__(self, code: InterviewCandidateQuestionStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


Clock = Callable[[], datetime]


class InterviewCandidateQuestionService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_model: str | None = None,
        clock: Clock = utc_now,
    ) -> None:
        self.session = session
        self.llm_model = (llm_model or "").strip()
        self.clock = clock

    async def submit_question(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        version: int,
        content: str,
    ) -> InterviewSession:
        try:
            await self._lock_user(user_id)
            interview_session = await self._locked_session(user_id, session_id)
            self._require_version(interview_session, version)
            if interview_session.status != "candidateQuestions":
                raise InterviewCandidateQuestionStateError(
                    INTERVIEW_CANDIDATE_QUESTION_STATE_INVALID
                )
            normalized_content = _normalized_content(content)
            now = self._now()
            order = int(
                await self.session.scalar(
                    select(InterviewCandidateQuestion.order)
                    .where(
                        InterviewCandidateQuestion.session_id == session_id,
                    )
                    .order_by(InterviewCandidateQuestion.order.desc())
                    .limit(1)
                )
                or 0
            ) + 1
            question = InterviewCandidateQuestion(
                id=uuid4(),
                session_id=session_id,
                content=normalized_content,
                submitted_at=now,
                order=order,
            )
            self.session.add(question)
            await self.session.flush()
            input_snapshot = await self._build_input(
                interview_session,
                question,
            )
            run = await self._enqueue(
                user_id=user_id,
                input_snapshot=input_snapshot,
                session_version=version,
                session_state_version=version + 1,
                candidate_question_id=question.id,
                idempotency_key=(
                    f"interview-candidate-question:{session_id}:question:{question.id}"
                ),
            )
            interview_session.candidate_answer_run_id = run.id
            interview_session.status = "generatingCandidateAnswer"
            interview_session.version += 1
            await self.session.commit()
            return interview_session
        except InterviewCandidateQuestionStateError:
            await self.session.rollback()
            raise
        except (TypeError, ValueError, ValidationError):
            await self.session.rollback()
            raise InterviewCandidateQuestionStateError(
                INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID
            ) from None
        except Exception:
            await self.session.rollback()
            raise

    async def retry_answer(
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
                interview_session.status != "generatingCandidateAnswer"
                or interview_session.candidate_answer_run_id is None
            ):
                raise InterviewCandidateQuestionStateError(
                    INTERVIEW_CANDIDATE_QUESTION_STATE_INVALID
                )
            failed_run = await self.session.scalar(
                select(AgentRun)
                .where(AgentRun.id == interview_session.candidate_answer_run_id)
                .with_for_update()
            )
            if failed_run is None:
                raise InterviewCandidateQuestionStateError(
                    INTERVIEW_CANDIDATE_QUESTION_RUN_INVALID
                )
            if _status_value(failed_run.status) != AgentRunStatus.FAILED.value:
                raise InterviewCandidateQuestionStateError(
                    INTERVIEW_CANDIDATE_QUESTION_STATE_INVALID
                )
            payload = self._validate_run_payload(failed_run)
            if (
                payload.session_id != session_id
                or payload.session_state_version != interview_session.version
            ):
                raise InterviewCandidateQuestionStateError(
                    INTERVIEW_CANDIDATE_QUESTION_RUN_INVALID
                )
            retry_payload = payload.model_copy(
                update={
                    "session_state_version": interview_session.version + 1,
                    "retry_of_run_id": failed_run.id,
                }
            )
            run = await self._enqueue_payload(
                user_id=user_id,
                payload=retry_payload,
                idempotency_key=(
                    f"interview-candidate-question-retry:{session_id}:run:{failed_run.id}"
                ),
            )
            interview_session.candidate_answer_run_id = run.id
            interview_session.version += 1
            await self.session.commit()
            return interview_session
        except InterviewCandidateQuestionStateError:
            await self.session.rollback()
            raise
        except (TypeError, ValueError, ValidationError):
            await self.session.rollback()
            raise InterviewCandidateQuestionStateError(
                INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID
            ) from None
        except Exception:
            await self.session.rollback()
            raise

    async def load_question_input(
        self,
        run: AgentRun,
    ) -> InterviewCandidateQuestionInput:
        payload = self._validate_run_payload(run)
        return payload.interview_candidate_question_input

    async def persist_success(
        self,
        run: AgentRun,
        output: InterviewCandidateQuestionOutput,
    ) -> InterviewCandidateQuestionOutput:
        try:
            payload = self._validate_run_payload(run)
            validated_output = _validate_output(output)
            await self._lock_user(run.user_id)
            persisted_run = await self.session.scalar(
                select(AgentRun)
                .where(AgentRun.id == run.id)
                .with_for_update()
            )
            if persisted_run is None or _status_value(persisted_run.status) != (
                AgentRunStatus.RUNNING.value
            ):
                raise InterviewCandidateQuestionStateError(
                    INTERVIEW_CANDIDATE_QUESTION_RUN_INVALID
                )
            self._validate_run_metadata(persisted_run, run.user_id)
            interview_session = await self._locked_session(
                run.user_id,
                payload.session_id,
            )
            if (
                interview_session.candidate_answer_run_id != run.id
                or interview_session.status != "generatingCandidateAnswer"
                or interview_session.version != payload.session_state_version
            ):
                raise InterviewCandidateQuestionStateError(
                    INTERVIEW_CANDIDATE_QUESTION_RUN_INVALID
                )
            question = await self.session.scalar(
                select(InterviewCandidateQuestion)
                .where(
                    InterviewCandidateQuestion.id == payload.candidate_question_id,
                    InterviewCandidateQuestion.session_id == interview_session.id,
                )
                .with_for_update()
            )
            if question is None or (
                question.content
                != payload.interview_candidate_question_input.current_candidate_question.content
                or question.order
                != payload.interview_candidate_question_input.current_candidate_question.order
            ):
                raise InterviewCandidateQuestionStateError(
                    INTERVIEW_CANDIDATE_QUESTION_RUN_INVALID
                )

            existing = await self.session.scalar(
                select(InterviewCandidateQuestionExchange)
                .where(
                    InterviewCandidateQuestionExchange.question_id == question.id,
                )
                .with_for_update()
            )
            if existing is not None:
                if existing.source_agent_run_id != run.id:
                    raise InterviewCandidateQuestionStateError(
                        INTERVIEW_CANDIDATE_QUESTION_RUN_INVALID
                    )
                await self.session.commit()
                return _output_from_exchange(existing)

            feedback = validated_output.feedback
            self.session.add(
                InterviewCandidateQuestionExchange(
                    id=uuid4(),
                    session_id=interview_session.id,
                    question_id=question.id,
                    source_agent_run_id=run.id,
                    interviewer_answer=validated_output.interviewer_answer,
                    feedback_summary=feedback.summary,
                    strengths=list(feedback.strengths),
                    improvement_suggestions=list(
                        feedback.improvement_suggestions
                    ),
                    suggested_alternatives=list(feedback.suggested_alternatives),
                    created_at=self._now(),
                )
            )
            interview_session.candidate_answer_run_id = None
            interview_session.status = "candidateQuestions"
            interview_session.version += 1
            await self.session.commit()
            return validated_output
        except InterviewCandidateQuestionStateError:
            await self.session.rollback()
            raise
        except (TypeError, ValueError, ValidationError):
            await self.session.rollback()
            raise InterviewCandidateQuestionStateError(
                INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID
            ) from None
        except Exception:
            await self.session.rollback()
            raise

    async def _build_input(
        self,
        interview_session: InterviewSession,
        question: InterviewCandidateQuestion,
    ) -> InterviewCandidateQuestionInput:
        plan = await self.session.scalar(
            select(InterviewPlan).where(
                InterviewPlan.session_id == interview_session.id,
                InterviewPlan.revision == interview_session.plan_revision,
            )
        )
        if plan is None:
            raise InterviewCandidateQuestionStateError(
                INTERVIEW_CANDIDATE_QUESTION_STATE_INVALID
            )
        planning_run = await self.session.get(AgentRun, plan.source_agent_run_id)
        if planning_run is None:
            raise InterviewCandidateQuestionStateError(
                INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID
            )
        if (
            planning_run.user_id != interview_session.user_id
            or planning_run.agent_id != INTERVIEW_PLANNING_PROMPT.prompt_id
            or planning_run.prompt_id != INTERVIEW_PLANNING_PROMPT.prompt_id
            or planning_run.prompt_version != INTERVIEW_PLANNING_PROMPT.version
            or planning_run.output_schema_id
            != INTERVIEW_PLANNING_PROMPT.output_schema_id
            or _status_value(planning_run.status) != AgentRunStatus.SUCCEEDED.value
        ):
            raise InterviewCandidateQuestionStateError(
                INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID
            )
        try:
            planner_payload = InterviewPlanningRunPayload.model_validate(
                planning_run.payload
            )
            planner_context = planner_payload.interview_planning_input
            configuration = _session_configuration(interview_session)
            if planner_context.configuration != configuration:
                raise ValueError
            questions = list(
                (
                    await self.session.scalars(
                        select(InterviewQuestion)
                        .options(
                            selectinload(InterviewQuestion.answer),
                            selectinload(InterviewQuestion.follow_up_questions).selectinload(
                                InterviewFollowUpQuestion.answer
                            ),
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
                        .order_by(
                            InterviewCandidateQuestionExchange.created_at.asc(),
                            InterviewCandidateQuestionExchange.id.asc(),
                        )
                    )
                ).all()
            )
            exchanges.sort(key=lambda item: item.question.order)
            return InterviewCandidateQuestionInput(
                session=InterviewCandidateQuestionSessionSnapshot(
                    id=interview_session.id,
                    version=interview_session.version,
                    status=interview_session.status,
                    language=interview_session.language,
                    configuration=configuration,
                ),
                configuration=configuration,
                interaction_language=interview_session.language,
                planner_context=planner_context,
                completed_questions=[
                    _candidate_question_snapshot(item) for item in questions
                ],
                current_candidate_question=InterviewCandidateQuestionSnapshot(
                    id=question.id,
                    content=question.content,
                    submitted_at=question.submitted_at,
                    order=question.order,
                ),
                previous_exchanges=[
                    _candidate_exchange_snapshot(item) for item in exchanges
                ],
            )
        except InterviewCandidateQuestionStateError:
            raise
        except (TypeError, ValueError, ValidationError, AttributeError):
            raise InterviewCandidateQuestionStateError(
                INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID
            ) from None

    async def _enqueue(
        self,
        *,
        user_id: UUID,
        input_snapshot: InterviewCandidateQuestionInput,
        session_version: int,
        session_state_version: int,
        candidate_question_id: UUID,
        idempotency_key: str,
    ) -> AgentRun:
        payload = InterviewCandidateQuestionRunPayload(
            session_id=input_snapshot.session.id,
            session_version=session_version,
            session_state_version=session_state_version,
            candidate_question_id=candidate_question_id,
            interaction_language=input_snapshot.interaction_language,
            interview_candidate_question_input=input_snapshot,
        )
        return await self._enqueue_payload(
            user_id=user_id,
            payload=payload,
            idempotency_key=idempotency_key,
        )

    async def _enqueue_payload(
        self,
        *,
        user_id: UUID,
        payload: InterviewCandidateQuestionRunPayload,
        idempotency_key: str,
    ) -> AgentRun:
        if not self.llm_model:
            raise InterviewCandidateQuestionStateError(
                INTERVIEW_CANDIDATE_QUESTION_MODEL_NOT_CONFIGURED
            )
        return await AgentRunService(self.session).enqueue_in_transaction(
            user_id=user_id,
            agent_id=INTERVIEW_CANDIDATE_QUESTION_PROMPT.prompt_id,
            prompt_id=INTERVIEW_CANDIDATE_QUESTION_PROMPT.prompt_id,
            prompt_version=INTERVIEW_CANDIDATE_QUESTION_PROMPT.version,
            output_schema_id=INTERVIEW_CANDIDATE_QUESTION_PROMPT.output_schema_id,
            model=self.llm_model,
            payload=cast(
                dict[str, object],
                payload.model_dump(mode="json", by_alias=True, exclude_none=True),
            ),
            idempotency_key=idempotency_key,
            max_attempts=3,
        )

    async def _lock_user(self, user_id: UUID) -> None:
        if (
            await self.session.scalar(
                select(User.id).where(User.id == user_id).with_for_update()
            )
            is None
        ):
            raise InterviewCandidateQuestionStateError(
                INTERVIEW_CANDIDATE_QUESTION_SESSION_NOT_FOUND
            )

    async def _locked_session(
        self,
        user_id: UUID,
        session_id: UUID,
    ) -> InterviewSession:
        result = await self.session.scalar(
            select(InterviewSession)
            .where(
                InterviewSession.id == session_id,
                InterviewSession.user_id == user_id,
            )
            .with_for_update()
        )
        if result is None:
            raise InterviewCandidateQuestionStateError(
                INTERVIEW_CANDIDATE_QUESTION_SESSION_NOT_FOUND
            )
        return result

    @staticmethod
    def _require_version(session: InterviewSession, version: int) -> None:
        if session.version != version:
            raise InterviewCandidateQuestionStateError(
                INTERVIEW_CANDIDATE_QUESTION_VERSION_CONFLICT
            )

    def _now(self) -> datetime:
        value = self.clock()
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("clock must return a timezone-aware datetime")
        return value.astimezone(UTC)

    @staticmethod
    def _validate_run_metadata(run: AgentRun, user_id: UUID) -> None:
        if (
            run.user_id != user_id
            or run.agent_id != INTERVIEW_CANDIDATE_QUESTION_PROMPT.prompt_id
            or run.prompt_id != INTERVIEW_CANDIDATE_QUESTION_PROMPT.prompt_id
            or run.prompt_version != INTERVIEW_CANDIDATE_QUESTION_PROMPT.version
            or run.output_schema_id
            != INTERVIEW_CANDIDATE_QUESTION_PROMPT.output_schema_id
        ):
            raise InterviewCandidateQuestionStateError(
                INTERVIEW_CANDIDATE_QUESTION_RUN_INVALID
            )

    @classmethod
    def _validate_run_payload(
        cls,
        run: AgentRun,
    ) -> InterviewCandidateQuestionRunPayload:
        cls._validate_run_metadata(run, run.user_id)
        try:
            return InterviewCandidateQuestionRunPayload.model_validate(run.payload)
        except (TypeError, ValueError, ValidationError):
            raise InterviewCandidateQuestionStateError(
                INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID
            ) from None


def _candidate_question_snapshot(
    question: InterviewQuestion,
) -> InterviewCandidateCompletedQuestionSnapshot:
    answer = question.answer
    return InterviewCandidateCompletedQuestionSnapshot(
        id=question.id,
        order=question.order,
        prompt=question.prompt,
        question_type=question.question_type,
        assessed_capabilities=list(question.assessed_capabilities),
        answer=(
            None
            if answer is None
            else InterviewCandidateQuestionAnswerSnapshot(
                id=answer.id,
                content=answer.content,
                submitted_at=answer.submitted_at,
            )
        ),
        follow_ups=[
            InterviewCandidateCompletedFollowUpSnapshot(
                id=follow_up.id,
                parent_question_id=follow_up.parent_question_id,
                prompt=follow_up.prompt,
                order=follow_up.order,
                answer=(
                    None
                    if follow_up.answer is None
                    else InterviewCandidateQuestionAnswerSnapshot(
                        id=follow_up.answer.id,
                        content=follow_up.answer.content,
                        submitted_at=follow_up.answer.submitted_at,
                    )
                ),
            )
            for follow_up in sorted(
                question.follow_up_questions,
                key=lambda item: item.order,
            )
        ],
    )


def _candidate_exchange_snapshot(
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


def _output_from_exchange(
    exchange: InterviewCandidateQuestionExchange,
) -> InterviewCandidateQuestionOutput:
    return InterviewCandidateQuestionOutput(
        interviewer_answer=exchange.interviewer_answer,
        feedback={
            "summary": exchange.feedback_summary,
            "strengths": list(exchange.strengths),
            "improvementSuggestions": list(exchange.improvement_suggestions),
            "suggestedAlternatives": list(exchange.suggested_alternatives),
        },
    )


def _validate_output(output: object) -> InterviewCandidateQuestionOutput:
    try:
        return InterviewCandidateQuestionOutput.model_validate(output)
    except (TypeError, ValueError, ValidationError):
        raise InterviewCandidateQuestionStateError(
            INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID
        ) from None


def _normalized_content(value: str) -> str:
    normalized = value.strip()
    if not normalized or len(normalized) > 4_000:
        raise InterviewCandidateQuestionStateError(
            INTERVIEW_CANDIDATE_QUESTION_CONTENT_INVALID
        )
    return normalized


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
    "INTERVIEW_CANDIDATE_QUESTION_CONTENT_INVALID",
    "INTERVIEW_CANDIDATE_QUESTION_MODEL_NOT_CONFIGURED",
    "INTERVIEW_CANDIDATE_QUESTION_RUN_INVALID",
    "INTERVIEW_CANDIDATE_QUESTION_SESSION_NOT_FOUND",
    "INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID",
    "INTERVIEW_CANDIDATE_QUESTION_STATE_INVALID",
    "INTERVIEW_CANDIDATE_QUESTION_VERSION_CONFLICT",
    "InterviewCandidateQuestionService",
    "InterviewCandidateQuestionStateError",
    "InterviewCandidateQuestionStateErrorCode",
]
