import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from riva.models import CompetencyEvidence, UserCompetency
from riva.services.competency_ingestion import CompetencyIngestionService

NOW = datetime(2026, 8, 17, 10, tzinfo=UTC)


class FakeCompetencyService:
    def __init__(self) -> None:
        self.competencies: dict[tuple[object, str], UserCompetency] = {}
        self.evidence: dict[tuple[object, object, object, str], CompetencyEvidence] = {}
        self.competency_calls: list[tuple[object, str, str]] = []
        self.evidence_calls: list[dict[str, object]] = []

    async def get_or_create_competency_in_transaction(
        self,
        *,
        user_id: object,
        competency_key: str,
        display_name: str,
    ) -> UserCompetency:
        self.competency_calls.append((user_id, competency_key, display_name))
        key = (user_id, competency_key)
        competency = self.competencies.get(key)
        if competency is None:
            competency = UserCompetency(
                id=uuid4(),
                user_id=user_id,
                competency_key=competency_key,
                display_name=display_name,
            )
            self.competencies[key] = competency
        return competency

    async def add_evidence_in_transaction(self, **kwargs: object) -> CompetencyEvidence:
        self.evidence_calls.append(kwargs)
        key = (
            kwargs["competency_id"],
            kwargs["source_entity_type"],
            kwargs["source_entity_id"],
            kwargs["signal_type"],
        )
        existing = self.evidence.get(key)
        if existing is not None:
            return existing
        evidence = CompetencyEvidence(
            id=uuid4(),
            user_id=kwargs["user_id"],
            competency_id=kwargs["competency_id"],
            source_type=kwargs["source_type"],
            source_session_id=kwargs["source_session_id"],
            source_entity_type=kwargs["source_entity_type"],
            source_entity_id=kwargs["source_entity_id"],
            signal_type=kwargs["signal_type"],
            score=kwargs.get("score"),
            evidence_text=kwargs.get("evidence_text"),
            details=dict(kwargs.get("details") or {}),
            occurred_at=kwargs["occurred_at"],
        )
        self.evidence[key] = evidence
        return evidence


class FakeCompetencyAggregationService:
    def __init__(self) -> None:
        self.calls: list[tuple[object, set[object]]] = []

    async def recompute_many_in_transaction(
        self,
        *,
        user_id: object,
        competency_ids: set[object],
    ) -> list[object]:
        self.calls.append((user_id, competency_ids))
        return []


def _service() -> tuple[CompetencyIngestionService, FakeCompetencyService, MagicMock]:
    session = MagicMock()
    competency_service = FakeCompetencyService()
    aggregation_service = FakeCompetencyAggregationService()
    service = CompetencyIngestionService(
        session,
        competency_aggregation_service_factory=lambda _session: aggregation_service,
    )  # type: ignore[arg-type]
    service.competency_service = competency_service  # type: ignore[assignment]
    return service, competency_service, session


def _practice_context(user_id=None):
    user_id = user_id or uuid4()
    practice_session = SimpleNamespace(id=uuid4(), user_id=user_id)
    attempt = SimpleNamespace(
        id=uuid4(),
        user_id=user_id,
        session_id=practice_session.id,
        question_type="behavioral",
        difficulty="pressure",
    )
    return user_id, practice_session, attempt


def _evaluation(attempt, *, dimensions=None):
    return SimpleNamespace(
        id=uuid4(),
        attempt_id=attempt.id,
        overall_score=84,
        dimension_scores=dimensions
        or [
            {"dimension": "relevance", "score": 80, "explanation": "Relevant."},
            {
                "dimension": "personalContribution",
                "score": 78,
                "explanation": "Ownership is clear.",
            },
        ],
        evaluated_at=NOW,
    )


def test_practice_evaluation_ingests_answer_and_dimension_scores_without_commit() -> (
    None
):
    service, competency_service, session = _service()
    user_id, practice_session, attempt = _practice_context()
    evaluation = _evaluation(attempt)

    result = asyncio.run(
        service.ingest_practice_evaluation(
            user_id,
            practice_session,
            attempt,
            evaluation,  # type: ignore[arg-type]
        )
    )

    assert len(result) == 3
    assert [call[1] for call in competency_service.competency_calls] == [
        "answer_quality",
        "relevance",
        "personal_contribution",
    ]
    assert result[0].score == 84
    assert result[0].details == {
        "evaluationId": str(evaluation.id),
        "questionType": "behavioral",
        "difficulty": "pressure",
    }
    assert result[1].details["dimension"] == "relevance"
    assert result[1].details["explanation"] == "Relevant."
    session.commit.assert_not_called()


