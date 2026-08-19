import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select

from riva.db.database import Database
from riva.models import CompetencyEvidence, User, UserCompetency
from riva.services.competencies import CompetencyService
from riva.services.competency_aggregation import CompetencyAggregationService
from riva.services.competency_ingestion import CompetencyIngestionService
from tests.helpers.integration_database import get_integration_database_url


pytestmark = pytest.mark.integration
START = datetime(2026, 8, 1, 9, tzinfo=UTC)


def _user(username: str) -> User:
    return User(
        id=uuid4(),
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name=username,
    )


def _practice_context(user_id):
    practice_session = SimpleNamespace(id=uuid4(), user_id=user_id)
    attempt = SimpleNamespace(
        id=uuid4(),
        user_id=user_id,
        session_id=practice_session.id,
        question_type="behavioral",
        difficulty="basic",
    )
    return practice_session, attempt


def test_competency_aggregation_persists_repairs_and_is_session_weighted() -> None:
    async def run_test() -> None:
        database_url = get_integration_database_url()
        async with Database(database_url) as database:
            await database.reset()
            try:
                owner = _user("competency-aggregation-owner")
                async with database.sessionmaker() as session:
                    session.add(owner)
                    await session.commit()

                practice_session, attempt = _practice_context(owner.id)
                evaluation = SimpleNamespace(
                    id=uuid4(),
                    attempt_id=attempt.id,
                    overall_score=70,
                    dimension_scores=[],
                    evaluated_at=START,
                )
                async with database.sessionmaker() as session:
                    written = await CompetencyIngestionService(
                        session
                    ).ingest_practice_evaluation(
                        owner.id,
                        practice_session,  # type: ignore[arg-type]
                        attempt,  # type: ignore[arg-type]
                        evaluation,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert len(written) == 1

                async with database.sessionmaker() as session:
                    competency = await session.scalar(
                        select(UserCompetency).where(
                            UserCompetency.user_id == owner.id,
                            UserCompetency.competency_key == "answer_quality",
                        )
                    )
                    assert competency is not None
                    assert competency.evidence_count == 1
                    assert competency.level == 70
                    assert competency.confidence == 20
                    assert competency.trend == "insufficient"
                    first_summary = (
                        competency.level,
                        competency.confidence,
                        competency.trend,
                        competency.evidence_count,
                        competency.last_evidence_at,
                    )

                async with database.sessionmaker() as session:
                    replay = await CompetencyIngestionService(
                        session
                    ).ingest_practice_evaluation(
                        owner.id,
                        practice_session,  # type: ignore[arg-type]
                        attempt,  # type: ignore[arg-type]
                        evaluation,  # type: ignore[arg-type]
                    )
                    await session.commit()
                    assert len(replay) == 1

                    competency = await session.scalar(
                        select(UserCompetency).where(
                            UserCompetency.user_id == owner.id,
                            UserCompetency.competency_key == "answer_quality",
                        )
                    )
                    assert competency is not None
                    assert (
                        competency.level,
                        competency.confidence,
                        competency.trend,
                        competency.evidence_count,
                        competency.last_evidence_at,
                    ) == first_summary

                    competency.level = 1
                    competency.confidence = 2
                    competency.trend = "declining"
                    competency.evidence_count = 99
                    await session.commit()

                    repaired = await CompetencyAggregationService(
                        session
                    ).recompute_user_in_transaction(owner.id)
                    await session.commit()
                    assert len(repaired) == 1
                    assert competency.level == 70
                    assert competency.confidence == 20
                    assert competency.trend == "insufficient"
                    assert competency.evidence_count == 1

                interview_session = SimpleNamespace(
                    id=uuid4(),
                    user_id=owner.id,
                )
                first_assessment = SimpleNamespace(
                    id=uuid4(),
                    session_id=interview_session.id,
                    question_id=uuid4(),
                    score=60,
                    decision="completeQuestion",
                    strengths=[],
                    issues=[],
                    created_at=START + timedelta(days=1),
                )
                second_assessment = SimpleNamespace(
                    id=uuid4(),
                    session_id=interview_session.id,
                    question_id=uuid4(),
                    score=80,
                    decision="completeQuestion",
                    strengths=[],
                    issues=[],
                    created_at=START + timedelta(days=2),
                )
                async with database.sessionmaker() as session:
                    ingestion = CompetencyIngestionService(session)
                    await ingestion.ingest_interview_turn(
                        owner.id,
                        interview_session,  # type: ignore[arg-type]
                        first_assessment,  # type: ignore[arg-type]
                    )
                    await ingestion.ingest_interview_turn(
                        owner.id,
                        interview_session,  # type: ignore[arg-type]
                        second_assessment,  # type: ignore[arg-type]
                    )
                    await session.commit()

                    competency = await session.scalar(
                        select(UserCompetency).where(
                            UserCompetency.user_id == owner.id,
                            UserCompetency.competency_key == "answer_quality",
                        )
                    )
                    assert competency is not None
                    assert competency.level == 70
                    # One practice session plus one interview session, not
                    # one datapoint per interview turn.
                    assert competency.confidence == 50
                    assert competency.evidence_count == 3
                    assert (
                        await session.scalar(
                            select(CompetencyEvidence).where(
                                CompetencyEvidence.competency_id == competency.id,
                                CompetencyEvidence.source_type == "interview",
                            ).with_for_update()
                        )
                        is not None
                    )
            finally:
                await database.reset()

    asyncio.run(run_test())
