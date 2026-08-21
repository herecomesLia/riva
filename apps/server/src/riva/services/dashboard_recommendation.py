from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from math import ceil
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import CompetencyEvidence, UserCompetency
from riva.schemas.dashboard import (
    DashboardMockInterviewRecommendationResponse,
    DashboardRecommendationResponse,
    DashboardTargetedPracticeRecommendationResponse,
    DashboardWeaknessResponse,
)
from riva.schemas.roles import TargetRoleResponse
from riva.services.competency_catalog import (
    COMPETENCY_DISPLAY_NAMES,
    canonical_competency_sort_key,
)

_WEAKNESS_CATEGORIES = {
    "results_and_evidence": "quantifiedResults",
    "risk_control": "pressureResponse",
}
_QUESTION_TYPES = {
    "answer_quality": "behavioral",
    "relevance": "behavioral",
    "structure": "behavioral",
    "communication": "behavioral",
    "specificity": "projectDeepDive",
    "personal_contribution": "projectDeepDive",
    "results_and_evidence": "projectDeepDive",
    "role_alignment": "businessUnderstanding",
}


@dataclass(frozen=True)
class DashboardRecommendationResult:
    weaknesses: list[DashboardWeaknessResponse]
    recommendation: DashboardRecommendationResponse | None


class DashboardRecommendationService:
    """Build deterministic dashboard weaknesses and the primary next action."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_for_dashboard(
        self,
        *,
        user_id: UUID,
        competencies: Sequence[UserCompetency],
        current_role: TargetRoleResponse | None,
        profile_completed: bool,
    ) -> DashboardRecommendationResult:
        evidence_by_competency = await self._load_evidence(
            user_id=user_id,
            competencies=competencies,
        )
        return self.build(
            user_id=user_id,
            competencies=competencies,
            evidence_by_competency=evidence_by_competency,
            current_role=current_role,
            profile_completed=profile_completed,
        )

    def build(
        self,
        *,
        user_id: UUID,
        competencies: Sequence[UserCompetency],
        current_role: TargetRoleResponse | None,
        profile_completed: bool,
        evidence_by_competency: Mapping[UUID, Sequence[CompetencyEvidence]]
        | None = None,
    ) -> DashboardRecommendationResult:
        eligible = [
            competency
            for competency in competencies
            if competency.level is not None
            and competency.confidence >= 40
            and competency.level < 70
        ]
        eligible.sort(
            key=lambda competency: (
                competency.level,
                -competency.confidence,
                *canonical_competency_sort_key(competency.competency_key),
                str(competency.id),
            )
        )
        selected = eligible[:3]

        evidence_map = evidence_by_competency or {}
        weaknesses = [
            self._weakness_response(
                competency,
                evidence_map.get(
                    competency.id,
                    (),
                ),
            )
            for competency in selected
        ]

        recommendation = self._recommendation(
            user_id=user_id,
            selected=selected,
            evidence_by_competency=evidence_map,
            current_role=current_role,
            profile_completed=profile_completed,
        )
        return DashboardRecommendationResult(
            weaknesses=weaknesses,
            recommendation=recommendation,
        )

    async def _load_evidence(
        self,
        *,
        user_id: UUID,
        competencies: Sequence[UserCompetency],
    ) -> dict[UUID, list[CompetencyEvidence]]:
        competency_ids = sorted(
            {competency.id for competency in competencies},
            key=str,
        )
        if not competency_ids:
            return {}

        result = await self.session.scalars(
            select(CompetencyEvidence)
            .where(
                CompetencyEvidence.user_id == user_id,
                CompetencyEvidence.competency_id.in_(competency_ids),
            )
            .order_by(
                CompetencyEvidence.occurred_at.asc(),
                CompetencyEvidence.created_at.asc(),
                CompetencyEvidence.id.asc(),
            )
        )
        evidence_by_competency: dict[UUID, list[CompetencyEvidence]] = {}
        for evidence in result.all():
            evidence_by_competency.setdefault(evidence.competency_id, []).append(
                evidence
            )
        return evidence_by_competency

    @classmethod
    def _weakness_response(
        cls,
        competency: UserCompetency,
        evidence: Sequence[CompetencyEvidence],
    ) -> DashboardWeaknessResponse:
        assert competency.level is not None
        return DashboardWeaknessResponse(
            id=competency.id,
            category=_WEAKNESS_CATEGORIES.get(
                competency.competency_key,
                "projectExpression",
            ),
            description=cls._evidence_description(evidence) or competency.display_name,
            recommended_practice_count=min(
                3,
                max(1, ceil((70 - competency.level) / 10)),
            ),
        )

    @classmethod
    def _recommendation(
        cls,
        *,
        user_id: UUID,
        selected: Sequence[UserCompetency],
        evidence_by_competency: Mapping[UUID, Sequence[CompetencyEvidence]],
        current_role: TargetRoleResponse | None,
        profile_completed: bool,
    ) -> DashboardRecommendationResponse | None:
        if not selected or not cls._recommendation_prerequisites(
            current_role=current_role,
            profile_completed=profile_completed,
        ):
            return None

        primary = selected[0]
        evidence = evidence_by_competency.get(
            primary.id,
            (),
        )
        latest_score = cls._latest_score(evidence)
        if latest_score is None:
            return None
        assert primary.level is not None
        assert current_role is not None

        reason = cls._evidence_description(evidence) or (
            f"Focus on {primary.display_name} based on your recent "
            "training performance."
        )
        focus_areas = [
            COMPETENCY_DISPLAY_NAMES.get(
                competency.competency_key,
                competency.display_name,
            )
            for competency in selected
        ]
        recommendation_id = uuid5(
            NAMESPACE_URL,
            ":".join(
                (
                    "riva",
                    "dashboard-recommendation",
                    "v2",
                    str(user_id),
                    str(current_role.id),
                    primary.competency_key,
                    str(latest_score.source_session_id),
                )
            ),
        )

        if primary.competency_key == "risk_control":
            recommendation = DashboardMockInterviewRecommendationResponse(
                action="mockInterview",
                reason=reason,
                round="comprehensive",
                difficulty="pressure",
                focus_areas=focus_areas,
            )
            estimated_minutes = 30
        else:
            recommendation = DashboardTargetedPracticeRecommendationResponse(
                action="targetedPractice",
                reason=reason,
                question_type=_QUESTION_TYPES.get(
                    primary.competency_key,
                    "projectDeepDive",
                ),
                difficulty=("basic" if primary.level < 60 else "pressure"),
                focus_areas=focus_areas,
            )
            estimated_minutes = 15

        return DashboardRecommendationResponse(
            id=recommendation_id,
            source_record_id=latest_score.source_session_id,
            target_role_id=current_role.id,
            recommendation=recommendation,
            estimated_minutes=estimated_minutes,
        )

    @staticmethod
    def _recommendation_prerequisites(
        *,
        current_role: TargetRoleResponse | None,
        profile_completed: bool,
    ) -> bool:
        return bool(
            current_role is not None
            and profile_completed
            and current_role.job_description.status == "ready"
            and current_role.job_description_analysis is not None
        )

    @classmethod
    def _evidence_description(
        cls,
        evidence: Sequence[CompetencyEvidence],
    ) -> str | None:
        latest_weakness = cls._latest(
            (
                item
                for item in evidence
                if item.signal_type == "weakness"
                and isinstance(item.evidence_text, str)
                and item.evidence_text.strip()
            ),
        )
        if latest_weakness is not None:
            return latest_weakness.evidence_text.strip()

        latest_score = cls._latest_score(evidence)
        if latest_score is not None and isinstance(latest_score.details, Mapping):
            explanation = latest_score.details.get("explanation")
            if isinstance(explanation, str) and explanation.strip():
                return explanation.strip()
        return None

    @staticmethod
    def _latest_score(
        evidence: Sequence[CompetencyEvidence],
    ) -> CompetencyEvidence | None:
        return DashboardRecommendationService._latest(
            (
                item
                for item in evidence
                if item.signal_type == "score" and item.score is not None
            ),
        )

    @staticmethod
    def _latest(
        evidence: Iterable[CompetencyEvidence],
    ) -> CompetencyEvidence | None:
        items = list(evidence)
        if not items:
            return None
        return max(
            items,
            key=lambda item: (
                item.occurred_at,
                item.created_at or datetime.min.replace(tzinfo=UTC),
                str(item.id),
            ),
        )


__all__ = [
    "DashboardRecommendationResult",
    "DashboardRecommendationService",
]
