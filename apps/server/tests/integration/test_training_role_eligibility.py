import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from riva.db.database import Database
from riva.models import (
    MatchingAnalysis,
    PracticeAttempt,
    PracticeReview,
    PracticeSession,
    TargetRole,
)
from riva.services.interview_api import build_interview_setup_response
from riva.services.interview_sessions import InterviewSessionService
from riva.services.practice_api import PracticeAPIService
from tests.helpers.interview import (
    create_career_profile,
    create_jd_ready_role,
    create_user,
)
from tests.integration.test_question_generation import database_url


pytestmark = pytest.mark.integration
NOW = datetime(2026, 8, 21, 10, 0, tzinfo=UTC)


async def seed_ready_user(
    database: Database,
    *,
    label: str,
    profile_complete: bool = True,
    with_weakness: bool = False,
) -> tuple[UUID, UUID]:
    user = create_user(label)
    profile = create_career_profile(
        user.id,
        include_education=profile_complete,
        include_work_experience=profile_complete,
        include_project_experience=profile_complete,
        include_skill=profile_complete,
    )
    role, parsing_run, analysis = create_jd_ready_role(user.id)
    records: list[object] = [user, profile, role, parsing_run, analysis]

    if with_weakness:
        practice_session = PracticeSession(
            id=uuid4(),
            user_id=user.id,
            target_role_id=role.id,
            language="en",
            version=1,
            status="completed",
            initial_question_type="projectDeepDive",
            initial_difficulty="basic",
            source="personalized",
            prioritize_weaknesses=False,
            started_at=NOW,
            completed_at=NOW,
            completion_reason="reviewCompleted",
        )
        attempt = PracticeAttempt(
            id=uuid4(),
            user_id=user.id,
            session_id=practice_session.id,
            attempt_number=1,
            question_type="projectDeepDive",
            difficulty="basic",
            status="completed",
            completed_at=NOW,
        )
        review = PracticeReview(
            id=uuid4(),
            attempt_id=attempt.id,
            source_agent_run_id=parsing_run.id,
            overall_performance="The answer needs clearer evidence.",
            highlights=[],
            main_issues=["Evidence is too general."],
            improvement_suggestions=["Add measurable outcomes."],
            reusable_answer_structure=[],
            exposed_weaknesses=["Quantified impact"],
            reviewed_at=NOW,
        )
        records.extend([practice_session, attempt, review])

    async with database.sessionmaker() as session:
        session.add_all(records)
        await session.commit()
    return user.id, role.id


async def seed_user_without_role(database: Database) -> UUID:
    user = create_user("training-no-role")
    profile = create_career_profile(user.id)
    async with database.sessionmaker() as session:
        session.add_all([user, profile])
        await session.commit()
    return user.id


async def seed_user_with_pending_jd(database: Database) -> UUID:
    user = create_user("training-pending-jd")
    profile = create_career_profile(user.id)
    role = TargetRole(
        id=uuid4(),
        user_id=user.id,
        title="Backend Engineer",
        company="Riva",
        recruitment_type="experienced",
        location="Shanghai",
        preparation_status="preparing",
        job_description_status="missing",
        raw_job_description=None,
        job_description_version=None,
        version=1,
    )
    async with database.sessionmaker() as session:
        session.add_all([user, profile, role])
        await session.commit()
    return user.id


async def load_setup(database: Database, user_id: UUID):
    async with database.sessionmaker() as session:
        interview_context = await InterviewSessionService(session).get_setup(
            user_id=user_id
        )
        interview = build_interview_setup_response(interview_context)
        practice = await PracticeAPIService(session).get_setup_capabilities(
            user_id=user_id,
            interaction_language="en",
        )
        matching_count = int(
            await session.scalar(
                select(func.count(MatchingAnalysis.role_id)).where(
                    MatchingAnalysis.user_id == user_id
                )
            )
            or 0
        )
    return interview, practice, matching_count


def run_database_test(test: Callable[[Database], Awaitable[None]]) -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                await test(database)
            finally:
                await database.reset()

    asyncio.run(run())


def test_ready_role_without_matching_or_history_is_available_for_both_setups() -> None:
    async def test(database: Database) -> None:
        user_id, role_id = await seed_ready_user(database, label="training-ready")

        interview, practice, matching_count = await load_setup(database, user_id)

        assert interview.availability.status == "available"
        assert [role.id for role in interview.target_roles] == [role_id]
        assert practice.availability.status == "available"
        assert practice.training_available_target_role_ids == [role_id]
        assert practice.can_prioritize_weaknesses is False
        assert matching_count == 0

    run_database_test(test)


def test_missing_target_role_blocks_both_setups() -> None:
    async def test(database: Database) -> None:
        user_id = await seed_user_without_role(database)

        interview, practice, _ = await load_setup(database, user_id)

        assert interview.availability.status == "blocked"
        assert interview.availability.reason == "noTargetRoles"
        assert practice.availability.status == "blocked"
        assert practice.availability.reason == "noTargetRoles"

    run_database_test(test)


def test_target_role_with_pending_jd_blocks_both_setups() -> None:
    async def test(database: Database) -> None:
        user_id = await seed_user_with_pending_jd(database)

        interview, practice, _ = await load_setup(database, user_id)

        assert interview.availability.status == "blocked"
        assert interview.availability.reason == "jobDescriptionMissing"
        assert practice.availability.status == "blocked"
        assert practice.availability.reason == "jobDescriptionMissing"

    run_database_test(test)


def test_incomplete_profile_preserves_interview_context_but_blocks_both_setups() -> None:
    async def test(database: Database) -> None:
        user_id, role_id = await seed_ready_user(
            database,
            label="training-incomplete-profile",
            profile_complete=False,
        )

        interview, practice, _ = await load_setup(database, user_id)

        assert interview.availability.status == "blocked"
        assert interview.availability.reason == "profileIncomplete"
        assert [role.id for role in interview.target_roles] == [role_id]
        assert practice.availability.status == "blocked"
        assert practice.availability.reason == "profileIncomplete"
        assert practice.training_available_target_role_ids == []

    run_database_test(test)


def test_existing_weakness_only_enables_the_weakness_capability() -> None:
    async def test(database: Database) -> None:
        user_id, role_id = await seed_ready_user(
            database,
            label="training-weakness",
            with_weakness=True,
        )

        interview, practice, matching_count = await load_setup(database, user_id)

        assert interview.availability.status == "available"
        assert practice.availability.status == "available"
        assert practice.training_available_target_role_ids == [role_id]
        assert practice.can_prioritize_weaknesses is True
        assert matching_count == 0

    run_database_test(test)
