from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Literal, cast
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.runtime.runs import AgentRunService
from riva.models import (
    AgentRun,
    AgentRunStatus,
    InterviewCandidateQuestion,
    InterviewCandidateQuestionExchange,
    InterviewQuestion,
    InterviewSession,
)
from riva.prompts import INTERVIEW_CANDIDATE_QUESTION_PROMPT
from riva.schemas.interview import InterviewConfiguration
from riva.schemas.interview_candidate_question import (
    InterviewCandidateCompletedFollowUpSnapshot,
    InterviewCandidateCompletedQuestionSnapshot,
    InterviewCandidateQuestionAnswerSnapshot,
    InterviewCandidateQuestionExchangeSnapshot,
    InterviewCandidateQuestionInput,
    InterviewCandidateQuestionOutput,
    InterviewCandidateQuestionRunPayload,
    InterviewCandidateQuestionSessionSnapshot,
    InterviewCandidateQuestionSnapshot,
)
from riva.schemas.interview_planning import InterviewPlanningRunPayload
from riva.services.interview_planning_prompt_versions import (
    get_interview_planning_prompt,
)

InterviewCandidateQuestionWorkflowErrorCode = Literal[
    "interview_candidate_question_run_invalid",
    "interview_candidate_question_snapshot_invalid",
    "interview_candidate_question_model_not_configured",
]
_WorkflowErrorCode = InterviewCandidateQuestionWorkflowErrorCode

INTERVIEW_CANDIDATE_QUESTION_RUN_INVALID: _WorkflowErrorCode = (
    "interview_candidate_question_run_invalid"
)
INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID: _WorkflowErrorCode = (
    "interview_candidate_question_snapshot_invalid"
)
INTERVIEW_CANDIDATE_QUESTION_MODEL_NOT_CONFIGURED: _WorkflowErrorCode = (
    "interview_candidate_question_model_not_configured"
)

AgentRunServiceFactory = Callable[[AsyncSession], AgentRunService]


