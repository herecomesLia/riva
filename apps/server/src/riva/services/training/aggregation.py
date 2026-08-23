from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime
from fractions import Fraction
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.models import CompetencyEvidence, UserCompetency

_TREND_INSUFFICIENT = "insufficient"
_TREND_IMPROVING = "improving"
_TREND_STABLE = "stable"
_TREND_DECLINING = "declining"


class CompetencyAggregationService:
    """Recompute persisted competency summaries from immutable evidence.

    The service deliberately owns no transaction boundary.  Callers that add
    source artifacts and evidence can therefore make the aggregate part of
    the same transaction.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def recompute_competency_in_transaction(
        self,
        user_id: UUID,
        competency_id: UUID,
    ) -> UserCompetency:
        competency = await self.session.scalar(
            select(UserCompetency)
            .where(
                UserCompetency.user_id == user_id,
                UserCompetency.id == competency_id,
            )
            .with_for_update()
        )
        if competency is None:
            raise ValueError("competency does not belong to user")
        return await self._recompute_locked(competency)

    async def recompute_many_in_transaction(
        self,
        user_id: UUID,
        competency_ids: Iterable[UUID],
    ) -> list[UserCompetency]:
        ids = sorted({competency_id for competency_id in competency_ids}, key=str)
        if not ids:
            return []

        # Acquire every parent lock before reading any evidence.  Every
        # caller uses the same UUID order, so overlapping batches cannot lock
        # competencies in opposite orders.
        result = await self.session.scalars(
            select(UserCompetency)
            .where(
                UserCompetency.user_id == user_id,
                UserCompetency.id.in_(ids),
            )
            .order_by(UserCompetency.id.asc())
            .with_for_update()
        )
        competencies = list(result.all())
        if len(competencies) != len(ids):
            raise ValueError("competency does not belong to user")

        return [await self._recompute_locked(competency) for competency in competencies]

    async def recompute_user_in_transaction(
        self,
        user_id: UUID,
    ) -> list[UserCompetency]:
        result = await self.session.scalars(
            select(UserCompetency)
            .where(UserCompetency.user_id == user_id)
            .order_by(UserCompetency.id.asc())
            .with_for_update()
        )
        competencies = list(result.all())
        return [await self._recompute_locked(competency) for competency in competencies]

    async def _recompute_locked(
        self,
        competency: UserCompetency,
    ) -> UserCompetency:
        result = await self.session.scalars(
            select(CompetencyEvidence)
            .where(
                CompetencyEvidence.user_id == competency.user_id,
                CompetencyEvidence.competency_id == competency.id,
            )
            .order_by(
                CompetencyEvidence.occurred_at.asc(),
                CompetencyEvidence.id.asc(),
            )
            .with_for_update()
        )
        evidence = list(result.all())

        competency.evidence_count = len(evidence)
        competency.last_evidence_at = max(
            (item.occurred_at for item in evidence), default=None
        )

        scored_sessions = self._scored_sessions(evidence)
        competency.level = self._level(scored_sessions)
        competency.confidence = self._confidence(scored_sessions)
        competency.trend = self._trend(scored_sessions)
        return competency

    @staticmethod
    def _scored_sessions(
        evidence: list[CompetencyEvidence],
    ) -> list[tuple[str, UUID, datetime, Fraction]]:
        grouped: dict[tuple[str, UUID], list[CompetencyEvidence]] = defaultdict(list)
        for item in evidence:
            if item.signal_type == "score" and item.score is not None:
                grouped[(item.source_type, item.source_session_id)].append(item)

        sessions: list[tuple[str, UUID, datetime, Fraction]] = []
        for (source_type, source_session_id), items in grouped.items():
            timestamp = max(item.occurred_at for item in items)
            average = Fraction(
                sum(item.score for item in items if item.score is not None),
                len(items),
            )
            sessions.append((source_type, source_session_id, timestamp, average))

        sessions.sort(key=lambda item: (item[2], item[0], str(item[1])))
        return sessions

    @classmethod
    def _level(
        cls,
        scored_sessions: list[tuple[str, UUID, datetime, Fraction]],
    ) -> int | None:
        recent = scored_sessions[-10:]
        if not recent:
            return None

        weighted_total = sum(
            average * weight
            for weight, (_source_type, _session_id, _timestamp, average) in enumerate(
                recent,
                start=1,
            )
        )
        weight_total = sum(range(1, len(recent) + 1))
        return max(0, min(100, cls._round_half_up(weighted_total / weight_total)))

    @staticmethod
    def _confidence(
        scored_sessions: list[tuple[str, UUID, datetime, Fraction]],
    ) -> int:
        if not scored_sessions:
            return 0
        source_types = {source_type for source_type, *_rest in scored_sessions}
        diversity_bonus = 10 if source_types == {"practice", "interview"} else 0
        return min(100, len(scored_sessions) * 20 + diversity_bonus)

    @classmethod
    def _trend(
        cls,
        scored_sessions: list[tuple[str, UUID, datetime, Fraction]],
    ) -> str:
        if len(scored_sessions) < 4:
            return _TREND_INSUFFICIENT

        recent = scored_sessions[-4:]
        previous = sum((item[3] for item in recent[:2]), Fraction(0, 1)) / 2
        current = sum((item[3] for item in recent[2:]), Fraction(0, 1)) / 2
        delta = current - previous
        if delta >= 5:
            return _TREND_IMPROVING
        if delta <= -5:
            return _TREND_DECLINING
        return _TREND_STABLE

    @staticmethod
    def _round_half_up(value: Fraction) -> int:
        # All scores are non-negative.  This is exact integer arithmetic and
        # does not inherit Python's bankers-rounding behavior.
        return (value.numerator * 2 + value.denominator) // (2 * value.denominator)
