from collections.abc import Callable, Mapping
from dataclasses import replace

from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult, InterviewReviewAgent
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.interview_review import InterviewReviewOutput
from riva.services.interview_review import (
    InterviewReviewService,
    InterviewReviewStateError,
)
from riva.prompts import INTERVIEW_REVIEW_PROMPT
from riva.services.interview_review_prompt_versions import (
    get_interview_review_prompt,
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
        agent: InterviewReviewAgent | None = None,
        legacy_agent: InterviewReviewAgent | None = None,
        agents: Mapping[str, InterviewReviewAgent] | None = None,
        review_service_factory: ReviewServiceFactory = InterviewReviewService,
    ) -> None:
        if agent is not None and agent.agent_id != self.agent_id:
            raise ValueError("agent must be the interview review agent")
        self.session_factory = session_factory
        if agents is None:
            if agent is None:
                raise ValueError("at least one interview review agent is required")
            resolved_agents = {agent.prompt_version: agent}
            if legacy_agent is not None:
                resolved_agents[legacy_agent.prompt_version] = legacy_agent
        else:
            resolved_agents = dict(agents)
            if agent is not None:
                resolved_agents.setdefault(agent.prompt_version, agent)
            if legacy_agent is not None:
                resolved_agents.setdefault(legacy_agent.prompt_version, legacy_agent)
        if not resolved_agents:
            raise ValueError("at least one interview review agent is required")
        for version, current_agent in resolved_agents.items():
            if not hasattr(current_agent, "prompt_version"):
                raise ValueError(
                    "interview review agent mapping must match agent identity and version"
                )
            try:
                prompt = get_interview_review_prompt(version)
            except ValueError:
                raise ValueError(
                    "interview review agent mapping contains an unsupported version"
                ) from None
            if (
                current_agent.agent_id != self.agent_id
                or current_agent.prompt_version != version
                or current_agent.prompt is not prompt
                or current_agent.prompt_id != prompt.prompt_id
            ):
                raise ValueError(
                    "interview review agent mapping must match agent identity and version"
                )
        self._agents = resolved_agents
        self.agents = dict(resolved_agents)
        self.agent = self._agents.get(
            INTERVIEW_REVIEW_PROMPT.version
        ) or next(iter(self._agents.values()))
        self.legacy_agent = self._agents.get("1")
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

        agent = self._agent_for_run(run)

        try:
            async with self.session_factory() as session:
                review_input = await self.review_service_factory(
                    session
                ).load_review_input(run)
        except InterviewReviewStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        result = await agent.run(review_input)
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

    def _agent_for_run(self, run: AgentRun) -> InterviewReviewAgent:
        try:
            prompt = get_interview_review_prompt(run.prompt_version)
        except ValueError:
            raise AgentExecutionError(
                "invalid_interview_review_run",
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
                "invalid_interview_review_run",
                retryable=False,
            )
        return agent


__all__ = ["InterviewReviewHandler", "ReviewServiceFactory"]
