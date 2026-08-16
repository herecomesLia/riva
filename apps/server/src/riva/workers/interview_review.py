from collections.abc import Callable
from dataclasses import replace

from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult, InterviewReviewAgent
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.interview_review import InterviewReviewOutput
from riva.services.interview_review import (
    InterviewReviewService,
    InterviewReviewStateError,
)
from riva.workers.errors import AgentExecutionError
from riva.workers.runtime import SessionFactory


ReviewServiceFactory = Callable[[AsyncSession], InterviewReviewService]


class InterviewReviewHandler:
    agent_id = "interview-review"

    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        agent: InterviewReviewAgent,
        review_service_factory: ReviewServiceFactory = InterviewReviewService,
    ) -> None:
        if agent.agent_id != self.agent_id:
            raise ValueError("agent must be the interview review agent")
        self.session_factory = session_factory
        self.agent = agent
        self.review_service_factory = review_service_factory

    async def execute(
        self,
        run: AgentRun,
    ) -> AgentResult[InterviewReviewOutput]:
        if (
            run.status is not AgentRunStatus.RUNNING
            or run.lease_token is None
            or run.agent_id != self.agent_id
        ):
            raise AgentExecutionError(
                "invalid_interview_review_run",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                review_input = await self.review_service_factory(
                    session
                ).load_review_input(run)
        except InterviewReviewStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        result = await self.agent.run(review_input)
        if (
            result.agent_id != run.agent_id
            or result.prompt_id != run.prompt_id
            or result.prompt_version != run.prompt_version
            or not isinstance(result.output, InterviewReviewOutput)
        ):
            raise AgentExecutionError(
                "agent_run_result_mismatch",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                canonical_output = await self.review_service_factory(
                    session
                ).persist_success(run, result.output)
        except InterviewReviewStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        if canonical_output == result.output:
            return result
        return replace(result, output=canonical_output)


__all__ = ["InterviewReviewHandler", "ReviewServiceFactory"]
