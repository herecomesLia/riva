import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from riva.agents.training.memory_types import TrainingMemoryContext
from riva.models import UserCompetency
from riva.services.training.memory import TrainingMemoryService


class ScalarResult:
    def __init__(self, values: list[UserCompetency]) -> None:
        self.values = values

    def all(self) -> list[UserCompetency]:
        return self.values


class FakeSession:
    def __init__(self, values: list[UserCompetency]) -> None:
        self.values = values
        self.statement = None
        self.commit_count = 0

    async def scalars(self, statement: object) -> ScalarResult:
        self.statement = statement
        return ScalarResult(self.values)

    async def commit(self) -> None:
        self.commit_count += 1


def competency(
    key: str,
    *,
    level: int | None,
    confidence: int,
    trend: str = "stable",
    display_name: str = "Database Display Name",
) -> UserCompetency:
    return UserCompetency(
        id=uuid4(),
        user_id=uuid4(),
        competency_key=key,
        display_name=display_name,
        level=level,
        confidence=confidence,
        trend=trend,
        evidence_count=2,
        last_evidence_at=datetime(2026, 8, 16, 10, tzinfo=UTC),
    )


def test_memory_excludes_low_confidence_null_level_and_unknown_keys() -> None:
    session = FakeSession(
        [
            competency("communication", level=80, confidence=39),
            competency("relevance", level=None, confidence=90),
            competency("not_in_catalog", level=80, confidence=90),
        ]
    )

    context = asyncio.run(TrainingMemoryService(session).get_context(uuid4()))

    assert context == TrainingMemoryContext()
    assert session.commit_count == 0


def test_focus_sorting_uses_level_confidence_then_canonical_order() -> None:
    session = FakeSession(
        [
            competency("relevance", level=55, confidence=60),
            competency("answer_quality", level=55, confidence=60),
            competency("structure", level=40, confidence=90),
            competency("specificity", level=40, confidence=80),
        ]
    )

    context = asyncio.run(TrainingMemoryService(session).get_context(uuid4()))

    assert [item.competency_key for item in context.focus_competencies] == [
        "structure",
        "specificity",
        "answer_quality",
        "relevance",
    ]


def test_declining_high_level_is_focus_and_established_is_not_declining() -> None:
    session = FakeSession(
        [
            competency("communication", level=90, confidence=90, trend="declining"),
            competency("relevance", level=95, confidence=70, trend="stable"),
            competency("structure", level=80, confidence=80, trend="improving"),
            competency("specificity", level=70, confidence=95, trend="stable"),
            competency("role_alignment", level=70, confidence=90, trend="declining"),
        ]
    )

    context = asyncio.run(TrainingMemoryService(session).get_context(uuid4()))

    assert [item.competency_key for item in context.focus_competencies] == [
        "role_alignment",
        "communication",
    ]
    assert [item.competency_key for item in context.established_competencies] == [
        "relevance",
        "structure",
        "specificity",
    ]


def test_focus_and_established_have_separate_limits_and_canonical_names() -> None:
    focus = [
        competency(key, level=50, confidence=60)
        for key in (
            "answer_quality",
            "relevance",
            "structure",
            "specificity",
            "personal_contribution",
            "results_and_evidence",
        )
    ]
    established = [
        competency(key, level=90 - index, confidence=80)
        for index, key in enumerate(
            ("role_alignment", "communication", "risk_control", "answer_quality")
        )
    ]
    session = FakeSession(focus + established)

    context = asyncio.run(TrainingMemoryService(session).get_context(uuid4()))

    assert len(context.focus_competencies) == 5
    assert len(context.established_competencies) == 3
    assert all(
        item.display_name != "Database Display Name"
        for item in [
            *context.focus_competencies,
            *context.established_competencies,
        ]
    )
