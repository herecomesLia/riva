from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import UserCompetency
from riva.schemas.training_memory import (
    TrainingMemoryCompetency,
    TrainingMemoryContext,
)
from riva.services.competency_catalog import (
    CANONICAL_COMPETENCY_KEYS,
    canonical_competency_sort_key,
    display_name_for_competency_key,
)


class TrainingMemoryService:
    """Build a small, deterministic snapshot of long-term competency memory."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_context(self, user_id: UUID) -> TrainingMemoryContext:
        result = await self.session.scalars(
            select(UserCompetency).where(
                UserCompetency.user_id == user_id,
                UserCompetency.competency_key.in_(CANONICAL_COMPETENCY_KEYS),
            )
        )
        competencies = [
            competency
            for competency in result.all()
            if competency.competency_key in CANONICAL_COMPETENCY_KEYS
            and competency.level is not None
            and competency.confidence >= 40
        ]

        focus = sorted(
            (
                competency
                for competency in competencies
                if competency.level < 70 or competency.trend == "declining"
            ),
            key=lambda competency: (
                competency.level,
                -competency.confidence,
                canonical_competency_sort_key(competency.competency_key),
            ),
        )[:5]
        focus_keys = {competency.competency_key for competency in focus}
        established = sorted(
            (
                competency
                for competency in competencies
                if competency.level >= 70
                and competency.trend != "declining"
                and competency.competency_key not in focus_keys
            ),
            key=lambda competency: (
                -competency.level,
                -competency.confidence,
                canonical_competency_sort_key(competency.competency_key),
            ),
        )[:3]

        return TrainingMemoryContext(
            focus_competencies=[self._snapshot(item) for item in focus],
            established_competencies=[self._snapshot(item) for item in established],
        )

    @staticmethod
    def _snapshot(competency: UserCompetency) -> TrainingMemoryCompetency:
        return TrainingMemoryCompetency(
            competency_key=competency.competency_key,
            display_name=display_name_for_competency_key(competency.competency_key),
            level=competency.level,
            confidence=competency.confidence,
            trend=competency.trend,
            evidence_count=competency.evidence_count,
            last_evidence_at=competency.last_evidence_at,
        )


__all__ = ["TrainingMemoryService"]
