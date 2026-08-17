from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

from riva.services.dashboard_recommendation import DashboardRecommendationService


NOW = datetime(2026, 8, 17, 12, tzinfo=UTC)


def competency(
    key: str,
    level: int | None,
    confidence: int,
    *,
    display_name: str | None = None,
):
    return SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        competency_key=key,
        display_name=display_name or key.replace("_", " ").title(),
        level=level,
        confidence=confidence,
        evidences=[],
    )


def evidence(
    *,
    competency_id,
    signal_type: str,
    occurred_at: datetime,
    score: int | None = None,
    text: str | None = None,
    explanation: str | None = None,
    source_session_id=None,
):
    details = {}
    if explanation is not None:
        details["explanation"] = explanation
    return SimpleNamespace(
        id=uuid4(),
        competency_id=competency_id,
        source_session_id=source_session_id or uuid4(),
        signal_type=signal_type,
        score=score,
        evidence_text=text,
        details=details,
        occurred_at=occurred_at,
        created_at=occurred_at + timedelta(seconds=1),
    )


def ready_role():
    return SimpleNamespace(
        id=uuid4(),
        job_description=SimpleNamespace(status="ready"),
        job_description_analysis=object(),
    )


def build(service, user_id, competencies, evidence_by_competency, **kwargs):
    return service.build(
        user_id=user_id,
        competencies=competencies,
        evidence_by_competency=evidence_by_competency,
        current_role=kwargs.get("current_role", ready_role()),
        profile_completed=kwargs.get("profile_completed", True),
    )


def test_weaknesses_require_persisted_level_and_confidence_and_are_capped() -> None:
    user_id = uuid4()
    candidates = [
        competency("risk_control", 55, 40),
        competency("answer_quality", 40, 60),
        competency("specificity", 40, 60),
        competency("communication", 40, 60),
        competency("relevance", None, 100),
        competency("structure", 50, 39),
    ]

    result = build(
        DashboardRecommendationService(object()),
        user_id,
        candidates,
        {},
    )

    assert [item.id for item in result.weaknesses] == [
        candidates[1].id,
        candidates[2].id,
        candidates[3].id,
    ]
    assert result.recommendation is None


def test_latest_weakness_text_has_priority_and_maps_targeted_practice() -> None:
    user_id = uuid4()
    candidate = competency("results_and_evidence", 55, 60, display_name="Results")
    source_id = uuid4()
    evidence_items = [
        evidence(
            competency_id=candidate.id,
            signal_type="score",
            occurred_at=NOW,
            score=55,
            explanation="Score explanation",
            source_session_id=source_id,
        ),
        evidence(
            competency_id=candidate.id,
            signal_type="weakness",
            occurred_at=NOW + timedelta(minutes=1),
            text="Quantify the outcome.",
        ),
    ]

    result = build(
        DashboardRecommendationService(object()),
        user_id,
        [candidate],
        {candidate.id: evidence_items},
    )

    assert result.weaknesses[0].category == "quantifiedResults"
    assert result.weaknesses[0].description == "Quantify the outcome."
    assert result.weaknesses[0].recommended_practice_count == 2
    assert result.recommendation is not None
    assert result.recommendation.source_record_id == source_id
    assert result.recommendation.recommendation.model_dump(by_alias=False) == {
        "action": "targetedPractice",
        "reason": "Quantify the outcome.",
        "question_type": "projectDeepDive",
        "difficulty": "basic",
            "focus_areas": ["Results and Evidence"],
    }


def test_score_explanation_and_fallback_are_used_deterministically() -> None:
    user_id = uuid4()
    source_id = uuid4()
    explained = competency("role_alignment", 60, 40)
    fallback = competency("specificity", 69, 40)
    explained_score = evidence(
        competency_id=explained.id,
        signal_type="score",
        occurred_at=NOW,
        score=60,
        explanation="Connect the example to the business goal.",
        source_session_id=source_id,
    )
    fallback_score = evidence(
        competency_id=fallback.id,
        signal_type="score",
        occurred_at=NOW,
        score=69,
    )

    service = DashboardRecommendationService(object())
    role = ready_role()
    first = build(
        service,
        user_id,
        [fallback, explained],
        {explained.id: [explained_score], fallback.id: [fallback_score]},
        current_role=role,
    )
    second = build(
        service,
        user_id,
        [fallback, explained],
        {explained.id: [explained_score], fallback.id: [fallback_score]},
        current_role=role,
    )

    assert first.weaknesses[0].description == "Connect the example to the business goal."
    assert first.weaknesses[1].description == "Specificity"
    assert first.recommendation is not None
    assert first.recommendation.recommendation.action == "targetedPractice"
    assert first.recommendation.recommendation.question_type == "businessUnderstanding"
    assert first.recommendation.recommendation.difficulty == "pressure"
    assert first.recommendation.model_dump() == second.recommendation.model_dump()


def test_risk_control_uses_pressure_mock_interview_and_prerequisites_gate_only_action() -> None:
    user_id = uuid4()
    candidate = competency("risk_control", 35, 80, display_name="Risk Control")
    score = evidence(
        competency_id=candidate.id,
        signal_type="score",
        occurred_at=NOW,
        score=35,
    )
    service = DashboardRecommendationService(object())

    result = build(service, user_id, [candidate], {candidate.id: [score]})
    assert result.recommendation is not None
    assert result.recommendation.estimated_minutes == 30
    assert result.recommendation.recommendation.model_dump(by_alias=False) == {
        "action": "mockInterview",
        "reason": "Focus on Risk Control based on your recent training performance.",
        "round": "comprehensive",
        "difficulty": "pressure",
        "focus_areas": ["Risk Control"],
    }

    blocked = build(
        service,
        user_id,
        [candidate],
        {candidate.id: [score]},
        profile_completed=False,
    )
    assert blocked.weaknesses
    assert blocked.recommendation is None


def test_no_score_does_not_create_recommendation_even_when_aggregate_is_weak() -> None:
    candidate = competency("communication", 50, 40)
    result = build(
        DashboardRecommendationService(object()),
        uuid4(),
        [candidate],
        {
            candidate.id: [
                evidence(
                    competency_id=candidate.id,
                    signal_type="weakness",
                    occurred_at=NOW,
                    text="Use a clearer structure.",
                )
            ]
        },
    )
    assert result.weaknesses[0].description == "Use a clearer structure."
    assert result.recommendation is None
