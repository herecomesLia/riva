import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from riva.agents import AgentResult
from riva.integrations import LLMUsage
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.interview_planning import InterviewPlanningOutput
from riva.services.interview_planning_prompt_versions import (
    get_interview_planning_prompt,
)
from riva.workers import InterviewPlanningHandler
from riva.workers.errors import AgentExecutionError

NOW = datetime(2026, 8, 16, 10, 0, tzinfo=UTC)


def output() -> InterviewPlanningOutput:
    return InterviewPlanningOutput.model_validate(
        {
            "totalMainQuestions": 3,
            "questions": [
                {
                    "order": order,
                    "questionType": "roleCapability",
                    "prompt": f"Question {order}",
                    "assessedCapabilities": ["Ownership"],
                    "objective": "Verify evidence.",
                    "followUpDirections": ["Probe evidence."],
                    "scoringFocus": ["Evidence"],
                }
                for order in range(1, 4)
            ],
        }
    )


def run(prompt_version: str = "1") -> AgentRun:
    prompt = get_interview_planning_prompt(prompt_version)
    return AgentRun(
        id=uuid4(),
        user_id=uuid4(),
        agent_id="interview-planner",
        prompt_id="interview-planner",
        prompt_version=prompt_version,
        output_schema_id=prompt.output_schema_id,
        status=AgentRunStatus.RUNNING,
        payload={"sessionId": str(uuid4()), "sessionVersion": 1},
        idempotency_key="interview-planning-test",
        attempt_count=1,
        max_attempts=3,
        available_at=NOW,
        lease_owner="worker",
        lease_token=uuid4(),
        lease_expires_at=NOW,
        started_at=NOW,
        model="test-model",
    )


class FakeAgent:
    agent_id = "interview-planner"

    def __init__(
        self,
        planned_output: InterviewPlanningOutput,
        *,
        prompt_version: str = "1",
        result_prompt_version: str | None = None,
    ) -> None:
        self.planned_output = planned_output
        self.prompt = get_interview_planning_prompt(prompt_version)
        self.prompt_id = self.prompt.prompt_id
        self.prompt_version = prompt_version
        self.result_prompt_version = result_prompt_version or prompt_version
        self.inputs: list[object] = []

    async def run(self, input: object) -> AgentResult[InterviewPlanningOutput]:
        self.inputs.append(input)
        return AgentResult(
            output=self.planned_output,
            agent_id="interview-planner",
            prompt_id="interview-planner",
            prompt_version=self.result_prompt_version,
            provider="fake-provider",
            model="test-model",
            usage=LLMUsage(input_tokens=10, output_tokens=20),
        )


class FakePlanningService:
    loaded: list[object] = []
    persisted: list[InterviewPlanningOutput] = []

    def __init__(self, _session) -> None:
        pass

    async def load_planning_input(self, _run: AgentRun) -> object:
        value = object()
        self.loaded.append(value)
        return value

    async def persist_success(
        self,
        _run: AgentRun,
        planned_output: InterviewPlanningOutput,
    ) -> None:
        self.persisted.append(planned_output)


class AsyncSessionFactory:
    class Context:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, *_args: object) -> None:
            return None

    def __call__(self):
        return self.Context()


def test_handler_runs_structured_planner_and_persists_output() -> None:
    planned_output = output()
    agent = FakeAgent(planned_output)
    FakePlanningService.loaded = []
    FakePlanningService.persisted = []
    handler = InterviewPlanningHandler(
        session_factory=AsyncSessionFactory(),
        agent=agent,  # type: ignore[arg-type]
        planning_service_factory=FakePlanningService,  # type: ignore[arg-type]
    )

    result = asyncio.run(handler.execute(run()))

    assert result.output is planned_output
    assert len(agent.inputs) == 1
    assert FakePlanningService.persisted == [planned_output]


def test_handler_routes_v1_and_v2_to_the_matching_agent() -> None:
    legacy = FakeAgent(output(), prompt_version="1")
    current = FakeAgent(output(), prompt_version="2")
    handler = InterviewPlanningHandler(
        session_factory=AsyncSessionFactory(),
        agents={"1": legacy, "2": current},  # type: ignore[arg-type]
        planning_service_factory=FakePlanningService,  # type: ignore[arg-type]
    )

    asyncio.run(handler.execute(run("1")))
    asyncio.run(handler.execute(run("2")))

    assert len(legacy.inputs) == 1
    assert len(current.inputs) == 1


def test_handler_rejects_unsupported_version_as_non_retryable() -> None:
    handler = InterviewPlanningHandler(
        session_factory=AsyncSessionFactory(),
        agent=FakeAgent(output()),  # type: ignore[arg-type]
        planning_service_factory=FakePlanningService,  # type: ignore[arg-type]
    )
    invalid = AgentRun(
        id=uuid4(),
        user_id=uuid4(),
        agent_id="interview-planner",
        prompt_id="interview-planner",
        prompt_version="99",
        output_schema_id="interview-plan-v1",
        status=AgentRunStatus.RUNNING,
        payload={},
        idempotency_key="invalid-version",
        attempt_count=1,
        max_attempts=3,
        available_at=NOW,
        lease_owner="worker",
        lease_token=uuid4(),
        lease_expires_at=NOW,
        started_at=NOW,
        model="test-model",
    )

    with pytest.raises(AgentExecutionError) as error:
        asyncio.run(handler.execute(invalid))

    assert error.value.code == "invalid_interview_planning_run"
    assert error.value.retryable is False


def test_handler_rejects_result_version_mismatch() -> None:
    agent = FakeAgent(
        output(),
        prompt_version="2",
        result_prompt_version="1",
    )
    handler = InterviewPlanningHandler(
        session_factory=AsyncSessionFactory(),
        agent=agent,  # type: ignore[arg-type]
        planning_service_factory=FakePlanningService,  # type: ignore[arg-type]
    )

    with pytest.raises(AgentExecutionError) as error:
        asyncio.run(handler.execute(run("2")))

    assert error.value.code == "agent_run_result_mismatch"
    assert error.value.retryable is False
