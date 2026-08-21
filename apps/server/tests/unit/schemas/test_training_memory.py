from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from riva.schemas.training_memory import (
    TrainingMemoryCompetency,
    TrainingMemoryContext,
)


def competency_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "competencyKey": "communication",
        "displayName": "Communication",
        "level": 60,
        "confidence": 70,
        "trend": "stable",
        "evidenceCount": 2,
        "lastEvidenceAt": "2026-08-16T10:00:00Z",
    }
    payload.update(overrides)
    return payload


def test_training_memory_context_is_strict_and_serializable() -> None:
    context = TrainingMemoryContext.model_validate(
        {
            "version": "1",
            "focusCompetencies": [competency_payload()],
            "establishedCompetencies": [],
        }
    )

    assert context.model_dump(mode="json", by_alias=True)["focusCompetencies"]
    with pytest.raises(ValidationError):
        TrainingMemoryContext.model_validate({"unknown": True})
    with pytest.raises(ValidationError):
        TrainingMemoryCompetency.model_validate(
            {**competency_payload(), "unknown": True}
        )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("level", -1),
        ("level", 101),
        ("confidence", -1),
        ("confidence", 101),
        ("evidenceCount", -1),
        ("level", True),
        ("confidence", "70"),
    ],
)
def test_training_memory_ranges_and_strict_numbers(
    field: str,
    value: object,
) -> None:
    with pytest.raises(ValidationError):
        TrainingMemoryCompetency.model_validate({**competency_payload(), field: value})


def test_training_memory_requires_timezone_aware_last_evidence_at() -> None:
    with pytest.raises(ValidationError, match="timezone-aware"):
        TrainingMemoryCompetency.model_validate(
            competency_payload(lastEvidenceAt="2026-08-16T10:00:00")
        )

    competency = TrainingMemoryCompetency.model_validate(
        competency_payload(lastEvidenceAt=datetime(2026, 8, 16, tzinfo=UTC))
    )
    assert competency.last_evidence_at is not None
    assert competency.last_evidence_at.tzinfo is not None


def test_training_memory_context_has_empty_default_and_bounded_lists() -> None:
    assert TrainingMemoryContext() == TrainingMemoryContext(
        version="1",
        focusCompetencies=[],
        establishedCompetencies=[],
    )
    with pytest.raises(ValidationError):
        TrainingMemoryContext(
            focusCompetencies=[competency_payload() for _ in range(6)]
        )
    with pytest.raises(ValidationError):
        TrainingMemoryContext(
            establishedCompetencies=[competency_payload() for _ in range(4)]
        )
