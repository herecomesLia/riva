import asyncio
from datetime import UTC, datetime
import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import delete, func, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from riva.db import Database
from riva.models import (
    AgentRun,
    CareerProfile,
    MatchingAnalysis,
    TargetRole,
    User,
)


pytestmark = pytest.mark.integration
GENERATED_AT = datetime(2026, 8, 4, 9, 30, tzinfo=UTC)


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def user(user_id: UUID, suffix: str) -> User:
    return User(
        id=user_id,
        username=f"matching-{suffix}-{user_id.hex[:8]}",
        normalized_username=f"matching-{suffix}-{user_id.hex[:8]}",
        password_hash="hash",
        display_name="Matching User",
    )


def role(user_id: UUID) -> TargetRole:
    return TargetRole(
        id=uuid4(),
        user_id=user_id,
        title="Backend Engineer",
        company="Riva",
        preparation_status="preparing",
        job_description_status="missing",
        version=1,
    )


def profile(user_id: UUID) -> CareerProfile:
    return CareerProfile(
        profile_id=uuid4(),
        user_id=user_id,
        summary="Backend engineer focused on reliable APIs.",
        version=3,
    )


def agent_run(user_id: UUID, suffix: str) -> AgentRun:
    identifier = uuid4()
    return AgentRun(
        id=identifier,
        user_id=user_id,
        agent_id="matching-analyzer",
        prompt_id="matching-analyzer",
        prompt_version="1",
        output_schema_id="matching-analysis-v1",
        payload={},
        idempotency_key=f"matching-{suffix}-{identifier}",
        max_attempts=3,
        model="test-model",
    )


def matching_analysis(
    *,
    owner: User,
    target: TargetRole,
    career_profile: CareerProfile,
    source: AgentRun,
    **overrides: object,
) -> MatchingAnalysis:
    values: dict[str, object] = {
        "role_id": target.id,
        "user_id": owner.id,
        "profile_id": career_profile.profile_id,
        "profile_version": 3,
        "job_description_version": 2,
        "job_description_analysis_version": 4,
        "source_agent_run_id": source.id,
        "generated_at": GENERATED_AT,
        "overall_match_score": 87,
        "core_requirements_summary": "Build reliable payment APIs with Python.",
        "matched_capabilities": ["Python", "FastAPI"],
        "missing_capabilities": ["Kubernetes"],
        "underrepresented_capabilities": ["System design"],
        "resume_highlights": ["Improved API reliability"],
        "resume_gaps": ["Scale is not stated"],
        "high_risk_questions": ["How did you improve reliability?"],
        "preparation_recommendations": ["Prepare the reliability example."],
    }
    values.update(overrides)
    return MatchingAnalysis(**values)


async def seed_owner_graph(database: Database, suffix: str) -> dict[str, object]:
    owner = user(uuid4(), suffix)
    target = role(owner.id)
    career_profile = profile(owner.id)
    source = agent_run(owner.id, f"{suffix}-source")
    current_run = agent_run(owner.id, f"{suffix}-current")
    parsing_run = agent_run(owner.id, f"{suffix}-parsing")
    target.matching_analysis_run_id = current_run.id
    target.job_description_parsing_run_id = parsing_run.id

    async with database.sessionmaker() as session:
        session.add_all(
            [owner, target, career_profile, source, current_run, parsing_run]
        )
        await session.commit()

    return {
        "owner": owner,
        "target": target,
        "profile": career_profile,
        "source": source,
        "current_run": current_run,
        "parsing_run": parsing_run,
    }


async def expect_integrity_error(database: Database, entity: object) -> None:
    async with database.sessionmaker() as session:
        session.add(entity)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()