def test_practice_review_only_writes_answer_quality_text_and_preserves_raw_items() -> (
    None
):
    service, competency_service, _session = _service()
    user_id, practice_session, attempt = _practice_context()
    review = SimpleNamespace(
        id=uuid4(),
        attempt_id=attempt.id,
        highlights=[" Clear ownership ", ""],
        main_issues=["Needs evidence"],
        exposed_weaknesses=[" Add a result ", "Specificity"],
        reviewed_at=NOW,
    )

    result = asyncio.run(
        service.ingest_practice_review(
            user_id,
            practice_session,
            attempt,
            review,  # type: ignore[arg-type]
        )
    )

    assert {item.competency_id for item in result} == {
        competency_service.competencies[(user_id, "answer_quality")].id
    }
    assert [(item.signal_type, item.evidence_text) for item in result] == [
        ("strength", "Clear ownership"),
        ("weakness", "Add a result\nSpecificity"),
    ]
    assert result[0].details["items"] == [" Clear ownership ", ""]
    assert result[1].details["mainIssues"] == ["Needs evidence"]


def test_interview_turn_ingests_score_strength_and_weakness() -> None:
    service, _competency_service, _session = _service()
    user_id = uuid4()
    interview_session = SimpleNamespace(id=uuid4(), user_id=user_id)
    assessment = SimpleNamespace(
        id=uuid4(),
        session_id=interview_session.id,
        question_id=uuid4(),
        score=91,
        decision="completeQuestion",
        strengths=["Clear trade-off"],
        issues=["Missing metric"],
        created_at=NOW,
    )

    result = asyncio.run(
        service.ingest_interview_turn(
            user_id,
            interview_session,
            assessment,  # type: ignore[arg-type]
        )
    )

    assert [item.signal_type for item in result] == [
        "score",
        "strength",
        "weakness",
    ]
    assert result[1].details["questionId"] == str(assessment.question_id)
    assert result[1].details["decision"] == "completeQuestion"
    assert result[1].details["items"] == ["Clear trade-off"]
    assert result[2].details["items"] == ["Missing metric"]


def test_interview_review_complete_and_partial_modes() -> None:
    service, competency_service, _session = _service()
    user_id = uuid4()
    interview_session = SimpleNamespace(id=uuid4(), user_id=user_id)
    complete_review = SimpleNamespace(
        id=uuid4(),
        session_id=interview_session.id,
        status="complete",
        review={
            "overallScore": 88,
            "dimensionScores": [
                {
                    "dimension": "roleAlignment",
                    "score": 82,
                    "explanation": "Aligned.",
                }
            ],
            "mainStrengths": ["Strong framing"],
            "exposedWeaknesses": ["More concrete results"],
            "frequentIssues": ["Vague result"],
            "riskPoints": ["Low specificity"],
        },
        created_at=NOW,
    )
    partial_review = SimpleNamespace(
        id=uuid4(),
        session_id=interview_session.id,
        status="partial",
        review={
            "mainStrengths": ["Kept the answer focused"],
            "exposedWeaknesses": ["Needs a metric"],
            "frequentIssues": [],
            "riskPoints": [],
        },
        created_at=NOW,
    )

    complete = asyncio.run(
        service.ingest_interview_review(
            user_id,
            interview_session,
            complete_review,  # type: ignore[arg-type]
        )
    )
    partial = asyncio.run(
        service.ingest_interview_review(
            user_id,
            interview_session,
            partial_review,  # type: ignore[arg-type]
        )
    )

    assert [item.signal_type for item in complete] == [
        "score",
        "score",
        "strength",
        "weakness",
    ]
    assert complete[1].details["dimension"] == "roleAlignment"
    assert complete[3].details["frequentIssues"] == ["Vague result"]
    assert [item.signal_type for item in partial] == ["strength", "weakness"]
    assert all(item.score is None for item in partial)
    assert set(competency_service.competencies) == {
        (user_id, "answer_quality"),
        (user_id, "role_alignment"),
    }


def test_unavailable_review_has_no_evidence_and_unknown_dimension_fails() -> None:
    service, competency_service, _session = _service()
    user_id, practice_session, attempt = _practice_context()
    unavailable = SimpleNamespace(
        id=uuid4(),
        session_id=uuid4(),
        status="unavailable",
        review=None,
        created_at=NOW,
    )
    interview_session = SimpleNamespace(id=unavailable.session_id, user_id=user_id)

    assert (
        asyncio.run(
            service.ingest_interview_review(
                user_id,
                interview_session,
                unavailable,  # type: ignore[arg-type]
            )
        )
        == []
    )

    with pytest.raises(ValueError, match="unknown competency dimension"):
        asyncio.run(
            service.ingest_practice_evaluation(
                user_id,
                practice_session,
                attempt,
                _evaluation(
                    attempt,
                    dimensions=[
                        {
                            "dimension": "customDimension",
                            "score": 50,
                            "explanation": "Unknown.",
                        }
                    ],
                ),  # type: ignore[arg-type]
            )
        )
    assert competency_service.competency_calls
