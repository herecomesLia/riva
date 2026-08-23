from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import User
from riva.services.dashboard.recommendation import (
    DashboardRecommendationService,
)
from riva.services.dashboard.types import (
    DashboardCurrentRoleResponse,
    DashboardDurationMetricSnapshotResponse,
    DashboardExperienceYearsResponse,
    DashboardMetricsResponse,
    DashboardPerformanceRecordResponse,
    DashboardPerformanceTrendResponse,
    DashboardResponse,
    DashboardScoreMetricSnapshotResponse,
)
from riva.services.jobs.role_types import TargetRoleResponse
from riva.services.jobs.roles import TargetRoleService
from riva.services.training.competencies import CompetencyService
from riva.services.training.records import TrainingRecordService
from riva.services.training.types import (
    TrainingRecordKind,
    TrainingRecordSummaryResponse,
)
from riva.utils import utc_now

Clock = Callable[[], datetime]
TargetRoleServiceFactory = Callable[[AsyncSession], TargetRoleService]
TrainingRecordServiceFactory = Callable[[AsyncSession], TrainingRecordService]
CompetencyServiceFactory = Callable[[AsyncSession], CompetencyService]
DashboardRecommendationServiceFactory = Callable[
    [AsyncSession], DashboardRecommendationService
]


class DashboardService:
    """Assemble the dashboard read model without owning a write transaction."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        clock: Clock = utc_now,
        target_role_service_factory: TargetRoleServiceFactory = TargetRoleService,
        training_record_service_factory: TrainingRecordServiceFactory = (
            TrainingRecordService
        ),
        competency_service_factory: CompetencyServiceFactory = CompetencyService,
        recommendation_service_factory: DashboardRecommendationServiceFactory = (
            DashboardRecommendationService
        ),
    ) -> None:
        self.session = session
        self.clock = clock
        self.target_role_service_factory = target_role_service_factory
        self.training_record_service_factory = training_record_service_factory
        self.competency_service_factory = competency_service_factory
        self.recommendation_service_factory = recommendation_service_factory

    async def get_dashboard(self, user: User) -> DashboardResponse:
        roles_page = await self.target_role_service_factory(
            self.session
        ).get_roles_page(user)
        records = await self.training_record_service_factory(
            self.session
        ).list_all_summaries(user.id)
        competencies = await self.competency_service_factory(
            self.session
        ).list_competencies(user.id)

        current_role_source = self._current_role_source(roles_page)
        current_role = self._current_role(
            roles_page,
            current_role_source,
        )
        recommendation_result = await self.recommendation_service_factory(
            self.session
        ).get_for_dashboard(
            user_id=user.id,
            competencies=competencies,
            current_role=current_role_source,
            profile_completed=roles_page.profile_context.completed,
        )

        now = self.clock()
        self._require_aware_timestamp(now, "clock")
        metrics = self._metrics(
            records=records,
            current_role=current_role_source,
            now=now,
        )
        return DashboardResponse(
            current_role=current_role,
            recommendation=recommendation_result.recommendation,
            metrics=metrics,
            performance_trend=self._performance_trend(records),
            weaknesses=recommendation_result.weaknesses,
        )

    @staticmethod
    def _current_role_source(roles_page) -> TargetRoleResponse | None:
        if roles_page.current_role_id is None:
            return None
        role = next(
            (
                candidate
                for candidate in roles_page.roles
                if candidate.id == roles_page.current_role_id
            ),
            None,
        )
        if role is None:
            raise ValueError("current_role_id must reference a role in roles")
        return role

    @staticmethod
    def _current_role(
        roles_page,
        role: TargetRoleResponse | None,
    ) -> DashboardCurrentRoleResponse | None:
        if role is None:
            return None

        experience_range = role.experience_range
        experience_years = None
        if experience_range is not None and (
            experience_range.min_years is not None
            or experience_range.max_years is not None
        ):
            experience_years = DashboardExperienceYearsResponse(
                min_years=experience_range.min_years,
                max_years=experience_range.max_years,
            )
        return DashboardCurrentRoleResponse(
            id=role.id,
            title=role.title,
            company=role.company,
            recruitment_type=role.recruitment_type,
            location=role.location,
            experience_years=experience_years,
            profile_completed=roles_page.profile_context.completed,
            job_description_added=role.job_description.status != "missing",
        )

    @classmethod
    def _metrics(
        cls,
        *,
        records: Sequence[TrainingRecordSummaryResponse],
        current_role: TargetRoleResponse | None,
        now: datetime,
    ) -> DashboardMetricsResponse:
        current_start = now - timedelta(days=7)
        previous_start = now - timedelta(days=14)
        current_records = [
            record for record in records if current_start <= record.ended_at <= now
        ]
        previous_records = [
            record
            for record in records
            if previous_start <= record.ended_at < current_start
        ]

        return DashboardMetricsResponse(
            role_fit=cls._role_fit(current_role),
            practice_time_minutes=DashboardDurationMetricSnapshotResponse(
                current_value=cls._duration_minutes(current_records),
                previous_value=cls._duration_minutes(previous_records),
            ),
            targeted_practice_score=cls._score_snapshot(
                records,
                TrainingRecordKind.TARGETED_PRACTICE,
            ),
            mock_interview_score=cls._score_snapshot(
                records,
                TrainingRecordKind.MOCK_INTERVIEW,
            ),
        )

    @staticmethod
    def _role_fit(
        current_role: TargetRoleResponse | None,
    ) -> DashboardScoreMetricSnapshotResponse:
        matching = current_role.matching_analysis if current_role is not None else None
        value = (
            matching.result.overall_match_score
            if matching is not None
            and matching.status == "current"
            and matching.result is not None
            else None
        )
        return DashboardScoreMetricSnapshotResponse(
            current_value=value,
            previous_value=None,
        )

    @staticmethod
    def _duration_minutes(
        records: Sequence[TrainingRecordSummaryResponse],
    ) -> int | None:
        if not records:
            return None
        total_seconds = sum(record.duration_seconds for record in records)
        return (total_seconds + 30) // 60

    @staticmethod
    def _score_snapshot(
        records: Sequence[TrainingRecordSummaryResponse],
        kind: TrainingRecordKind,
    ) -> DashboardScoreMetricSnapshotResponse:
        scored = [
            record
            for record in records
            if record.kind == kind and record.overall_score is not None
        ]
        scored.sort(
            key=lambda record: (record.ended_at, str(record.record_id)),
            reverse=True,
        )
        return DashboardScoreMetricSnapshotResponse(
            current_value=scored[0].overall_score if scored else None,
            previous_value=scored[1].overall_score if len(scored) > 1 else None,
        )

    @staticmethod
    def _performance_trend(
        records: Sequence[TrainingRecordSummaryResponse],
    ) -> DashboardPerformanceTrendResponse:
        def build(kind: TrainingRecordKind) -> list[DashboardPerformanceRecordResponse]:
            scored = [
                record
                for record in records
                if record.kind == kind and record.overall_score is not None
            ]
            scored.sort(
                key=lambda record: (record.ended_at, str(record.record_id)),
            )
            return [
                DashboardPerformanceRecordResponse(
                    id=record.record_id,
                    occurred_at=record.ended_at,
                    score=record.overall_score,
                )
                for record in scored[-10:]
            ]

        return DashboardPerformanceTrendResponse(
            targeted_practice=build(TrainingRecordKind.TARGETED_PRACTICE),
            mock_interview=build(TrainingRecordKind.MOCK_INTERVIEW),
        )

    @staticmethod
    def _require_aware_timestamp(value: datetime, name: str) -> None:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError(f"{name} must be timezone-aware")
