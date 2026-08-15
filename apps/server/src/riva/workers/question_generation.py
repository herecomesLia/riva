from collections.abc import Callable
from dataclasses import replace

from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult, QuestionGenerationAgent
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.question_generation import (
    QuestionGenerationOutput,
)
from riva.services.question_generation import (
    QuestionGenerationService,
    QuestionGenerationStateError,
    question_generation_output_from_card,
)
from riva.services.question_generation_prompt_versions import (
    get_question_generation_prompt,
)
from riva.workers.errors import AgentExecutionError
from riva.workers.runtime import SessionFactory


QuestionGenerationServiceFactory = Callable[
    [AsyncSession], QuestionGenerationService
]


class QuestionGenerationHandler:
    agent_id = "question-generator"

    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        agent: QuestionGenerationAgent,
        legacy_agent: QuestionGenerationAgent | None = None,
        generation_service_factory: QuestionGenerationServiceFactory = (
            QuestionGenerationService
        ),
    ) -> None:
        if agent.agent_id != self.agent_id:
            raise ValueError("agent must be the question generation agent")
        self.session_factory = session_factory
        self.agent = agent
        self.legacy_agent = legacy_agent
        self._agents = {agent.prompt_version: agent}
        if legacy_agent is not None:
            self._agents[legacy_agent.prompt_version] = legacy_agent
        self.generation_service_factory = generation_service_factory

    async def execute(
        self,
        run: AgentRun,
    ) -> AgentResult[QuestionGenerationOutput]:
        if (
            run.status is not AgentRunStatus.RUNNING
            or run.lease_token is None
            or run.agent_id != self.agent_id
        ):
            raise AgentExecutionError(
                "invalid_question_generation_run",
                retryable=False,
            )

        agent = self._agent_for_run(run)

        try:
            async with self.session_factory() as session:
                generation_input = await self.generation_service_factory(
                    session
                ).load_generation_input(run)
        except QuestionGenerationStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        result = await agent.run(generation_input)
        if (
            result.agent_id != run.agent_id
            or result.prompt_id != run.prompt_id
            or result.prompt_version != run.prompt_version
            or not isinstance(result.output, QuestionGenerationOutput)
        ):
            raise AgentExecutionError(
                "agent_run_result_mismatch",
                retryable=False,
            )

        try:
            async with self.session_factory() as session:
                card = await self.generation_service_factory(
                    session
                ).persist_success(
                    run,
                    result.output,
                )
        except QuestionGenerationStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        canonical_output = question_generation_output_from_card(card)
        if canonical_output == result.output:
            return result
        return replace(result, output=canonical_output)

    def _agent_for_run(self, run: AgentRun) -> QuestionGenerationAgent:
        try:
            prompt = get_question_generation_prompt(run.prompt_version)
        except ValueError:
            raise AgentExecutionError(
                "invalid_question_generation_run",
                retryable=False,
            ) from None
        agent = self._agents.get(prompt.version)
        if (
            agent is None
            or agent.agent_id != self.agent_id
            or getattr(agent, "prompt", None) is not prompt
            or agent.prompt_id != run.prompt_id
            or agent.prompt_version != run.prompt_version
        ):
            raise AgentExecutionError(
                "invalid_question_generation_run",
                retryable=False,
            )
        return agent


__all__ = ["QuestionGenerationHandler"]
