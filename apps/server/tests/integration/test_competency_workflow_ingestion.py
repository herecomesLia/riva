import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from riva.db.database import Database
from riva.models import CompetencyEvidence, User, UserCompetency
from riva.services.competency_ingestion import CompetencyIngestionService
from tests.helpers.integration_database import get_integration_database_url


pytestmark = pytest.mark.integration
NOW = datetime(2026, 8, 17, 10, tzinfo=UTC)


def _user(user_id: UUID, username: str) -> User:
    return User(
        id=user_id,
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name=username,
    )


def _practice_context(user_id: UUID) -> tuple[object, object]:
    practice_session = SimpleNamespace(id=uuid4(), user_id=user_id)
    attempt = SimpleNamespace(
        id=uuid4(),
        user_id=user_id,
        session_id=practice_session.id,
        question_type="behavioral",
        difficulty="basic",
    )
    return practice_session, attempt


def _practice_evaluation(attempt: object, *, unknown: bool = False) -> object:
    dimension = "unknownDimension" if unknown else "relevance"
    return SimpleNamespace(
        id=uuid4(),
        attempt_id=attempt.id,
        overall_score=80,
        dimension_scores=[
            {"dimension": dimension, "score": 75, "explanation": "Relevant."}
        ],
        evaluated_at=NOW,
    )


def _practice_review(attempt: object) -> object:
    return SimpleNamespace(
        id=uuid4(),
        attempt_id=attempt.id,
        highlights=["Clear ownership"],
        main_issues=["Needs evidence"],
        exposed_weaknesses=["Add a concrete result"],
        reviewed_at=NOW,
    )


def _interview_review(
    session_id: UUID,
    *,
    status: str,
    review: dict[str, object] | None,
) -> object:
    return SimpleNamespace(
        id=uuid4(),
        session_id=session_id,
        status=status,
        review=review,
        created_at=NOW,
    )


