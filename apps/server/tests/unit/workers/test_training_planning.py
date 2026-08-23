import asyncio
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import uuid4

import pytest

from riva.agents import TrainingPlanningAgent
from riva.integrations import LLMUsage, ProviderUnavailableError
from riva.models import AgentRun, AgentRunStatus
from riva.schemas.training_planning import (
    TrainingPlanningInput,
    TrainingPlanningRunPayload,
    TrainingPlanningTargetedPracticeOutput,
)
from riva.workers import AgentExecutionError, TrainingPlanningHandler
from tests.helpers.llm import FakeLLMProvider

NOW = datetime(2026, 8, 18, 10, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def freeze_worker_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("riva.workers.training_planning.utc_now", lambda: NOW)


def planning_input() -> TrainingPlanningInput:
    return TrainingPlanningInput.model_validate(
        {
            "interactionLanguage": "en",
            "targetRole": {
                "id": "00000000-0000-0000-0000-000000000401",
                "title": "Backend Engineer",
                "company": "Example Labs",
                "recruitmentType": "experienced",
                "location": "Remote",
            },
            "matchingAnalysis": None,
            "trainingMemory": {},
            "recentTraining": [],
            "constraints": {
                "targetedPractice": {
                    "questionTypes": ["projectDeepDive"],
                    "difficulties": ["basic"],
                    "canPrioritizeWeaknesses": False,
                },
                "mockInterview": {
                    "rounds": ["technical"],
                    "difficulties": ["basic"],
                    "durationMinutes": [15],
                },
            },
        }
    )


def targeted_output() -> dict[str, object]:
    return {
        "action": "targetedPractice",
        "reason": "Practice the frozen evidence direction.",
        "focusAreas": ["project results"],
        "questionType": "projectDeepDive",
        "difficulty": "basic",
        "prioritizeWeaknesses": False,
    }


def running_run(
    input: TrainingPlanningInput,
    *,
    status: AgentRunStatus = AgentRunStatus.RUNNING,
) -> AgentRun:
    request_id = uuid4()
    payload = TrainingPlanningRunPayload(
        requestId=request_id,
        targetRoleId=input.target_role.id,
        interactionLanguage=input.interaction_language,
        contextFingerprint=("0" * 64),
        trainingPlanningInput=input,
    )
    from riva.core.training_planning import training_planning_context_fingerprint

    payload.context_fingerprint = training_planning_context_fingerprint(input)
    return AgentRun(
        id=uuid4(),
        user_id=uuid4(),
        agent_id=TrainingPlanningAgent.agent_id,
        prompt_id=TrainingPlanningAgent.agent_id,
        prompt_version=TrainingPlanningAgent.agent_version,
        output_schema_id=TrainingPlanningAgent.output_schema_id,
        status=status,
        payload=cast(dict[str, object], payload.model_dump(mode="json", by_alias=True)),
        idempotency_key=f"training-planning:{request_id}",
        attempt_count=1,
        max_attempts=3,
        available_at=NOW,
        lease_owner="training-worker",
        lease_token=uuid4(),
        lease_expires_at=NOW + timedelta(minutes=5),
        started_at=NOW,
        created_at=NOW,
    )


class ExplodingSessionFactory:
    def __call__(self):
        raise AssertionError("training planner must use the run snapshot")


def handler(provider: FakeLLMProvider) -> TrainingPlanningHandler:
    return TrainingPlanningHandler(
        session_factory=cast(object, ExplodingSessionFactory()),
        agent=TrainingPlanningAgent(provider, model="training-planner-model"),
    )


def test_handler_uses_frozen_payload_without_opening_a_context_session() -> None:
    input = planning_input()
    provider = FakeLLMProvider(
        [targeted_output()],
        usage=LLMUsage(input_tokens=3, output_tokens=2),
    )
    run = running_run(input)

    result = asyncio.run(handler(provider).execute(run))

    assert isinstance(result.output, TrainingPlanningTargetedPracticeOutput)
    assert len(provider.calls) == 1
    request = provider.calls[0]
    assert '"projectDeepDive"' in request.messages[1].content
    assert '"training-planner"' not in request.messages[1].content


@pytest.mark.parametrize(
    "status",
    [AgentRunStatus.QUEUED, AgentRunStatus.SUCCEEDED, AgentRunStatus.FAILED],
)
def test_handler_rejects_non_running_runs_as_non_retryable(
    status: AgentRunStatus,
) -> None:
    with pytest.raises(AgentExecutionError) as raised:
        asyncio.run(
            handler(FakeLLMProvider([])).execute(
                running_run(planning_input(), status=status)
            )
        )

    assert raised.value.retryable is False
    assert raised.value.code == "invalid_training_planning_run"


def test_handler_rejects_expired_lease_as_non_retryable() -> None:
    run = running_run(planning_input())
    run.lease_expires_at = NOW - timedelta(seconds=1)

    with pytest.raises(AgentExecutionError) as raised:
        asyncio.run(handler(FakeLLMProvider([])).execute(run))

    assert raised.value.retryable is False
    assert raised.value.code == "invalid_training_planning_run"


def test_handler_rejects_invalid_snapshot_as_non_retryable() -> None:
    run = running_run(planning_input())
    run.payload["contextFingerprint"] = "f" * 64

    with pytest.raises(AgentExecutionError) as raised:
        asyncio.run(handler(FakeLLMProvider([])).execute(run))

    assert raised.value.retryable is False
    assert raised.value.code == "training_planning_snapshot_invalid"


def test_provider_transient_error_is_left_for_worker_retry_policy() -> None:
    run = running_run(planning_input())
    provider = FakeLLMProvider([ProviderUnavailableError()])

    with pytest.raises(ProviderUnavailableError):
        asyncio.run(handler(provider).execute(run))
