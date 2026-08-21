import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from riva.db.database import Database
from riva.models import CompetencyEvidence, User, UserCompetency
from riva.services.competencies import CompetencyService
from tests.helpers.integration_database import get_integration_database_url

pytestmark = pytest.mark.integration


def _user(user_id: UUID, username: str) -> User:
    return User(
        id=user_id,
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name=username,
    )


def test_competency_models_persist_with_ownership_and_db_constraints() -> None:
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
                            _user(owner_id, "competency-owner"),
                            _user(other_id, "competency-other"),
                        ]
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    service = CompetencyService(session)
                    competency = await service.get_or_create_competency(
                        owner_id,
                        "  Communication ",
                        "Communication",
                    )
                    duplicate = await service.get_or_create_competency(
                        owner_id,
                        "COMMUNICATION",
                        "Updated communication",
                    )
                    other_competency = await service.get_or_create_competency(
                        other_id,
                        "communication",
                        "Communication",
                    )

                    assert duplicate.id == competency.id
                    assert duplicate.display_name == "Updated communication"
                    assert other_competency.id != competency.id
                    assert other_competency.competency_key == competency.competency_key
                    competency_id = competency.id
                    competency_key = competency.competency_key

                    occurred_at = datetime(2026, 8, 17, 10, tzinfo=UTC)
                    evidence = await service.add_evidence(
                        user_id=owner_id,
                        competency_id=competency_id,
                        source_type="practice",
                        source_session_id=uuid4(),
                        source_entity_type="practiceAttempt",
                        source_entity_id=uuid4(),
                        signal_type="score",
                        occurred_at=occurred_at,
                        score=86,
                    )
                    same_evidence = await service.add_evidence(
                        user_id=owner_id,
                        competency_id=competency_id,
                        source_type="practice",
                        source_session_id=uuid4(),
                        source_entity_type="practiceAttempt",
                        source_entity_id=evidence.source_entity_id,
                        signal_type="score",
                        occurred_at=occurred_at + timedelta(days=1),
                        score=12,
                    )
                    older = await service.add_evidence(
                        user_id=owner_id,
                        competency_id=competency_id,
                        source_type="interview",
                        source_session_id=uuid4(),
                        source_entity_type="interviewReview",
                        source_entity_id=uuid4(),
                        signal_type="weakness",
                        occurred_at=occurred_at - timedelta(days=1),
                        evidence_text="Could be more specific.",
                    )

                    assert evidence.id == same_evidence.id
                    assert evidence.details == {}
                    assert older.id != evidence.id
                    assert competency.evidence_count == 2
                    assert competency.last_evidence_at == occurred_at
                    assert competency.level is None
                    assert competency.confidence == 0
                    assert competency.trend == "insufficient"
                    assert (
                        len(await service.list_evidence(owner_id, competency_id)) == 2
                    )

                    with pytest.raises(ValueError, match="does not belong"):
                        await service.add_evidence(
                            user_id=other_id,
                            competency_id=competency_id,
                            source_type="practice",
                            source_session_id=uuid4(),
                            source_entity_type="practiceAttempt",
                            source_entity_id=uuid4(),
                            signal_type="score",
                            occurred_at=occurred_at,
                            score=75,
                        )

                async with database.sessionmaker() as session:
                    session.add(
                        UserCompetency(
                            id=uuid4(),
                            user_id=owner_id,
                            competency_key=competency_key,
                            display_name="Duplicate",
                        )
                    )
                    with pytest.raises(IntegrityError):
                        await session.commit()
                    await session.rollback()

                    session.add(
                        UserCompetency(
                            id=uuid4(),
                            user_id=owner_id,
                            competency_key="invalid-level",
                            display_name="Invalid level",
                            level=101,
                        )
                    )
                    with pytest.raises(IntegrityError):
                        await session.commit()
                    await session.rollback()

                    session.add(
                        CompetencyEvidence(
                            user_id=other_id,
                            competency_id=competency_id,
                            source_type="practice",
                            source_session_id=uuid4(),
                            source_entity_type="practiceAttempt",
                            source_entity_id=uuid4(),
                            signal_type="score",
                            score=70,
                            details={},
                            occurred_at=datetime.now(UTC),
                        )
                    )
                    with pytest.raises(IntegrityError):
                        await session.commit()
                    await session.rollback()

                    session.add(
                        CompetencyEvidence(
                            user_id=owner_id,
                            competency_id=competency_id,
                            source_type="practice",
                            source_session_id=uuid4(),
                            source_entity_type="practiceAttempt",
                            source_entity_id=uuid4(),
                            signal_type="score",
                            score=101,
                            details={},
                            occurred_at=datetime.now(UTC),
                        )
                    )
                    with pytest.raises(IntegrityError):
                        await session.commit()
                    await session.rollback()

                async with database.sessionmaker() as session:
                    owner = await session.scalar(
                        select(User).where(User.id == owner_id)
                    )
                    assert owner is not None
                    await session.delete(owner)
                    await session.commit()

                async with database.sessionmaker() as session:
                    assert (
                        await session.scalar(
                            select(func.count())
                            .select_from(UserCompetency)
                            .where(UserCompetency.user_id == owner_id)
                        )
                    ) == 0
                    assert (
                        await session.scalar(
                            select(func.count())
                            .select_from(CompetencyEvidence)
                            .where(CompetencyEvidence.user_id == owner_id)
                        )
                    ) == 0
            finally:
                await database.drop_tables()

    asyncio.run(run())
