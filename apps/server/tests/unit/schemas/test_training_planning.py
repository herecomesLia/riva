from datetime import UTC, datetime, timedelta

from pydantic import TypeAdapter, ValidationError
import pytest

from riva.core.training_planning import training_planning_context_fingerprint
from riva.schemas.training_planning import (
    StartTrainingPlanningRequest,
    TrainingPlanningInput,
    TrainingPlanningMockInterviewOutput,
    TrainingPlanningMockInterviewRecord,
    TrainingPlanningOutput,
    TrainingPlanningRunPayload,
    TrainingPlanningStatusResponse,
    TrainingPlanningTargetedPracticeOutput,
    TrainingPlanningTargetedPracticeRecord,
)


def input_payload() -> dict[str, object]:
    return {
        "interactionLanguage": "en",
        "targetRole": {
            "id": "00000000-0000-0000-0000-000000000201",
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
                "canPrioritizeWeaknesses": True,
            },
            "mockInterview": {
                "rounds": ["technical"],
                "difficulties": ["basic"],
                "durationMinutes": [15, 30, 45],
            },
        },
    }


def targeted_record(index: int, ended_at: datetime) -> dict[str, object]:
    return {
        "recordId": f"00000000-0000-0000-0000-{index:012d}",
        "kind": "targetedPractice",
        "status": "completed",
        "overallScore": 70,
        "endedAt": ended_at.isoformat(),
        "questionType": "projectDeepDive",
        "difficulty": "basic",
    }


def test_both_output_variants_parse_as_a_discriminated_union() -> None:
    adapter = TypeAdapter(TrainingPlanningOutput)

    targeted = adapter.validate_python(
        {
            "action": "targetedPractice",
            "reason": "Practice project results evidence.",
            "focusAreas": ["project results"],
            "questionType": "projectDeepDive",
            "difficulty": "basic",
            "prioritizeWeaknesses": True,
        }
    )
    mock = adapter.validate_python(
        {
            "action": "mockInterview",
            "reason": "Combine risk and pressure response.",
            "focusAreas": ["risk control", "pressure response"],
            "round": "comprehensive",
            "difficulty": "pressure",
            "durationMinutes": 30,
        }
    )

    assert isinstance(targeted, TrainingPlanningTargetedPracticeOutput)
    assert isinstance(mock, TrainingPlanningMockInterviewOutput)
    assert targeted.model_dump(mode="json", by_alias=True)["action"] == (
        "targetedPractice"
    )
    assert mock.model_dump(mode="json", by_alias=True)["durationMinutes"] == 30


def test_recent_training_uses_the_kind_discriminator() -> None:
    payload = input_payload()
    payload["recentTraining"] = [
        targeted_record(201, datetime(2026, 8, 17, 10, tzinfo=UTC)),
        {
            "recordId": "00000000-0000-0000-0000-000000000202",
            "kind": "mockInterview",
            "status": "endedEarly",
            "overallScore": None,
            "endedAt": "2026-08-16T10:00:00Z",
            "round": "technical",
            "difficulty": "pressure",
        },
    ]

    planning_input = TrainingPlanningInput.model_validate(payload)

    assert isinstance(
        planning_input.recent_training[0],
        TrainingPlanningTargetedPracticeRecord,
    )
    assert isinstance(
        planning_input.recent_training[1],
        TrainingPlanningMockInterviewRecord,
    )

    invalid = input_payload()
    invalid["recentTraining"] = [
        {
            **targeted_record(203, datetime(2026, 8, 17, 10, tzinfo=UTC)),
            "kind": "mockInterview",
        }
    ]
    with pytest.raises(ValidationError):
        TrainingPlanningInput.model_validate(invalid)


def test_recent_training_is_newest_first_and_limited_to_five() -> None:
    payload = input_payload()
    start = datetime(2026, 8, 17, 10, tzinfo=UTC)
    payload["recentTraining"] = [
        targeted_record(210 + index, start - timedelta(days=index))
        for index in range(5)
    ]
    planning_input = TrainingPlanningInput.model_validate(payload)
    assert len(planning_input.recent_training) == 5

    too_many = input_payload()
    too_many["recentTraining"] = [
        targeted_record(220 + index, start - timedelta(days=index))
        for index in range(6)
    ]
    with pytest.raises(ValidationError):
        TrainingPlanningInput.model_validate(too_many)

    out_of_order = input_payload()
    out_of_order["recentTraining"] = [
        targeted_record(230, start - timedelta(days=1)),
        targeted_record(231, start),
    ]
    with pytest.raises(ValidationError, match="newest to oldest"):
        TrainingPlanningInput.model_validate(out_of_order)


