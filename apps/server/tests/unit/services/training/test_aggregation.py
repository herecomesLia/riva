import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from riva.models import CompetencyEvidence, UserCompetency
from riva.services.training.aggregation import CompetencyAggregationService


class _Rows:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def all(self) -> list[object]:
        return self.rows


class _Session:
    def __init__(
        self,
        competencies: list[UserCompetency],
        evidence: list[list[CompetencyEvidence]],
    ) -> None:
        self.competencies = competencies
        self.evidence = evidence
        self.scalar_calls = 0
        self.scalars_calls = 0

    async def scalar(self, _statement: object) -> UserCompetency | None:
        competency = self.competencies[0] if self.competencies else None
        self.scalar_calls += 1
        return competency

    async def scalars(self, _statement: object) -> _Rows:
        if not self.scalar_calls and self.scalars_calls == 0:
            rows: list[object] = self.competencies
        else:
            evidence_index = self.scalars_calls - (0 if self.scalar_calls else 1)
            rows = self.evidence[evidence_index]
        self.scalars_calls += 1
        return _Rows(rows)


def _competency() -> UserCompetency:
    return UserCompetency(
        id=uuid4(),
        user_id=uuid4(),
        competency_key="answer_quality",
        display_name="Answer Quality",
        confidence=99,
        evidence_count=99,
        trend="declining",
        level=99,
    )


def _evidence(
    competency: UserCompetency,
    *,
    score: int | None,
    source_type: str = "practice",
    source_session_id: UUID | None = None,
    occurred_at: datetime,
    signal_type: str = "score",
    source_entity_id: UUID | None = None,
) -> CompetencyEvidence:
    return CompetencyEvidence(
        id=uuid4(),
        user_id=competency.user_id,
        competency_id=competency.id,
        source_type=source_type,
        source_session_id=source_session_id or uuid4(),
        source_entity_type=(
            "practiceAttempt" if source_type == "practice" else "interviewTurn"
        ),
        source_entity_id=source_entity_id or uuid4(),
        signal_type=signal_type,
        score=score,
        evidence_text=None if signal_type == "score" else "Text evidence",
        details={},
        occurred_at=occurred_at,
    )


def _recompute(
    competency: UserCompetency,
    evidence: list[CompetencyEvidence],
) -> UserCompetency:
    service = CompetencyAggregationService(
        _Session([competency], [evidence])  # type: ignore[arg-type]
    )
    return asyncio.run(
        service.recompute_competency_in_transaction(
            competency.user_id,
            competency.id,
        )
    )


def _session_scores(
    competency: UserCompetency,
    scores: list[int],
    *,
    source_type: str = "practice",
    start: datetime = datetime(2026, 1, 1, tzinfo=UTC),
) -> list[CompetencyEvidence]:
    return [
        _evidence(
            competency,
            score=score,
            source_type=source_type,
            occurred_at=start + timedelta(days=index),
        )
        for index, score in enumerate(scores)
    ]


def test_no_score_keeps_numeric_summary_empty_but_counts_text_evidence() -> None:
    competency = _competency()
    evidence = [
        _evidence(
            competency,
            score=None,
            signal_type="strength",
            occurred_at=datetime(2026, 1, 1, tzinfo=UTC),
        ),
        _evidence(
            competency,
            score=None,
            signal_type="weakness",
            occurred_at=datetime(2026, 1, 2, tzinfo=UTC),
        ),
    ]

    result = _recompute(competency, evidence)

    assert result.evidence_count == 2
    assert result.last_evidence_at == evidence[1].occurred_at
    assert result.level is None
    assert result.confidence == 0
    assert result.trend == "insufficient"


def test_scores_are_averaged_inside_one_source_session_first() -> None:
    competency = _competency()
    session_id = uuid4()
    evidence = [
        _evidence(
            competency,
            score=80,
            source_session_id=session_id,
            occurred_at=datetime(2026, 1, 1, tzinfo=UTC),
        ),
        _evidence(
            competency,
            score=81,
            source_session_id=session_id,
            occurred_at=datetime(2026, 1, 2, tzinfo=UTC),
        ),
    ]

    result = _recompute(competency, evidence)

    assert result.level == 81
    assert result.confidence == 20


def test_level_uses_recent_ten_sessions_with_linear_weights() -> None:
    competency = _competency()
    evidence = _session_scores(competency, list(range(0, 101, 10)))

    result = _recompute(competency, evidence)

    # The oldest session (0) is excluded; 10..100 with weights 1..10 = 70.
    assert result.level == 70
    assert result.confidence == 100


def test_level_rounds_half_up() -> None:
    competency = _competency()
    session_id = uuid4()
    evidence = [
        _evidence(
            competency,
            score=80,
            source_session_id=session_id,
            occurred_at=datetime(2026, 1, 1, tzinfo=UTC),
        ),
        _evidence(
            competency,
            score=81,
            source_session_id=session_id,
            occurred_at=datetime(2026, 1, 1, 0, 1, tzinfo=UTC),
        ),
    ]

    assert _recompute(competency, evidence).level == 81


def test_confidence_uses_all_sessions_and_source_diversity_bonus() -> None:
    competency = _competency()
    practice = _session_scores(competency, [60, 70])
    interview = _session_scores(
        competency,
        [80],
        source_type="interview",
        start=datetime(2026, 2, 1, tzinfo=UTC),
    )

    assert _recompute(competency, practice + interview).confidence == 70


def test_trend_classifies_improving_declining_and_stable() -> None:
    for scores, expected in (
        ([40, 42, 48, 52], "improving"),
        ([60, 58, 52, 48], "declining"),
        ([40, 42, 44, 46], "stable"),
    ):
        competency = _competency()
        result = _recompute(competency, _session_scores(competency, scores))
        assert result.trend == expected


def test_text_evidence_does_not_change_numeric_aggregate() -> None:
    competency = _competency()
    scores = _session_scores(competency, [60, 70, 80, 90])
    baseline = _recompute(competency, scores)
    text_evidence = _evidence(
        competency,
        score=None,
        signal_type="weakness",
        occurred_at=datetime(2026, 3, 1, tzinfo=UTC),
    )

    result = _recompute(competency, scores + [text_evidence])

    assert (result.level, result.confidence, result.trend) == (
        baseline.level,
        baseline.confidence,
        baseline.trend,
    )


def test_equal_timestamps_have_stable_source_tie_breaking() -> None:
    competency_a = _competency()
    competency_b = UserCompetency(
        id=competency_a.id,
        user_id=competency_a.user_id,
        competency_key=competency_a.competency_key,
        display_name=competency_a.display_name,
    )
    timestamp = datetime(2026, 1, 1, tzinfo=UTC)
    session_a = UUID("00000000-0000-0000-0000-000000000001")
    session_b = UUID("00000000-0000-0000-0000-000000000002")
    evidence = [
        _evidence(
            competency_a,
            score=20,
            source_type="interview",
            source_session_id=session_b,
            occurred_at=timestamp,
        ),
        _evidence(
            competency_a,
            score=80,
            source_type="practice",
            source_session_id=session_a,
            occurred_at=timestamp,
        ),
    ]
    reversed_evidence = [
        _evidence(
            competency_b,
            score=item.score,
            source_type=item.source_type,
            source_session_id=item.source_session_id,
            occurred_at=item.occurred_at,
        )
        for item in reversed(evidence)
    ]

    first = _recompute(competency_a, evidence)
    second = _recompute(competency_b, reversed_evidence)

    assert (first.level, first.confidence, first.trend) == (
        second.level,
        second.confidence,
        second.trend,
    )
