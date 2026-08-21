from collections.abc import Callable
from dataclasses import replace

from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult, InterviewCandidateQuestionAgent
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.interview_candidate_question import (
    InterviewCandidateQuestionOutput,
)
from riva.services.interview_candidate_questions import (
    InterviewCandidateQuestionService,
    InterviewCandidateQuestionStateError,
)
from riva.workers.errors import AgentExecutionError
from riva.workers.runtime import SessionFactory

CandidateQuestionServiceFactory = Callable[
    [AsyncSession], InterviewCandidateQuestionService
]


class InterviewCandidateQuestionHandler:
    agent_id = "interview-candidate-question"

    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        agent: InterviewCandidateQuestionAgent,
        candidate_question_service_factory: CandidateQuestionServiceFactory = (
            InterviewCandidateQuestionService
        ),
    ) -> None:
        if agent.agent_id != self.agent_id:
            raise ValueError("agent must be the interview candidate-question agent")
        self.session_factory = session_factory
        self.agent = agent
        self.candidate_question_service_factory = candidate_question_service_factory

    async def execute(
        self,
        run: AgentRun,
    ) -> AgentResult[InterviewCandidateQuestionOutput]:
        if (
            run.status is not AgentRunStatus.RUNNING
            or run.lease_token is None
            or run.agent_id != self.agent_id
        ):
            raise AgentExecutionError(
                "invalid_interview_candidate_question_run",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                input_snapshot = await self.candidate_question_service_factory(
                    session
                ).load_question_input(run)
        except InterviewCandidateQuestionStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        result = await self.agent.run(input_snapshot)
        if (
            result.agent_id != run.agent_id
            or result.prompt_id != run.prompt_id
            or result.prompt_version != run.prompt_version
            or not isinstance(result.output, InterviewCandidateQuestionOutput)
        ):
            raise AgentExecutionError(
                "agent_run_result_mismatch",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                canonical_output = await self.candidate_question_service_factory(
                    session
                ).persist_success(run, result.output)
        except InterviewCandidateQuestionStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        if canonical_output == result.output:
            return result
        return replace(result, output=canonical_output)


__all__ = [
    "CandidateQuestionServiceFactory",
    "InterviewCandidateQuestionHandler",
]