def test_duration_minutes_is_closed_and_constraints_are_non_empty() -> None:
    valid = TrainingPlanningInput.model_validate(input_payload())
    assert valid.constraints.mock_interview.duration_minutes == [15, 30, 45]

    invalid_duration = input_payload()
    invalid_duration["constraints"] = {
        **invalid_duration["constraints"],  # type: ignore[typeddict-item]
        "mockInterview": {
            "rounds": ["technical"],
            "difficulties": ["basic"],
            "durationMinutes": [60],
        },
    }
    with pytest.raises(ValidationError):
        TrainingPlanningInput.model_validate(invalid_duration)

    for section, field in (
        ("targetedPractice", "questionTypes"),
        ("targetedPractice", "difficulties"),
        ("mockInterview", "rounds"),
        ("mockInterview", "difficulties"),
        ("mockInterview", "durationMinutes"),
    ):
        invalid = input_payload()
        constraints = dict(invalid["constraints"])  # type: ignore[arg-type]
        section_payload = dict(constraints[section])  # type: ignore[index]
        section_payload[field] = []
        constraints[section] = section_payload
        invalid["constraints"] = constraints
        with pytest.raises(ValidationError):
            TrainingPlanningInput.model_validate(invalid)


def test_ended_at_must_be_timezone_aware() -> None:
    invalid = input_payload()
    invalid["recentTraining"] = [
        targeted_record(240, datetime(2026, 8, 17, 10)),
    ]

    with pytest.raises(ValidationError, match="timezone-aware"):
        TrainingPlanningInput.model_validate(invalid)


def test_lifecycle_request_and_payload_preserve_lineage_and_fingerprint() -> None:
    request = StartTrainingPlanningRequest.model_validate(
        {
            "requestId": "00000000-0000-0000-0000-000000000251",
            "targetRoleId": "00000000-0000-0000-0000-000000000201",
        }
    )
    planning_input = TrainingPlanningInput.model_validate(input_payload())
    payload = TrainingPlanningRunPayload.model_validate(
        {
            "requestId": request.request_id,
            "targetRoleId": request.target_role_id,
            "interactionLanguage": planning_input.interaction_language,
            "contextFingerprint": training_planning_context_fingerprint(
                planning_input
            ),
            "trainingPlanningInput": planning_input,
        }
    )

    assert payload.target_role_id == planning_input.target_role.id
    assert payload.context_fingerprint == training_planning_context_fingerprint(
        planning_input
    )
    assert payload.model_dump(mode="json", by_alias=True)["trainingPlanningInput"][
        "targetRole"
    ]["id"] == str(request.target_role_id)

    mismatched = payload.model_dump(mode="json", by_alias=True)
    mismatched["targetRoleId"] = "00000000-0000-0000-0000-000000000299"
    with pytest.raises(ValidationError, match="targetRoleId"):
        TrainingPlanningRunPayload.model_validate(mismatched)

    bad_fingerprint = payload.model_dump(mode="json", by_alias=True)
    bad_fingerprint["contextFingerprint"] = "not-a-sha256"
    with pytest.raises(ValidationError):
        TrainingPlanningRunPayload.model_validate(bad_fingerprint)


def test_status_response_enforces_lifecycle_state_constraints() -> None:
    queued = TrainingPlanningStatusResponse(
        runId="00000000-0000-0000-0000-000000000261",
        status="queued",
        targetRoleId="00000000-0000-0000-0000-000000000201",
        interactionLanguage="en",
        attemptCount=1,
        maxAttempts=3,
        errorCode=None,
        failureReason=None,
        createdAt=datetime(2026, 8, 18, 10, tzinfo=UTC),
        startedAt=datetime(2026, 8, 18, 10, tzinfo=UTC),
        finishedAt=None,
        plan=None,
    )
    assert queued.status == "queued"

    successful_plan = TrainingPlanningTargetedPracticeOutput(
        action="targetedPractice",
        reason="Practice the current gap.",
        focusAreas=["project results"],
        questionType="projectDeepDive",
        difficulty="basic",
        prioritizeWeaknesses=False,
    )
    succeeded = TrainingPlanningStatusResponse(
        runId="00000000-0000-0000-0000-000000000262",
        status="succeeded",
        targetRoleId="00000000-0000-0000-0000-000000000201",
        interactionLanguage="en",
        attemptCount=1,
        maxAttempts=3,
        errorCode=None,
        failureReason=None,
        createdAt=datetime(2026, 8, 18, 10, tzinfo=UTC),
        startedAt=datetime(2026, 8, 18, 10, tzinfo=UTC),
        finishedAt=datetime(2026, 8, 18, 10, 1, tzinfo=UTC),
        plan=successful_plan,
    )
    assert succeeded.plan is successful_plan

    invalid = succeeded.model_dump(mode="json", by_alias=True)
    invalid["plan"] = None
    with pytest.raises(ValidationError):
        TrainingPlanningStatusResponse.model_validate(invalid)
