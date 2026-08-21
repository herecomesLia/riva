import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

from riva.schemas.training_records import (
    MockInterviewTrainingRecordSummaryResponse,
    TargetedPracticeTrainingRecordSummaryResponse,
    TrainingRecordKind,
    TrainingRecordStatus,
)
from riva.services.dashboard import DashboardService
from riva.services.dashboard_recommendation import DashboardRecommendationResult

NOW = datetime(2026, 8, 17, 12, tzinfo=UTC)


def record(
    kind: TrainingRecordKind,
    ended_at: datetime,
    *,
    score: float | None,
    duration_seconds: int,
):
    common = {
        "record_id": uuid4(),
        "kind": kind,
        "language": "en",
        "status": TrainingRecordStatus.COMPLETED,
        "started_at": ended_at - timedelta(seconds=duration_seconds),
        "ended_at": ended_at,
        "duration_seconds": duration_seconds,
        "target_role": {"id": uuid4(), "title": "Backend", "company": "Riva"},
        "answered_question_count": 1,
        "total_question_count": 1,
        "overall_score": score,
        "review_summary": None,
        "difficulty": "basic",
    }
    if kind is TrainingRecordKind.TARGETED_PRACTICE:
        return TargetedPracticeTrainingRecordSummaryResponse(
            **common,
            question_type="behavioral",
        )
    return MockInterviewTrainingRecordSummaryResponse(
        **common,
        round="comprehensive",
    )


def role_source(*, matching_status: str = "current"):
    matching = None
    if matching_status:
        matching = SimpleNamespace(
            status=matching_status,
            result=SimpleNamespace(overall_match_score=87),
        )
    return SimpleNamespace(
        id=uuid4(),
        title="Backend Engineer",
        company="Riva",
        recruitment_type="experienced",
        location="Shanghai",
        experience_range=SimpleNamespace(min_years=None, max_years=None),
        job_description=SimpleNamespace(status="saved"),
        job_description_analysis=None,
        matching_analysis=matching,
    )


def test_metrics_use_ended_at_windows_and_round_total_seconds() -> None:
    current_boundary = NOW - timedelta(days=7)
    previous_boundary = NOW - timedelta(days=14)
    records = [
        record(
            TrainingRecordKind.TARGETED_PRACTICE, NOW, score=70, duration_seconds=61
        ),
        record(
            TrainingRecordKind.MOCK_INTERVIEW,
            current_boundary,
            score=80,
            duration_seconds=29,
        ),
        record(
            TrainingRecordKind.TARGETED_PRACTICE,
            previous_boundary,
            score=60,
            duration_seconds=30,
        ),
        record(
            TrainingRecordKind.MOCK_INTERVIEW,
            current_boundary - timedelta(microseconds=1),
            score=50,
            duration_seconds=600,
        ),
        record(
            TrainingRecordKind.MOCK_INTERVIEW,
            NOW + timedelta(seconds=1),
            score=99,
            duration_seconds=900,
        ),
    ]

    metrics = DashboardService._metrics(
        records=records,
        current_role=role_source(),
        now=NOW,
    )

    assert metrics.practice_time_minutes.model_dump() == {
        "currentValue": 2,
        "previousValue": 11,
    }
    assert metrics.role_fit.model_dump() == {"currentValue": 87, "previousValue": None}


def test_score_snapshots_and_trends_are_latest_first_for_snapshots_and_old_to_new_for_trends() -> (
    None
):
    records = [
        record(
            TrainingRecordKind.TARGETED_PRACTICE,
            NOW - timedelta(days=day),
            score=50 + day,
            duration_seconds=60,
        )
        for day in range(12)
    ]
    records.extend(
        [
            record(
                TrainingRecordKind.MOCK_INTERVIEW,
                NOW - timedelta(days=2),
                score=72,
                duration_seconds=60,
            ),
            record(
                TrainingRecordKind.MOCK_INTERVIEW,
                NOW - timedelta(days=1),
                score=82,
                duration_seconds=60,
            ),
        ]
    )

    service = DashboardService(object())
    snapshot = service._score_snapshot(
        records,
        TrainingRecordKind.MOCK_INTERVIEW,
    )
    trend = service._performance_trend(records)

    assert snapshot.current_value == 82
    assert snapshot.previous_value == 72
    assert len(trend.targeted_practice) == 10
    assert [item.score for item in trend.targeted_practice] == list(range(59, 49, -1))
    assert (
        trend.targeted_practice[0].occurred_at < trend.targeted_practice[-1].occurred_at
    )


def test_empty_records_produce_null_metric_values_and_empty_trends() -> None:
    metrics = DashboardService._metrics(
        records=[],
        current_role=None,
        now=NOW,
    )
    trend = DashboardService._performance_trend([])

    assert metrics.practice_time_minutes.model_dump() == {
        "currentValue": None,
        "previousValue": None,
    }
    assert metrics.targeted_practice_score.current_value is None
    assert metrics.mock_interview_score.previous_value is None
    assert trend.model_dump() == {"targetedPractice": [], "mockInterview": []}


class _Roles:
    async def get_roles_page(self, _user):
        return SimpleNamespace(
            roles=[],
            current_role_id=None,
            profile_context=SimpleNamespace(completed=False),
        )


class _Records:
    async def list_all_summaries(self, _user_id):
        return []


class _Competencies:
    async def list_competencies(self, _user_id):
        return []


class _Recommendations:
    async def get_for_dashboard(self, **_kwargs):
        return DashboardRecommendationResult(weaknesses=[], recommendation=None)


def test_get_dashboard_rejects_a_naive_injected_clock() -> None:
    service = DashboardService(
        object(),
        clock=lambda: datetime(2026, 8, 17, 12),
        target_role_service_factory=lambda _session: _Roles(),
        training_record_service_factory=lambda _session: _Records(),
        competency_service_factory=lambda _session: _Competencies(),
        recommendation_service_factory=lambda _session: _Recommendations(),
    )

    with pytest.raises(ValueError, match="clock must be timezone-aware"):
        asyncio.run(service.get_dashboard(SimpleNamespace(id=uuid4())))


class _CurrentRoles:
    def __init__(self) -> None:
        self.role = role_source()

    async def get_roles_page(self, _user):
        return SimpleNamespace(
            roles=[self.role],
            current_role_id=self.role.id,
            profile_context=SimpleNamespace(completed=True),
        )


def test_get_dashboard_projects_current_role_and_current_matching_score() -> None:
    roles = _CurrentRoles()
    records = _Records()
    service = DashboardService(
        object(),
        clock=lambda: NOW,
        target_role_service_factory=lambda _session: roles,
        training_record_service_factory=lambda _session: records,
        competency_service_factory=lambda _session: _Competencies(),
        recommendation_service_factory=lambda _session: _Recommendations(),
    )

    response = asyncio.run(service.get_dashboard(SimpleNamespace(id=uuid4())))

    assert response.current_role is not None
    assert response.current_role.job_description_added is True
    assert response.current_role.experience_years is None
    assert response.metrics.role_fit.current_value == 87
