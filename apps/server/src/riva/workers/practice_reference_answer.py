from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace

from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult, PracticeReferenceAnswerAgent
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.practice_reference_answer import (
    PracticeFollowUpReferenceAnswerOutput,
    PracticeMainReferenceAnswerOutput,
    PracticeReferenceAnswerOutput,
)
from riva.services.reference_answer_generation import (
    ReferenceAnswerGenerationService,
    ReferenceAnswerGenerationStateError,
)
from riva.workers.errors import AgentExecutionError
from riva.workers.runtime import SessionFactory

ReferenceAnswerGenerationServiceFactory = Callable[
    [AsyncSession], ReferenceAnswerGenerationService
]


class PracticeReferenceAnswerHandler:
    agent_id = "practice-reference-answer-generator"

    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        agent: PracticeReferenceAnswerAgent,
        generation_service_factory: ReferenceAnswerGenerationServiceFactory = (
            ReferenceAnswerGenerationService
        ),
    ) -> None:
        if agent.agent_id != self.agent_id:
            raise ValueError("agent must be the practice reference answer agent")
        self.session_factory = session_factory
        self.agent = agent
        self.generation_service_factory = generation_service_factory

    async def execute(
        self,
        run: AgentRun,
    ) -> AgentResult[PracticeReferenceAnswerOutput]:
        if (
            run.status is not AgentRunStatus.RUNNING
            or run.lease_token is None
            or run.agent_id != self.agent_id
        ):
            raise AgentExecutionError(
                "invalid_practice_reference_answer_run",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                generation_input = await self.generation_service_factory(
                    session
                ).load_generation_input(run)
        except ReferenceAnswerGenerationStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        result = await self.agent.run(generation_input)
        if (
            result.agent_id != run.agent_id
            or result.prompt_id != run.prompt_id
            or result.prompt_version != run.prompt_version
            or not isinstance(
                result.output,
                (
                    PracticeMainReferenceAnswerOutput,
                    PracticeFollowUpReferenceAnswerOutput,
                ),
            )
        ):
            raise AgentExecutionError(
                "agent_run_result_mismatch",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                canonical_output = await self.generation_service_factory(
                    session
                ).persist_success(
                    run,
                    result.output,
                )
        except ReferenceAnswerGenerationStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        if canonical_output == result.output:
            return result
        return replace(result, output=canonical_output)


__all__ = [
    "PracticeReferenceAnswerHandler",
    "ReferenceAnswerGenerationServiceFactory",
]
