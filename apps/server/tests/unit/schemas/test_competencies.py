from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from riva.schemas.competencies import (
    CompetencyListResponse,
    CompetencySummaryResponse,
)


def _summary(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "competencyKey": "answer_quality",
        "displayName": "Answer Quality",
        "level": 82,
        "confidence": 70,
        "trend": "improving",
        "evidenceCount": 4,
        "lastEvidenceAt": datetime(2026, 8, 17, tzinfo=UTC),
    }
    value.update(overrides)
    return value


def test_competency_response_serializes_wire_contract() -> None:
    response = CompetencyListResponse.model_validate(
        {"items": [_summary()]}
    )

    assert response.model_dump(mode="json", by_alias=True) == {
        "items": [
            {
                "competencyKey": "answer_quality",
                "displayName": "Answer Quality",
                "level": 82,
                "confidence": 70,
                "trend": "improving",
                "evidenceCount": 4,
                "lastEvidenceAt": "2026-08-17T00:00:00Z",
            }
        ]
    }


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("level", -1),
        ("level", 101),
        ("confidence", -1),
        ("confidence", 101),
        ("evidenceCount", -1),
    ],
)
def test_competency_response_rejects_out_of_range_values(
    field: str,
    value: int,
) -> None:
    with pytest.raises(ValidationError):
        CompetencySummaryResponse.model_validate(_summary(**{field: value}))


def test_competency_response_allows_null_level_and_timestamp() -> None:
    response = CompetencySummaryResponse.model_validate(
        _summary(level=None, lastEvidenceAt=None)
    )

    assert response.level is None
    assert response.last_evidence_at is None


def test_competency_response_requires_timezone_aware_last_evidence_at() -> None:
    with pytest.raises(ValidationError, match="timezone-aware"):
        CompetencySummaryResponse.model_validate(
            _summary(lastEvidenceAt=datetime(2026, 8, 17))
        )


def test_competency_response_forbids_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        CompetencySummaryResponse.model_validate(_summary(extraField="nope"))


def test_competency_response_keeps_numeric_fields_strict() -> None:
    with pytest.raises(ValidationError):
        CompetencySummaryResponse.model_validate(_summary(level="82"))


def test_competency_response_rejects_unknown_trend() -> None:
    with pytest.raises(ValidationError):
        CompetencySummaryResponse.model_validate(_summary(trend="rising"))