def test_practice_and_interview_ingestion_is_idempotent_and_atomic() -> None:
    database_url = get_integration_database_url()

    async def run() -> None:
        async with Database(database_url) as database:
            await database.reset()
            try:
                owner_id = uuid4()
                other_id = uuid4()
                async with database.sessionmaker() as session:
                    session.add_all(
                        [
                            _user(owner_id, "workflow-owner"),
                            _user(other_id, "workflow-other"),
                        ]
                    )
                    await session.commit()

                practice_session, attempt = _practice_context(owner_id)
                evaluation = _practice_evaluation(attempt)
                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    await ingestion.ingest_practice_evaluation(
                        owner_id,
                        practice_session,  # type: ignore[arg-type]
                        attempt,  # type: ignore[arg-type]
                        evaluation,  # type: ignore[arg-type]
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    replay = await ingestion.ingest_practice_evaluation(
                        owner_id,
                        practice_session,  # type: ignore[arg-type]
                        attempt,  # type: ignore[arg-type]
                        evaluation,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert len(replay) == 2

                    count = await session.scalar(
                        select(func.count())
                        .select_from(CompetencyEvidence)
                        .where(CompetencyEvidence.user_id == owner_id)
                    )
                    assert count == 2

                    with pytest.raises(ValueError, match="does not belong"):
                        await ingestion.ingest_practice_evaluation(
                            other_id,
                            practice_session,  # type: ignore[arg-type]
                            attempt,  # type: ignore[arg-type]
                            evaluation,  # type: ignore[arg-type]
                        )
                    await session.rollback()

                practice_review = _practice_review(attempt)
                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    written = await ingestion.ingest_practice_review(
                        owner_id,
                        practice_session,  # type: ignore[arg-type]
                        attempt,  # type: ignore[arg-type]
                        practice_review,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert [item.signal_type for item in written] == [
                        "strength",
                        "weakness",
                    ]

                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    replay = await ingestion.ingest_practice_review(
                        owner_id,
                        practice_session,  # type: ignore[arg-type]
                        attempt,  # type: ignore[arg-type]
                        practice_review,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert len(replay) == 2
                    count = await session.scalar(
                        select(func.count())
                        .select_from(CompetencyEvidence)
                        .where(CompetencyEvidence.user_id == owner_id)
                    )
                    assert count == 4

                interview_session = SimpleNamespace(id=uuid4(), user_id=owner_id)
                assessment = SimpleNamespace(
                    id=uuid4(),
                    session_id=interview_session.id,
                    question_id=uuid4(),
                    score=90,
                    decision="completeQuestion",
                    strengths=["Clear answer"],
                    issues=["Needs evidence"],
                    created_at=NOW,
                )
                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    await ingestion.ingest_interview_turn(
                        owner_id,
                        interview_session,  # type: ignore[arg-type]
                        assessment,  # type: ignore[arg-type]
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    replay = await ingestion.ingest_interview_turn(
                        owner_id,
                        interview_session,  # type: ignore[arg-type]
                        assessment,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert len(replay) == 3

                complete_review = _interview_review(
                    interview_session.id,
                    status="complete",
                    review={
                        "overallScore": 87,
                        "dimensionScores": [
                            {
                                "dimension": dimension,
                                "score": 82,
                                "explanation": f"Evidence for {dimension}.",
                            }
                            for dimension in (
                                "relevance",
                                "structure",
                                "specificity",
                                "personalContribution",
                                "resultsAndEvidence",
                                "roleAlignment",
                                "communication",
                                "riskControl",
                            )
                        ],
                        "mainStrengths": ["Good framing"],
                        "exposedWeaknesses": ["Add a metric"],
                        "frequentIssues": ["Vague result"],
                        "riskPoints": ["Low specificity"],
                    },
                )
                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    written = await ingestion.ingest_interview_review(
                        owner_id,
                        interview_session,  # type: ignore[arg-type]
                        complete_review,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert len(written) == 11

                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    replay = await ingestion.ingest_interview_review(
                        owner_id,
                        interview_session,  # type: ignore[arg-type]
                        complete_review,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert len(replay) == 11

                partial_review = _interview_review(
                    interview_session.id,
                    status="partial",
                    review={
                        "mainStrengths": ["Stayed focused"],
                        "exposedWeaknesses": ["Needs evidence"],
                        "frequentIssues": [],
                        "riskPoints": [],
                    },
                )
                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    written = await ingestion.ingest_interview_review(
                        owner_id,
                        interview_session,  # type: ignore[arg-type]
                        partial_review,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert [item.signal_type for item in written] == [
                        "strength",
                        "weakness",
                    ]
                    assert all(item.score is None for item in written)

                unavailable_review = _interview_review(
                    interview_session.id,
                    status="unavailable",
                    review=None,
                )
                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    assert await ingestion.ingest_interview_review(
                        owner_id,
                        interview_session,  # type: ignore[arg-type]
                        unavailable_review,  # type: ignore[arg-type]
                    ) == []
                    await session.commit()

                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    with pytest.raises(ValueError, match="unknown competency dimension"):
                        await ingestion.ingest_practice_evaluation(
                            owner_id,
                            practice_session,  # type: ignore[arg-type]
                            attempt,  # type: ignore[arg-type]
                            _practice_evaluation(attempt, unknown=True),  # type: ignore[arg-type]
                    )
                    await session.rollback()
                    count = await session.scalar(
                        select(func.count())
                        .select_from(CompetencyEvidence)
                        .where(CompetencyEvidence.user_id == owner_id)
                    )
                    assert count == 20

                async with database.sessionmaker() as session:
                    competencies = list(
                        (
                            await session.scalars(
                                select(UserCompetency).where(
                                    UserCompetency.user_id == owner_id
                                )
                            )
                        ).all()
                    )
                    assert {item.competency_key for item in competencies} == {
                        "answer_quality",
                        "relevance",
                        "structure",
                        "specificity",
                        "personal_contribution",
                        "results_and_evidence",
                        "role_alignment",
                        "communication",
                        "risk_control",
                    }
                    evidence_count = await session.scalar(
                        select(func.count())
                        .select_from(CompetencyEvidence)
                        .where(CompetencyEvidence.user_id == owner_id)
                    )
                    assert evidence_count == 20
                    evidence = list(
                        (
                            await session.scalars(
                                select(CompetencyEvidence).where(
                                    CompetencyEvidence.user_id == owner_id
                                )
                            )
                        ).all()
                    )
                    practice_score = next(
                        item
                        for item in evidence
                        if item.source_entity_id == attempt.id
                        and item.signal_type == "score"
                    )
                    assert practice_score.source_session_id == practice_session.id
                    assert practice_score.source_entity_type == "practiceAttempt"
                    interview_score = next(
                        item
                        for item in evidence
                        if item.source_entity_id == assessment.id
                        and item.signal_type == "score"
                    )
                    assert interview_score.source_session_id == interview_session.id
                    assert interview_score.source_entity_type == "interviewTurn"
            finally:
                await database.drop_tables()

    asyncio.run(run())