def test_matching_analysis_persists_result_dependencies_and_role_run_reference() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                graph = await seed_owner_graph(database, "persist")
                owner = graph["owner"]
                target = graph["target"]
                career_profile = graph["profile"]
                source = graph["source"]
                current_run = graph["current_run"]
                parsing_run = graph["parsing_run"]
                assert isinstance(owner, User)
                assert isinstance(target, TargetRole)
                assert isinstance(career_profile, CareerProfile)
                assert isinstance(source, AgentRun)
                assert isinstance(current_run, AgentRun)
                assert isinstance(parsing_run, AgentRun)

                analysis = matching_analysis(
                    owner=owner,
                    target=target,
                    career_profile=career_profile,
                    source=source,
                )
                async with database.sessionmaker() as session:
                    session.add(analysis)
                    await session.commit()

                    persisted = await session.get(MatchingAnalysis, target.id)
                    assert persisted is not None
                    assert persisted.role_id == target.id
                    assert persisted.user_id == owner.id
                    assert persisted.profile_id == career_profile.profile_id
                    assert persisted.profile_version == 3
                    assert persisted.job_description_version == 2
                    assert persisted.job_description_analysis_version == 4
                    assert persisted.source_agent_run_id == source.id
                    assert persisted.generated_at == GENERATED_AT
                    assert persisted.generated_at.tzinfo is not None
                    assert persisted.overall_match_score == 87
                    assert persisted.core_requirements_summary == (
                        "Build reliable payment APIs with Python."
                    )
                    assert persisted.matched_capabilities == ["Python", "FastAPI"]
                    assert persisted.missing_capabilities == ["Kubernetes"]
                    assert persisted.underrepresented_capabilities == [
                        "System design"
                    ]
                    assert persisted.resume_highlights == [
                        "Improved API reliability"
                    ]
                    assert persisted.resume_gaps == ["Scale is not stated"]
                    assert persisted.high_risk_questions == [
                        "How did you improve reliability?"
                    ]
                    assert persisted.preparation_recommendations == [
                        "Prepare the reliability example."
                    ]

                    persisted_role = await session.scalar(
                        select(TargetRole)
                        .options(
                            selectinload(TargetRole.matching_analysis),
                            selectinload(TargetRole.matching_analysis_run),
                            selectinload(TargetRole.job_description_parsing_run),
                        )
                        .where(TargetRole.id == target.id)
                    )
                    assert persisted_role is not None
                    assert persisted_role.matching_analysis is not None
                    assert persisted_role.matching_analysis.role_id == target.id
                    assert persisted_role.matching_analysis_run is not None
                    assert persisted_role.matching_analysis_run.id == current_run.id
                    assert persisted_role.job_description_parsing_run is not None
                    assert persisted_role.job_description_parsing_run.id == parsing_run.id
            finally:
                await database.reset()

    asyncio.run(run())


def test_matching_analysis_constraints_and_owner_integrity() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                graph = await seed_owner_graph(database, "constraints")
                owner = graph["owner"]
                target = graph["target"]
                career_profile = graph["profile"]
                source = graph["source"]
                assert isinstance(owner, User)
                assert isinstance(target, TargetRole)
                assert isinstance(career_profile, CareerProfile)
                assert isinstance(source, AgentRun)

                async with database.sessionmaker() as session:
                    session.add(
                        matching_analysis(
                            owner=owner,
                            target=target,
                            career_profile=career_profile,
                            source=source,
                        )
                    )
                    await session.commit()

                other = user(uuid4(), "other")
                other_target = role(owner.id)
                other_profile = profile(other.id)
                other_run = agent_run(other.id, "other-source")
                async with database.sessionmaker() as session:
                    session.add_all([other, other_target, other_profile, other_run])
                    await session.commit()

                await expect_integrity_error(
                    database,
                    matching_analysis(
                        owner=owner,
                        target=target,
                        career_profile=career_profile,
                        source=other_run,
                    ),
                )
                await expect_integrity_error(
                    database,
                    matching_analysis(
                        owner=owner,
                        target=other_target,
                        career_profile=career_profile,
                        source=source,
                    ),
                )
                await expect_integrity_error(
                    database,
                    matching_analysis(
                        owner=other,
                        target=target,
                        career_profile=other_profile,
                        source=other_run,
                    ),
                )
                await expect_integrity_error(
                    database,
                    matching_analysis(
                        owner=owner,
                        target=target,
                        career_profile=other_profile,
                        source=other_run,
                    ),
                )
                await expect_integrity_error(
                    database,
                    matching_analysis(
                        owner=owner,
                        target=other_target,
                        career_profile=career_profile,
                        source=other_run,
                        profile_id=uuid4(),
                    ),
                )

                for field, invalid_value in (
                    ("profile_version", 0),
                    ("job_description_version", 0),
                    ("job_description_analysis_version", 0),
                    ("overall_match_score", -1),
                    ("overall_match_score", 101),
                    ("core_requirements_summary", "   "),
                ):
                    await expect_integrity_error(
                        database,
                        matching_analysis(
                            owner=owner,
                            target=other_target,
                            career_profile=career_profile,
                            source=other_run,
                            **{field: invalid_value},
                        ),
                    )
            finally:
                await database.reset()

    asyncio.run(run())


