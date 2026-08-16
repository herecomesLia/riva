import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from riva.agents import AgentResult
from riva.integrations import LLMUsage
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.interview_turn import InterviewTurnOutput
from riva.workers import InterviewTurnHandler


NOW = datetime(2026, 8, 16, 10, 0, tzinfo=UTC)


def run() -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=uuid4(),
        agent_id="interview-turn",
        prompt_id="interview-turn",
        prompt_version="1",
        output_schema_id="interview-turn-v1",
        status=AgentRunStatus.RUNNING,
        payload={"sessionId": str(uuid4()), "sessionVersion": 3},
        idempotency_key="interview-turn-test",
        attempt_count=1,
        max_attempts=3,
        available_at=NOW,
        lease_owner="worker",
        lease_token=uuid4(),
        lease_expires_at=NOW,
        started_at=NOW,
        model="test-model",
    )


def output() -> InterviewTurnOutput:
    return InterviewTurnOutput.model_validate(
        {
            "assessment": {
                "score": 70,
                "summary": "The answer is relevant.",
                "strengths": ["Relevance"],
                "issues": ["Needs evidence"],
            },
            "nextAction": {"type": "completeQuestion"},
        }
    )


class FakeAgent:
    agent_id = "interview-turn"

    async def run(self, input: object) -> AgentResult[InterviewTurnOutput]:
        return AgentResult(
            output=output(),
            agent_id="interview-turn",
            prompt_id="interview-turn",
            prompt_version="1",
            provider="fake-provider",
            model="test-model",
            usage=LLMUsage(input_tokens=10, output_tokens=20),
        )


class FakeTurnService:
    loaded: list[object] = []
    persisted: list[InterviewTurnOutput] = []

    def __init__(self, _session) -> None:
        pass

    async def load_turn_input(self, _run: AgentRun) -> object:
        value = object()
        self.loaded.append(value)
        return value

    async def persist_success(
        self,
        _run: AgentRun,
        turn_output: InterviewTurnOutput,
    ) -> InterviewTurnOutput:
        self.persisted.append(turn_output)
        return turn_output


class AsyncSessionFactory:
    class Context:
        async def __aenter__(self):
            return object()

        async def __aexit__(self, *_args: object) -> None:
            return None

    def __call__(self):
        return self.Context()


def test_handler_loads_frozen_input_and_persists_structured_turn() -> None:
    FakeTurnService.loaded = []
    FakeTurnService.persisted = []
    handler = InterviewTurnHandler(
        session_factory=AsyncSessionFactory(),
        agent=FakeAgent(),  # type: ignore[arg-type]
        turn_service_factory=FakeTurnService,  # type: ignore[arg-type]
    )

    result = asyncio.run(handler.execute(run()))

    assert result.output.next_action.type == "completeQuestion"
    assert len(FakeTurnService.loaded) == 1
    assert len(FakeTurnService.persisted) == 1
