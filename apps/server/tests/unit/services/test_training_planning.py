import asyncio
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from riva.core.training_planning import training_planning_context_fingerprint
from riva.models import AgentRun, AgentRunStatus, User
from riva.prompts import TRAINING_PLANNING_PROMPT
from riva.schemas.training_planning import (
    EnsureCurrentTrainingPlanningRequest,
    StartTrainingPlanningRequest,
    TrainingPlanningInput,
    TrainingPlanningOutput,
    TrainingPlanningRunPayload,
)
from riva.services.training_planning import (
    TRAINING_PLANNING_FAILURE_REASON,
    TRAINING_PLANNING_REQUEST_CONFLICT,
    TRAINING_PLANNING_SNAPSHOT_INVALID,
    TRAINING_PLANNING_STATE_CONFLICT,
    TRAINING_PLANNING_UNAVAILABLE,
    TrainingPlanningService,
    TrainingPlanningStateError,
    validate_training_planning_run,
)

NOW = datetime(2026, 8, 18, 10, 0, tzinfo=UTC)


class ScriptedSession:
    def __init__(self, *scalar_values: object) -> None:
        self.scalar_values = list(scalar_values)
        self.rollback_count = 0

    async def scalar(self, _statement):
        if not self.scalar_values:
            raise AssertionError("unexpected scalar query")
        return self.scalar_values.pop(0)

    async def rollback(self) -> None:
        self.rollback_count += 1


class ScalarRowsSession(ScriptedSession):
    def __init__(self, *scalar_values: object, rows: list[AgentRun]) -> None:
        super().__init__(*scalar_values)
        self.rows = rows

    async def scalars(self, _statement):
        class Result:
            def __init__(self, values: list[AgentRun]) -> None:
                self.values = values

            def all(self) -> list[AgentRun]:
                return self.values

        return Result(self.rows)


class FakeAgentRunService:
    calls: list[dict[str, object]] = []
    next_run: AgentRun | None = None

    def __init__(self, _session) -> None:
        pass

    async def enqueue(self, **kwargs: object) -> AgentRun:
        self.calls.append(kwargs)
        if self.next_run is None:
            raise AssertionError("missing fake AgentRun")
        self.next_run.payload = kwargs["payload"]
        return self.next_run


class CurrentFakeAgentRunService(FakeAgentRunService):
    async def enqueue(self, **kwargs: object) -> AgentRun:
        self.calls.append(kwargs)
        if self.next_run is None:
            raise AssertionError("missing fake AgentRun")
        self.next_run.payload = kwargs["payload"]
        self.next_run.idempotency_key = kwargs["idempotency_key"]
        return self.next_run


def owner() -> User:
    return User(
        id=uuid4(),
        username="training-planner-service",
        normalized_username="training-planner-service",
        password_hash="hash",
        display_name="Training Planner Service",
    )


