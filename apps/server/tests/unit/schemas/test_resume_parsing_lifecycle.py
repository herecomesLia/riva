from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from riva.schemas.resume_parsing_lifecycle import ResumeParsingStatusResponse

NOW = datetime(2026, 8, 6, 12, 0, tzinfo=UTC)


def values(**overrides: object) -> dict[str, object]:
    result: dict[str, object] = {
        "resume_document_id": uuid4(),
        "status": "notStarted",
        "run_id": None,
        "attempt_count": 0,
        "max_attempts": None,
        "error_code": None,
        "failure_reason": None,
        "can_retry": False,
        "created_at": None,
        "started_at": None,
        "finished_at": None,
        "result_version": None,
        "draft_version": None,
        "draft_status": None,
    }
    result.update(overrides)
    return result


def active_values(status: str = "queued") -> dict[str, object]:
    return values(
        status=status,
        run_id=uuid4(),
        attempt_count=0 if status == "queued" else 1,
        max_attempts=3,
        created_at=NOW,
        started_at=None if status == "queued" else NOW,
    )


def terminal_values(status: str = "succeeded") -> dict[str, object]:
    return values(
        status=status,
        run_id=uuid4(),
        attempt_count=1,
        max_attempts=3,
        created_at=NOW,
        started_at=NOW,
        finished_at=NOW,
        error_code=None if status == "succeeded" else "provider_timeout",
        failure_reason=None
        if status == "succeeded"
        else "Resume parsing failed. Your uploaded resume is preserved; please try again.",
        can_retry=status == "failed",
        result_version=1 if status == "succeeded" else None,
        draft_version=1 if status == "succeeded" else None,
        draft_status="ready" if status == "succeeded" else None,
    )


@pytest.mark.parametrize(
    "payload",
    [
        values(),
        active_values("queued"),
        active_values("running"),
        terminal_values("succeeded"),
        terminal_values("failed"),
    ],
)
def test_valid_lifecycle_states(payload: dict[str, object]) -> None:
    response = ResumeParsingStatusResponse(**payload)

    assert response.resume_document_id == payload["resume_document_id"]


def test_response_serializes_camel_case_and_forbids_private_fields() -> None:
    response = ResumeParsingStatusResponse(**active_values())

    serialized = response.model_dump()
    assert "resumeDocumentId" in serialized
    assert "runId" in serialized
    assert "attemptCount" in serialized
    assert "provider" not in serialized
    assert "model" not in serialized
    assert "result" not in serialized
    assert "rawResumeText" not in serialized

    with pytest.raises(ValidationError):
        ResumeParsingStatusResponse(
            **active_values(),
            provider="qwen",
        )


@pytest.mark.parametrize(
    "payload",
    [
        values(run_id=uuid4()),
        active_values("queued") | {"result_version": 1},
        active_values("running") | {"started_at": None},
        terminal_values("succeeded") | {"result_version": None},
        terminal_values("succeeded") | {"failure_reason": "failed"},
        terminal_values("failed") | {"can_retry": False},
        terminal_values("failed") | {"draft_version": 1},
        values(attempt_count=-1),
        active_values() | {"max_attempts": 0},
    ],
)
def test_invalid_state_invariants_are_rejected(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        ResumeParsingStatusResponse(**payload)


@pytest.mark.parametrize("field", ["created_at", "started_at", "finished_at"])
def test_timestamps_must_be_timezone_aware(field: str) -> None:
    payload = active_values("running")
    payload[field] = datetime(2026, 8, 6, 12, 0)

    with pytest.raises(ValidationError):
        ResumeParsingStatusResponse(**payload)