def test_matching_analysis_delete_and_current_run_semantics() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                graph = await seed_owner_graph(database, "deletes")
                owner = graph["owner"]
                target = graph["target"]
                career_profile = graph["profile"]
                source = graph["source"]
                current_run = graph["current_run"]
                parsing_run = graph["parsing_run"]
                assert isinstance(owner, User)
                assert isinstance(target, TargetRole)
                assert isinstance(career_profile, CareerProfile)
                assert isinstance(source, AgentRun)
                assert isinstance(current_run, AgentRun)
                assert isinstance(parsing_run, AgentRun)

                async with database.sessionmaker() as session:
                    session.add(
                        matching_analysis(
                            owner=owner,
                            target=target,
                            career_profile=career_profile,
                            source=source,
                        )
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    await session.execute(
                        delete(AgentRun).where(AgentRun.id == current_run.id)
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    persisted_role = await session.scalar(
                        select(TargetRole).where(TargetRole.id == target.id)
                    )
                    assert persisted_role is not None
                    assert persisted_role.matching_analysis_run_id is None
                    assert persisted_role.job_description_parsing_run_id == parsing_run.id
                    assert await session.get(MatchingAnalysis, target.id) is not None

                async with database.sessionmaker() as session:
                    await session.execute(
                        delete(CareerProfile).where(
                            CareerProfile.profile_id == career_profile.profile_id
                        )
                    )
                    await session.commit()
                    assert await session.get(MatchingAnalysis, target.id) is None
                    assert await session.get(TargetRole, target.id) is not None

                replacement_profile = profile(owner.id)
                replacement_source = agent_run(owner.id, "deletes-replacement")
                async with database.sessionmaker() as session:
                    session.add_all([replacement_profile, replacement_source])
                    await session.flush()
                    replacement = matching_analysis(
                        owner=owner,
                        target=target,
                        career_profile=replacement_profile,
                        source=replacement_source,
                    )
                    session.add(replacement)
                    await session.commit()

                async with database.sessionmaker() as session:
                    await session.execute(
                        delete(TargetRole).where(TargetRole.id == target.id)
                    )
                    await session.commit()
                    assert await session.get(MatchingAnalysis, target.id) is None
                    assert await session.get(AgentRun, replacement_source.id) is not None

                cascade_graph = await seed_owner_graph(database, "user-delete")
                cascade_owner = cascade_graph["owner"]
                cascade_target = cascade_graph["target"]
                cascade_profile = cascade_graph["profile"]
                cascade_source = cascade_graph["source"]
                assert isinstance(cascade_owner, User)
                assert isinstance(cascade_target, TargetRole)
                assert isinstance(cascade_profile, CareerProfile)
                assert isinstance(cascade_source, AgentRun)
                async with database.sessionmaker() as session:
                    session.add(
                        matching_analysis(
                            owner=cascade_owner,
                            target=cascade_target,
                            career_profile=cascade_profile,
                            source=cascade_source,
                        )
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    await session.execute(
                        delete(User).where(User.id == cascade_owner.id)
                    )
                    await session.commit()
                    assert (
                        await session.scalar(
                            select(func.count())
                            .select_from(MatchingAnalysis)
                            .where(MatchingAnalysis.user_id == cascade_owner.id)
                        )
                        == 0
                    )
                    assert await session.get(TargetRole, cascade_target.id) is None
                    assert (
                        await session.get(
                            CareerProfile,
                            cascade_profile.profile_id,
                        )
                        is None
                    )
                    assert await session.get(AgentRun, cascade_source.id) is None
            finally:
                await database.reset()

    asyncio.run(run())


def test_database_reset_creates_matching_analysis_table() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                async with database.engine.connect() as connection:
                    table_names = await connection.run_sync(
                        lambda sync_connection: inspect(sync_connection).get_table_names()
                    )
                assert "matching_analyses" in table_names
            finally:
                await database.reset()

    asyncio.run(run())