def planning_input(*, role_id: UUID | None = None) -> TrainingPlanningInput:
    role_id = role_id or uuid4()
    return TrainingPlanningInput.model_validate(
        {
            "interactionLanguage": "en",
            "targetRole": {
                "id": role_id,
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


def output() -> TrainingPlanningOutput:
    from pydantic import TypeAdapter

    return TypeAdapter(TrainingPlanningOutput).validate_python(
        {
            "action": "targetedPractice",
            "reason": "Practice the current evidence gap.",
            "focusAreas": ["project results"],
            "questionType": "projectDeepDive",
            "difficulty": "basic",
            "prioritizeWeaknesses": False,
        }
    )


def run_for(
    user_id: UUID,
    input: TrainingPlanningInput,
    *,
    request_id: UUID,
    status: AgentRunStatus = AgentRunStatus.QUEUED,
    result: dict[str, object] | None = None,
) -> AgentRun:
    payload = TrainingPlanningRunPayload(
        requestId=request_id,
        targetRoleId=input.target_role.id,
        interactionLanguage=input.interaction_language,
        contextFingerprint=training_planning_context_fingerprint(input),
        trainingPlanningInput=input,
    )
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id=TRAINING_PLANNING_PROMPT.prompt_id,
        prompt_id=TRAINING_PLANNING_PROMPT.prompt_id,
        prompt_version=TRAINING_PLANNING_PROMPT.version,
        output_schema_id=TRAINING_PLANNING_PROMPT.output_schema_id,
        status=status,
        payload=payload.model_dump(mode="json", by_alias=True),
        idempotency_key=f"training-planning:{request_id}",
        attempt_count=0 if status is AgentRunStatus.QUEUED else 1,
        max_attempts=3,
        created_at=NOW,
        available_at=NOW,
        started_at=None if status is AgentRunStatus.QUEUED else NOW,
        finished_at=(
            NOW if status in {AgentRunStatus.SUCCEEDED, AgentRunStatus.FAILED} else None
        ),
        provider="fake" if status is AgentRunStatus.SUCCEEDED else None,
        model="test-model",
        input_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        output_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        result=result,
        error_code="provider_unavailable" if status is AgentRunStatus.FAILED else None,
    )


def test_new_request_snapshots_authoritative_input_and_enqueues_three_attempts(
    monkeypatch,
) -> None:
    current_user = owner()
    request_id = uuid4()
    input = planning_input()
    run = run_for(current_user.id, input, request_id=request_id)
    FakeAgentRunService.calls = []
    FakeAgentRunService.next_run = run
    session = ScriptedSession(None)
    service = TrainingPlanningService(
        session,  # type: ignore[arg-type]
        llm_provider="qwen",
        llm_model="planner-model",
        agent_run_service_factory=FakeAgentRunService,
    )

    async def build_input(**_kwargs):
        return input

    monkeypatch.setattr(service, "_build_authoritative_input", build_input)
    response = asyncio.run(
        service.start_planning(
            current_user,
            StartTrainingPlanningRequest(
                requestId=request_id,
                targetRoleId=input.target_role.id,
            ),
            interaction_language="en",
        )
    )

    assert response.status == "queued"
    assert response.target_role_id == input.target_role.id
    assert FakeAgentRunService.calls[0]["max_attempts"] == 3
    assert FakeAgentRunService.calls[0]["idempotency_key"] == (
        f"training-planning:{request_id}"
    )
    assert run.payload["trainingPlanningInput"] == input.model_dump(
        mode="json", by_alias=True
    )


def test_replay_returns_original_run_before_model_or_context_lookup(
    monkeypatch,
) -> None:
    current_user = owner()
    request_id = uuid4()
    input = planning_input()
    run = run_for(current_user.id, input, request_id=request_id)
    session = ScriptedSession(run)
    service = TrainingPlanningService(
        session,  # type: ignore[arg-type]
        llm_provider=None,
        llm_model=None,
    )

    async def should_not_rebuild(**_kwargs):
        raise AssertionError("replay must use the persisted snapshot")

    monkeypatch.setattr(service, "_build_authoritative_input", should_not_rebuild)
    response = asyncio.run(
        service.start_planning(
            current_user,
            StartTrainingPlanningRequest(
                requestId=request_id,
                targetRoleId=input.target_role.id,
            ),
            interaction_language="en",
        )
    )

    assert response.run_id == run.id
    assert response.status == "queued"


def test_replay_with_different_role_or_language_is_a_conflict() -> None:
    current_user = owner()
    request_id = uuid4()
    input = planning_input()
    run = run_for(current_user.id, input, request_id=request_id)
    service = TrainingPlanningService(
        ScriptedSession(run),  # type: ignore[arg-type]
        llm_provider="qwen",
        llm_model="planner-model",
    )

    with pytest.raises(TrainingPlanningStateError) as raised:
        asyncio.run(
            service.start_planning(
                current_user,
                StartTrainingPlanningRequest(
                    requestId=request_id,
                    targetRoleId=uuid4(),
                ),
                interaction_language="en",
            )
        )
    assert raised.value.code == TRAINING_PLANNING_REQUEST_CONFLICT

    service = TrainingPlanningService(
        ScriptedSession(run),  # type: ignore[arg-type]
        llm_provider="qwen",
        llm_model="planner-model",
    )
    with pytest.raises(TrainingPlanningStateError) as raised:
        asyncio.run(
            service.start_planning(
                current_user,
                StartTrainingPlanningRequest(
                    requestId=request_id,
                    targetRoleId=input.target_role.id,
                ),
                interaction_language="zh-CN",
            )
        )
    assert raised.value.code == TRAINING_PLANNING_REQUEST_CONFLICT


def test_current_planning_replays_matching_fingerprint_without_llm_configuration(
    monkeypatch,
) -> None:
    current_user = owner()
    input = planning_input()
    run = run_for(current_user.id, input, request_id=uuid4())
    session = ScalarRowsSession(rows=[run])
    service = TrainingPlanningService(
        session,  # type: ignore[arg-type]
        llm_provider=None,
        llm_model=None,
    )

    async def build_input(**_kwargs):
        return input

    monkeypatch.setattr(service, "_build_authoritative_input", build_input)
    response = asyncio.run(
        service.ensure_current_planning(
            current_user,
            EnsureCurrentTrainingPlanningRequest(
                targetRoleId=input.target_role.id,
            ),
            interaction_language="en",
        )
    )

    assert response.run_id == run.id
    assert response.status == "queued"


def test_current_planning_uses_stable_request_id_for_a_new_fingerprint(
    monkeypatch,
) -> None:
    current_user = owner()
    input = planning_input()
    run = run_for(current_user.id, input, request_id=uuid4())
    CurrentFakeAgentRunService.calls = []
    CurrentFakeAgentRunService.next_run = run
    session = ScalarRowsSession(rows=[])
    service = TrainingPlanningService(
        session,  # type: ignore[arg-type]
        llm_provider="qwen",
        llm_model="planner-model",
        agent_run_service_factory=CurrentFakeAgentRunService,
    )

    async def build_input(**_kwargs):
        return input

    monkeypatch.setattr(service, "_build_authoritative_input", build_input)
    request = EnsureCurrentTrainingPlanningRequest(targetRoleId=input.target_role.id)
    first = asyncio.run(
        service.ensure_current_planning(
            current_user,
            request,
            interaction_language="en",
        )
    )

    assert first.run_id == run.id
    assert CurrentFakeAgentRunService.calls[0]["idempotency_key"].startswith(
        "training-planning:"
    )
    first_request_key = CurrentFakeAgentRunService.calls[0]["idempotency_key"]

    CurrentFakeAgentRunService.next_run = run_for(
        current_user.id,
        input,
        request_id=uuid4(),
    )
    session.rows = []
    second = asyncio.run(
        service.ensure_current_planning(
            current_user,
            request,
            interaction_language="en",
        )
    )

    assert second.run_id == CurrentFakeAgentRunService.next_run.id
    assert CurrentFakeAgentRunService.calls[1]["idempotency_key"] == first_request_key


def test_new_request_without_llm_configuration_is_unavailable() -> None:
    current_user = owner()
    session = ScriptedSession(None)
    service = TrainingPlanningService(
        session,  # type: ignore[arg-type]
        llm_provider=None,
        llm_model=None,
    )

    with pytest.raises(TrainingPlanningStateError) as raised:
        asyncio.run(
            service.start_planning(
                current_user,
                StartTrainingPlanningRequest(
                    requestId=uuid4(),
                    targetRoleId=uuid4(),
                ),
                interaction_language="en",
            )
        )
    assert raised.value.code == TRAINING_PLANNING_UNAVAILABLE


def test_status_projects_success_and_fixed_failure_reason() -> None:
    current_user = owner()
    request_id = uuid4()
    input = planning_input()
    persisted_output = output().model_dump(mode="json", by_alias=True)
    succeeded = run_for(
        current_user.id,
        input,
        request_id=request_id,
        status=AgentRunStatus.SUCCEEDED,
        result=persisted_output,
    )
    service = TrainingPlanningService(
        ScriptedSession(succeeded),  # type: ignore[arg-type]
    )
    response = asyncio.run(
        service.get_planning_status(user_id=current_user.id, run_id=succeeded.id)
    )
    assert response.status == "succeeded"
    assert response.plan is not None

    failed = run_for(
        current_user.id,
        input,
        request_id=uuid4(),
        status=AgentRunStatus.FAILED,
    )
    service = TrainingPlanningService(
        ScriptedSession(failed),  # type: ignore[arg-type]
    )
    response = asyncio.run(
        service.get_planning_status(user_id=current_user.id, run_id=failed.id)
    )
    assert response.status == "failed"
    assert response.failure_reason == TRAINING_PLANNING_FAILURE_REASON


def test_corrupted_fingerprint_or_result_is_state_conflict() -> None:
    current_user = owner()
    input = planning_input()
    run = run_for(current_user.id, input, request_id=uuid4())
    run.payload["contextFingerprint"] = "0" * 64
    with pytest.raises(TrainingPlanningStateError) as raised:
        validate_training_planning_run(run)
    assert raised.value.code == TRAINING_PLANNING_SNAPSHOT_INVALID

    run = run_for(
        current_user.id,
        input,
        request_id=uuid4(),
        status=AgentRunStatus.SUCCEEDED,
        result={"action": "mockInterview"},
    )
    service = TrainingPlanningService(
        ScriptedSession(run),  # type: ignore[arg-type]
    )
    with pytest.raises(TrainingPlanningStateError) as raised:
        asyncio.run(service.get_planning_status(user_id=current_user.id, run_id=run.id))
    assert raised.value.code == TRAINING_PLANNING_STATE_CONFLICT


def test_run_validation_rejects_wrong_idempotency_key() -> None:
    current_user = owner()
    input = planning_input()
    run = run_for(current_user.id, input, request_id=uuid4())
    run.idempotency_key = "training-planning:other"

    with pytest.raises(TrainingPlanningStateError) as raised:
        validate_training_planning_run(run)
    assert raised.value.code == "training_planning_run_invalid"
