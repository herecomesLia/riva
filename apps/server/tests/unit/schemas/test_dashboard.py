from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from riva.schemas.dashboard import DashboardResponse


def valid_dashboard() -> dict[str, object]:
    role_id = str(uuid4())
    source_id = str(uuid4())
    return {
        "currentRole": {
            "id": role_id,
            "title": "Backend Engineer",
            "company": "Riva",
            "recruitmentType": "experienced",
            "location": "Shanghai",
            "experienceYears": {"min": 2, "max": 5},
            "profileCompleted": True,
            "jobDescriptionAdded": True,
        },
        "recommendation": {
            "id": str(uuid4()),
            "sourceRecordId": source_id,
            "targetRoleId": role_id,
            "recommendation": {
                "action": "targetedPractice",
                "reason": "Add measurable outcomes.",
                "questionType": "projectDeepDive",
                "difficulty": "basic",
                "focusAreas": ["Results and Evidence"],
            },
            "estimatedMinutes": 15,
        },
        "metrics": {
            "roleFit": {"currentValue": 80, "previousValue": None},
            "practiceTimeMinutes": {"currentValue": 45, "previousValue": None},
            "targetedPracticeScore": {"currentValue": 70, "previousValue": 60},
            "mockInterviewScore": {"currentValue": None, "previousValue": None},
        },
        "performanceTrend": {
            "targetedPractice": [
                {
                    "id": source_id,
                    "occurredAt": "2026-08-17T10:00:00Z",
                    "score": 70,
                }
            ],
            "mockInterview": [],
        },
        "weaknesses": [
            {
                "id": str(uuid4()),
                "category": "quantifiedResults",
                "description": "Add measurable outcomes.",
                "recommendedPracticeCount": 2,
            }
        ],
    }


def test_dashboard_response_accepts_exact_camel_case_wire_contract() -> None:
    response = DashboardResponse.model_validate(valid_dashboard())
    assert response.metrics.role_fit.current_value == 80
    assert response.performance_trend.targeted_practice[0].occurred_at.tzinfo is not None


@pytest.mark.parametrize(
    "path,value",
    [
        (("metrics", "roleFit", "currentValue"), 101),
        (("metrics", "practiceTimeMinutes", "currentValue"), -1),
        (("weaknesses", 0, "recommendedPracticeCount"), 0),
        (("recommendation", "estimatedMinutes"), -1),
    ],
)
def test_dashboard_response_enforces_ranges(path, value) -> None:
    payload = valid_dashboard()
    target = payload
    for part in path[:-1]:
        target = target[part]  # type: ignore[index]
    target[path[-1]] = value  # type: ignore[index]

    with pytest.raises(ValidationError):
        DashboardResponse.model_validate(payload)


def test_dashboard_response_rejects_extra_fields_and_naive_timestamps() -> None:
    payload = valid_dashboard()
    payload["unexpected"] = True
    with pytest.raises(ValidationError):
        DashboardResponse.model_validate(payload)

    payload = valid_dashboard()
    payload["performanceTrend"]["targetedPractice"][0]["occurredAt"] = datetime(
        2026, 8, 17, 10
    ).isoformat()
    with pytest.raises(ValidationError):
        DashboardResponse.model_validate(payload)


def test_dashboard_response_can_be_empty_without_current_role_or_recommendation() -> None:
    payload = valid_dashboard()
    payload["currentRole"] = None
    payload["recommendation"] = None
    payload["weaknesses"] = []
    response = DashboardResponse.model_validate(payload)
    assert response.current_role is None
    assert response.recommendation is None
    assert response.performance_trend.mock_interview == []