class InterviewCandidateQuestionWorkflowError(RuntimeError):
    safe_message = "The interview candidate-question workflow is invalid."

    def __init__(self, code: InterviewCandidateQuestionWorkflowErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


class InterviewCandidateQuestionWorkflow:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_model: str | None = None,
        agent_run_service_factory: AgentRunServiceFactory | None = None,
    ) -> None:
        self.session = session
        self.llm_model = (llm_model or "").strip()
        self.agent_run_service_factory = agent_run_service_factory or AgentRunService

    async def enqueue_question_run(
        self,
        *,
        user_id: UUID,
        input_snapshot: InterviewCandidateQuestionInput,
        session_version: int,
        session_state_version: int,
        candidate_question_id: UUID,
        idempotency_key: str,
    ) -> AgentRun:
        try:
            payload = InterviewCandidateQuestionRunPayload(
                session_id=input_snapshot.session.id,
                session_version=session_version,
                session_state_version=session_state_version,
                candidate_question_id=candidate_question_id,
                interaction_language=input_snapshot.interaction_language,
                interview_candidate_question_input=input_snapshot,
            )
        except TypeError, ValueError, ValidationError:
            raise InterviewCandidateQuestionWorkflowError(
                INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID
            ) from None
        return await self.enqueue_payload(
            user_id=user_id,
            payload=payload,
            idempotency_key=idempotency_key,
        )

    async def enqueue_retry_run(
        self,
        *,
        user_id: UUID,
        payload: InterviewCandidateQuestionRunPayload,
        session_state_version: int,
        retry_of_run_id: UUID,
        idempotency_key: str,
    ) -> AgentRun:
        retry_payload = payload.model_copy(
            update={
                "session_state_version": session_state_version,
                "retry_of_run_id": retry_of_run_id,
            }
        )
        return await self.enqueue_payload(
            user_id=user_id,
            payload=retry_payload,
            idempotency_key=idempotency_key,
        )

    async def enqueue_payload(
        self,
        *,
        user_id: UUID,
        payload: InterviewCandidateQuestionRunPayload,
        idempotency_key: str,
    ) -> AgentRun:
        if not self.llm_model:
            raise InterviewCandidateQuestionWorkflowError(
                INTERVIEW_CANDIDATE_QUESTION_MODEL_NOT_CONFIGURED
            )
        prompt = INTERVIEW_CANDIDATE_QUESTION_PROMPT
        return await self.agent_run_service_factory(
            self.session
        ).enqueue_in_transaction(
            user_id=user_id,
            agent_id=prompt.prompt_id,
            prompt_id=prompt.prompt_id,
            prompt_version=prompt.version,
            output_schema_id=prompt.output_schema_id,
            model=self.llm_model,
            payload=cast(
                dict[str, object],
                payload.model_dump(mode="json", by_alias=True),
            ),
            idempotency_key=idempotency_key,
            max_attempts=3,
        )

    @staticmethod
    def build_input_snapshot(
        *,
        interview_session: InterviewSession,
        question: InterviewCandidateQuestion,
        planning_run: AgentRun,
        completed_questions: Sequence[InterviewQuestion],
        previous_exchanges: Sequence[InterviewCandidateQuestionExchange],
    ) -> InterviewCandidateQuestionInput:
        try:
            planning_prompt = get_interview_planning_prompt(planning_run.prompt_version)
        except ValueError:
            raise InterviewCandidateQuestionWorkflowError(
                INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID
            ) from None
        if (
            planning_run.user_id != interview_session.user_id
            or planning_run.agent_id != planning_prompt.prompt_id
            or planning_run.prompt_id != planning_prompt.prompt_id
            or planning_run.output_schema_id != planning_prompt.output_schema_id
            or _status_value(planning_run.status) != AgentRunStatus.SUCCEEDED.value
        ):
            raise InterviewCandidateQuestionWorkflowError(
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
            ordered_exchanges = sorted(
                previous_exchanges,
                key=lambda item: item.question.order,
            )
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
                    _candidate_question_snapshot(item) for item in completed_questions
                ],
                current_candidate_question=InterviewCandidateQuestionSnapshot(
                    id=question.id,
                    content=question.content,
                    submitted_at=question.submitted_at,
                    order=question.order,
                ),
                previous_exchanges=[
                    _candidate_exchange_snapshot(item) for item in ordered_exchanges
                ],
            )
        except InterviewCandidateQuestionWorkflowError:
            raise
        except TypeError, ValueError, ValidationError, AttributeError:
            raise InterviewCandidateQuestionWorkflowError(
                INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID
            ) from None

    @classmethod
    def load_question_input(
        cls,
        run: AgentRun,
    ) -> InterviewCandidateQuestionInput:
        return cls.validate_run_payload(run).interview_candidate_question_input

    @classmethod
    def validate_run_payload(
        cls,
        run: AgentRun,
    ) -> InterviewCandidateQuestionRunPayload:
        cls.validate_run_metadata(run, run.user_id)
        try:
            return InterviewCandidateQuestionRunPayload.model_validate(run.payload)
        except TypeError, ValueError, ValidationError:
            raise InterviewCandidateQuestionWorkflowError(
                INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID
            ) from None

    @staticmethod
    def validate_run_metadata(run: AgentRun, user_id: UUID) -> None:
        prompt = INTERVIEW_CANDIDATE_QUESTION_PROMPT
        if (
            run.user_id != user_id
            or run.agent_id != prompt.prompt_id
            or run.prompt_id != prompt.prompt_id
            or run.prompt_version != prompt.version
            or run.output_schema_id != prompt.output_schema_id
        ):
            raise InterviewCandidateQuestionWorkflowError(
                INTERVIEW_CANDIDATE_QUESTION_RUN_INVALID
            )

    @staticmethod
    def validate_output(output: object) -> InterviewCandidateQuestionOutput:
        try:
            return InterviewCandidateQuestionOutput.model_validate(output)
        except TypeError, ValueError, ValidationError:
            raise InterviewCandidateQuestionWorkflowError(
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
    "INTERVIEW_CANDIDATE_QUESTION_MODEL_NOT_CONFIGURED",
    "INTERVIEW_CANDIDATE_QUESTION_RUN_INVALID",
    "INTERVIEW_CANDIDATE_QUESTION_SNAPSHOT_INVALID",
    "InterviewCandidateQuestionWorkflow",
    "InterviewCandidateQuestionWorkflowError",
    "InterviewCandidateQuestionWorkflowErrorCode",
]
