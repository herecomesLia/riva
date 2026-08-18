from riva.agents import AgentResult, TrainingPlanningAgent
from riva.core.training_planning import (
    validate_training_planning_output_contract,
)
from riva.models import AgentRun, AgentRunStatus
from riva.prompts import TRAINING_PLANNING_PROMPT
from riva.services.training_planning import (
    TrainingPlanningStateError,
    validate_training_planning_run,
)
from riva.utils import utc_now
from riva.workers.errors import AgentExecutionError
from riva.workers.runtime import SessionFactory


class TrainingPlanningHandler:
    agent_id = "training-planner"

    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        agent: TrainingPlanningAgent | None = None,
    ) -> None:
        if agent is None:
            raise ValueError("a training planning agent is required")
        if (
            agent.agent_id != self.agent_id
            or agent.prompt is not TRAINING_PLANNING_PROMPT
            or agent.prompt_id != TRAINING_PLANNING_PROMPT.prompt_id
            or agent.prompt_version != TRAINING_PLANNING_PROMPT.version
        ):
            raise ValueError(
                "agent must be the canonical training planning agent"
            )
        self.session_factory = session_factory
        self.agent = agent

    async def execute(
        self,
        run: AgentRun,
    ) -> AgentResult:
        if not _has_valid_lease(run):
            raise AgentExecutionError(
                "invalid_training_planning_run",
                retryable=False,
            )
        try:
            planning_input = validate_training_planning_run(
                run
            ).training_planning_input
        except TrainingPlanningStateError as error:
            raise AgentExecutionError(error.code, retryable=False) from None

        result = await self.agent.run(planning_input)
        if (
            result.agent_id != run.agent_id
            or result.prompt_id != run.prompt_id
            or result.prompt_version != run.prompt_version
        ):
            raise AgentExecutionError(
                "agent_run_result_mismatch",
                retryable=False,
            )
        try:
            validate_training_planning_output_contract(
                planning_input,
                result.output,
            )
        except Exception as error:
            raise AgentExecutionError(
                "training_planning_output_invalid",
                retryable=False,
            ) from error
        return result


def _has_valid_lease(run: AgentRun) -> bool:
    if (
        run.status is not AgentRunStatus.RUNNING
        or run.agent_id != TrainingPlanningHandler.agent_id
        or run.lease_owner is None
        or run.lease_token is None
        or run.lease_expires_at is None
    ):
        return False
    now = utc_now()
    expires_at = run.lease_expires_at
    if expires_at.tzinfo is None or expires_at.utcoffset() is None:
        return False
    return expires_at > now


__all__ = ["TrainingPlanningHandler"]
