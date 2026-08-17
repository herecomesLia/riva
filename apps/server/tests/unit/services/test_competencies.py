import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from riva.models import CompetencyEvidence, UserCompetency
from riva.services.competencies import (
    CompetencyService,
    normalize_competency_key,
)


class _NestedTransaction:
    async def __aenter__(self) -> "_NestedTransaction":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None


def _session(*scalar_values: object) -> MagicMock:
    session = MagicMock()
    session.scalar = AsyncMock(side_effect=list(scalar_values))
    session.scalars = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.begin_nested = MagicMock(return_value=_NestedTransaction())
    return session


def _evidence(
    *,
    user_id,
    competency_id,
    source_entity_id=None,
    signal_type="score",
) -> CompetencyEvidence:
    return CompetencyEvidence(
        user_id=user_id,
        competency_id=competency_id,
        source_type="practice",
        source_session_id=uuid4(),
        source_entity_type="practiceAttempt",
        source_entity_id=source_entity_id or uuid4(),
        signal_type=signal_type,
        score=88 if signal_type == "score" else None,
        evidence_text=None if signal_type == "score" else "Needs clearer ownership.",
        details={"source": "test"},
        occurred_at=datetime(2026, 8, 17, 9, tzinfo=UTC),
    )


def test_competency_key_is_trimmed_lowercased_and_validated() -> None:
    assert normalize_competency_key("  System_Design ") == "system_design"
    assert normalize_competency_key("Backend-API2") == "backend-api2"

    for value in ("", "has spaces", "_leading", "trailing_", "a__b", "a." ):
        with pytest.raises(ValueError):
            normalize_competency_key(value)


def test_get_or_create_creates_normalized_competency() -> None:
    user_id = uuid4()
    session = _session(None)

    competency = asyncio.run(
        CompetencyService(session).get_or_create_competency(
            user_id,
            "  System_Design ",
            " System Design ",
        )
    )

    assert competency.user_id == user_id
    assert competency.competency_key == "system_design"
    assert competency.display_name == "System Design"
    session.add.assert_called_once_with(competency)
    session.commit.assert_awaited_once()
    session.rollback.assert_not_awaited()


def test_get_or_create_updates_display_name_without_creating_duplicate() -> None:
    user_id = uuid4()
    existing = UserCompetency(
        user_id=user_id,
        competency_key="system_design",
        display_name="Old name",
    )
    session = _session(existing)

    result = asyncio.run(
        CompetencyService(session).get_or_create_competency(
            user_id,
            " SYSTEM_DESIGN ",
            " New name ",
        )
    )

    assert result is existing
    assert result.display_name == "New name"
    session.add.assert_not_called()
    session.commit.assert_awaited_once()


def test_get_or_create_rejects_empty_display_name_when_creating() -> None:
    session = _session(None)

    with pytest.raises(ValueError, match="non-empty"):
        asyncio.run(
            CompetencyService(session).get_or_create_competency(
                uuid4(),
                "communication",
                "  ",
            )
        )

    session.add.assert_not_called()
    session.commit.assert_not_awaited()
    session.rollback.assert_awaited_once()


def test_transaction_methods_do_not_commit_or_rollback() -> None:
    user_id = uuid4()
    competency_id = uuid4()
    competency = UserCompetency(
        id=competency_id,
        user_id=user_id,
        competency_key="communication",
        display_name="Communication",
        evidence_count=0,
    )
    session = _session(None)
    service = CompetencyService(session)

    created = asyncio.run(
        service.get_or_create_competency_in_transaction(
            user_id,
            " communication ",
            "Communication",
        )
    )
    assert created.competency_key == "communication"
    assert not session.commit.await_count
    assert not session.rollback.await_count

    session.scalar = AsyncMock(side_effect=[competency, None])
    evidence = asyncio.run(
        service.add_evidence_in_transaction(
            user_id=user_id,
            competency_id=competency_id,
            source_type="practice",
            source_session_id=uuid4(),
            source_entity_type="practiceAttempt",
            source_entity_id=uuid4(),
            signal_type="score",
            occurred_at=datetime.now(UTC),
            score=80,
        )
    )
    assert evidence.user_id == user_id
    assert not session.commit.await_count
    assert not session.rollback.await_count


def test_add_evidence_rejects_competency_owned_by_another_user() -> None:
    session = _session(None)

    with pytest.raises(ValueError, match="does not belong"):
        asyncio.run(
            CompetencyService(session).add_evidence(
                user_id=uuid4(),
                competency_id=uuid4(),
                source_type="practice",
                source_session_id=uuid4(),
                source_entity_type="practiceAttempt",
                source_entity_id=uuid4(),
                signal_type="score",
                occurred_at=datetime.now(UTC),
                score=80,
            )
        )

    session.add.assert_not_called()
    session.rollback.assert_awaited_once()


def test_duplicate_evidence_is_idempotent() -> None:
    user_id = uuid4()
    competency_id = uuid4()
    competency = UserCompetency(
        id=competency_id,
        user_id=user_id,
        competency_key="communication",
        display_name="Communication",
    )
    competency.evidence_count = 4
    existing = _evidence(
        user_id=user_id,
        competency_id=competency_id,
        source_entity_id=uuid4(),
    )
    session = _session(competency, existing)

    result = asyncio.run(
        CompetencyService(session).add_evidence(
            user_id=user_id,
            competency_id=competency_id,
            source_type="practice",
            source_session_id=uuid4(),
            source_entity_type="practiceAttempt",
            source_entity_id=existing.source_entity_id,
            signal_type="score",
            occurred_at=datetime.now(UTC),
            score=99,
            details={"different": "payload"},
        )
    )

    assert result is existing
    assert competency.evidence_count == 4
    session.add.assert_not_called()
    session.commit.assert_awaited_once()


def test_new_evidence_updates_count_and_latest_timestamp_only() -> None:
    user_id = uuid4()
    competency_id = uuid4()
    previous = datetime(2026, 8, 17, 8, tzinfo=UTC)
    occurred = previous + timedelta(hours=2)
    competency = UserCompetency(
        id=competency_id,
        user_id=user_id,
        competency_key="ownership",
        display_name="Ownership",
        level=61,
        confidence=42,
        evidence_count=2,
        trend="stable",
        last_evidence_at=previous,
    )
    session = _session(competency, None)

    evidence = asyncio.run(
        CompetencyService(session).add_evidence(
            user_id=user_id,
            competency_id=competency_id,
            source_type="interview",
            source_session_id=uuid4(),
            source_entity_type="interviewTurn",
            source_entity_id=uuid4(),
            signal_type="strength",
            occurred_at=occurred,
            evidence_text="Explained ownership clearly.",
        )
    )

    assert evidence.evidence_text == "Explained ownership clearly."
    assert evidence.details == {}
    assert competency.evidence_count == 3
    assert competency.last_evidence_at == occurred
    assert competency.level == 61
    assert competency.confidence == 42
    assert competency.trend == "stable"
    session.add.assert_called_once_with(evidence)
    session.commit.assert_awaited_once()
