from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import TypeAdapter, ValidationError

from riva.schemas.interview import (
    InterviewConfiguration,
    InterviewDifficulty,
    InterviewDurationMinutes,
    InterviewOpeningSessionResponse,
    InterviewPageResponse,
    InterviewRound,
    InterviewSetupAvailabilityResponse,
    InterviewSetupResponse,
    StartInterviewRequest,
)

ROLE_ID = uuid4()


def setup_response() -> InterviewSetupResponse:
    return InterviewSetupResponse(
        availability={"status": "available"},
        target_roles=[
            {
                "id": ROLE_ID,
                "title": "Backend Engineer",
                "company": "Riva",
                "supportedRounds": [item.value for item in InterviewRound],
            }
        ],
        available_difficulties=(
            InterviewDifficulty.BASIC,
            InterviewDifficulty.PRESSURE,
        ),
        available_duration_minutes=(
            InterviewDurationMinutes.FIFTEEN,
            InterviewDurationMinutes.THIRTY,
            InterviewDurationMinutes.FORTY_FIVE,
        ),
        default_configuration={
            "targetRoleId": ROLE_ID,
            "round": "technical",
            "difficulty": "pressure",
            "durationMinutes": 30,
        },
    )


def opening_response() -> InterviewOpeningSessionResponse:
    return InterviewOpeningSessionResponse(
        status="opening",
        session_id=uuid4(),
        language="en",
        version=1,
        configuration=InterviewConfiguration(
            target_role_id=ROLE_ID,
            round="technical",
            difficulty="pressure",
            duration_minutes=30,
        ),
        started_at=datetime(2026, 8, 16, 10, 0, tzinfo=UTC),
        progress={
            "completedMainQuestions": 0,
            "totalMainQuestions": None,
            "planRevision": 0,
        },
        opening_message="Welcome to the interview.",
    )


def test_interview_contracts_use_camel_case_and_strict_extras() -> None:
    page = InterviewPageResponse(setup=setup_response(), session=opening_response())
    payload = page.model_dump(mode="json", by_alias=True)
    assert payload["session"]["status"] == "opening"
    assert payload["session"]["configuration"]["durationMinutes"] == 30
    assert payload["session"]["completedQuestions"] == []
    assert payload["setup"]["targetRoles"][0]["supportedRounds"] == [
        item.value for item in InterviewRound
    ]

    with pytest.raises(ValidationError):
        StartInterviewRequest(
            target_role_id=ROLE_ID,
            round="technical",
            difficulty="pressure",
            duration_minutes=30,
            unknown=True,
        )


@pytest.mark.parametrize(
    "field,value",
    [
        ("round", "unknown"),
        ("difficulty", "unknown"),
        ("duration_minutes", 20),
        ("target_role_id", "not-a-uuid"),
    ],
)
def test_start_interview_request_rejects_invalid_configuration(
    field: str,
    value: object,
) -> None:
    payload = {
        "target_role_id": ROLE_ID,
        "round": "technical",
        "difficulty": "pressure",
        "duration_minutes": 30,
    }
    payload[field] = value
    with pytest.raises(ValidationError):
        StartInterviewRequest(**payload)


def test_version_progress_and_timestamp_are_validated() -> None:
    payload = opening_response().model_dump(mode="python")
    payload["version"] = 0
    with pytest.raises(ValidationError):
        InterviewOpeningSessionResponse(**payload)

    payload = opening_response().model_dump(mode="python")
    payload["started_at"] = datetime(2026, 8, 16, 10, 0)
    with pytest.raises(ValidationError):
        InterviewOpeningSessionResponse(**payload)


def test_availability_is_a_discriminated_union() -> None:
    available = TypeAdapter(InterviewSetupAvailabilityResponse).validate_python(
        {"status": "available"}
    )
    blocked = TypeAdapter(InterviewSetupAvailabilityResponse).validate_python(
        {"status": "blocked", "reason": "profileIncomplete"}
    )
    assert available.status == "available"
    assert blocked.reason == "profileIncomplete"


def test_invalid_uuid_and_extra_fields_are_rejected() -> None:
    with pytest.raises(ValidationError):
        InterviewConfiguration(
            target_role_id="invalid",
            round="technical",
            difficulty="basic",
            duration_minutes=15,
        )

    with pytest.raises(ValidationError):
        InterviewSetupResponse(
            **setup_response().model_dump(mode="python"),
            extra=True,
        )
