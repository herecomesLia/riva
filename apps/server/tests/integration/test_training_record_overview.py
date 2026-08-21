import asyncio
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.db.database import Database
from riva.models import (
    PracticeAnswer,
    PracticeAttempt,
    PracticeFollowUpQuestion,
    PracticeSession,
    TargetRole,
)
from riva.schemas.training_records import TrainingRecordKind
from riva.services.training_records import TrainingRecordService
from tests.helpers.integration_database import get_integration_database_url
from tests.helpers.training_records import (
    START,
    TRUSTED_ORIGIN,
    add_attempt,
    add_record,
    seed_records,
    seed_training_record_context,
    settings,
    succeeded_run,
)

pytestmark = pytest.mark.integration


def test_training_record_overview_without_training_records() -> None:
    async def run_test() -> None:
        url = get_integration_database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, _role = await seed_training_record_context(database)
                async with database.sessionmaker() as session:
                    overview = await TrainingRecordService(
                        session
                    ).get_training_records_overview(user_id=owner.id)

                assert overview.total_record_count == 0
                assert overview.completed_record_count == 0
                assert overview.total_duration_seconds == 0
                assert overview.answered_question_count == 0
                assert overview.average_score is None
                assert overview.target_roles == []
                for kind in TrainingRecordKind:
                    assert overview.by_kind[kind].record_count == 0
                    assert overview.by_kind[kind].completed_record_count == 0
                    assert overview.by_kind[kind].average_score is None
            finally:
                await database.reset()

    asyncio.run(run_test())


async def _add_follow_up_answer_to_completed_attempt(
    database: Database,
    *,
    user_id: UUID,
    record_id: UUID,
) -> None:
    async with database.sessionmaker() as session:
        attempt = await session.scalar(
            select(PracticeAttempt).where(
                PracticeAttempt.user_id == user_id,
                PracticeAttempt.session_id == record_id,
                PracticeAttempt.attempt_number == 1,
            )
        )
        assert attempt is not None
        source_run = succeeded_run(user_id, agent_id="seed-follow-up")
        follow_up = PracticeFollowUpQuestion(
            id=uuid4(),
            attempt_id=attempt.id,
            source_agent_run_id=source_run.id,
            order=1,
            prompt="Explain the trade-off.",
            focus="Trade-off",
            answer_hints=[],
            answer_framework=[],
            answer_hints_revealed=False,
            answer_framework_revealed=False,
            created_at=START + timedelta(minutes=2),
        )
        session.add(source_run)
        session.add(follow_up)
        session.add(
            PracticeAnswer(
                id=uuid4(),
                attempt_id=attempt.id,
                kind="followUp",
                order=2,
                content="The trade-off was deliberate scope reduction.",
                follow_up_question_id=follow_up.id,
                submitted_at=START + timedelta(minutes=3),
            )
        )
        await session.commit()


def test_training_record_overview_aggregates_eligible_records_and_is_scoped() -> None:
    async def run_test() -> None:
        url = get_integration_database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                (
                    owner,
                    role,
                    second_role,
                    archived_role,
                    _other_owner,
                    ids,
                ) = await seed_records(database)
                unused_role = TargetRole(
                    id=uuid4(),
                    user_id=owner.id,
                    title="Unstarted Engineer",
                    company="No History Co",
                    recruitment_type="experienced",
                    location="Shanghai",
                    preparation_status="preparing",
                    job_description_status="saved",
                    raw_job_description="This role has no training record.",
                    job_description_version=1,
                    version=1,
                )
                async with database.sessionmaker() as session:
                    session.add(unused_role)
                    await session.commit()
                await _add_follow_up_answer_to_completed_attempt(
                    database,
                    user_id=owner.id,
                    record_id=ids["completed"],
                )

                async with database.sessionmaker() as session:
                    overview = await TrainingRecordService(
                        session
                    ).get_training_records_overview(user_id=owner.id)

                # Seven completed sessions are eligible; the owner's active session
                # and the other user's completed session are excluded.
                assert overview.total_record_count == 7
                assert overview.completed_record_count == 5
                assert overview.total_duration_seconds == 7 * 600
                # The extra follow-up answer above must not increase this count.
                assert overview.answered_question_count == 4
                # Record averages are 85 and 70, so this is 77.5 rather than the
                # attempt-weighted (80 + 90 + 70) / 3 == 80.
                assert overview.average_score == 77.5
                assert [role.title for role in overview.target_roles] == [
                    "Archived Engineer",
                    "Backend Engineer",
                    "Product Engineer",
                ]
                assert [role.id for role in overview.target_roles] == [
                    archived_role.id,
                    role.id,
                    second_role.id,
                ]
                assert len(overview.target_roles) == 3
                assert unused_role.id not in {
                    target_role.id for target_role in overview.target_roles
                }
                assert (
                    overview.by_kind[TrainingRecordKind.TARGETED_PRACTICE].record_count
                    == 7
                )
                assert (
                    overview.by_kind[
                        TrainingRecordKind.TARGETED_PRACTICE
                    ].completed_record_count
                    == 5
                )
                assert (
                    overview.by_kind[TrainingRecordKind.TARGETED_PRACTICE].average_score
                    == 77.5
                )
                assert (
                    overview.by_kind[TrainingRecordKind.MOCK_INTERVIEW].record_count
                    == 0
                )
                assert (
                    overview.by_kind[
                        TrainingRecordKind.MOCK_INTERVIEW
                    ].completed_record_count
                    == 0
                )
                assert (
                    overview.by_kind[TrainingRecordKind.MOCK_INTERVIEW].average_score
                    is None
                )

                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner
                with TestClient(app) as client:
                    response = client.get(
                        "/api/training-records/overview",
                        headers={"Origin": TRUSTED_ORIGIN},
                    )

                assert response.status_code == 200
                assert response.json() == {
                    "totalRecordCount": 7,
                    "completedRecordCount": 5,
                    "totalDurationSeconds": 4200,
                    "answeredQuestionCount": 4,
                    "averageScore": 77.5,
                    "targetRoles": [
                        {
                            "id": str(archived_role.id),
                            "title": "Archived Engineer",
                            "company": "Old Riva",
                        },
                        {
                            "id": str(role.id),
                            "title": "Backend Engineer",
                            "company": "Riva",
                        },
                        {
                            "id": str(second_role.id),
                            "title": "Product Engineer",
                            "company": "Riva Labs",
                        },
                    ],
                    "byKind": {
                        "targetedPractice": {
                            "recordCount": 7,
                            "completedRecordCount": 5,
                            "averageScore": 77.5,
                        },
                        "mockInterview": {
                            "recordCount": 0,
                            "completedRecordCount": 0,
                            "averageScore": None,
                        },
                    },
                }
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_training_record_overview_averages_records_and_ignores_unscored_records() -> (
    None
):
    async def run_test() -> None:
        url = get_integration_database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role = await seed_training_record_context(database)
                async with database.sessionmaker() as session:
                    await add_record(
                        session,
                        user_id=owner.id,
                        role_id=role.id,
                        started_at=START,
                        reason="reviewCompleted",
                        attempt_specs=[
                            {"number": 1, "status": "completed", "score": 80},
                            {"number": 2, "status": "completed", "score": 100},
                        ],
                    )
                    await add_record(
                        session,
                        user_id=owner.id,
                        role_id=role.id,
                        started_at=START + timedelta(hours=1),
                        reason="reviewCompleted",
                        attempt_specs=[
                            {"number": 1, "status": "completed", "score": 60}
                        ],
                    )
                    await add_record(
                        session,
                        user_id=owner.id,
                        role_id=role.id,
                        started_at=START + timedelta(hours=2),
                        reason="reviewCompleted",
                        attempt_specs=[{"number": 1, "status": "completed"}],
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    overview = await TrainingRecordService(
                        session
                    ).get_training_records_overview(user_id=owner.id)

                assert overview.total_record_count == 3
                assert overview.completed_record_count == 3
                assert overview.average_score == 75.0
                assert overview.average_score != 80.0
                assert (
                    overview.by_kind[TrainingRecordKind.TARGETED_PRACTICE].average_score
                    == 75.0
                )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_training_record_overview_with_only_unscored_record_has_null_average() -> None:
    async def run_test() -> None:
        url = get_integration_database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role = await seed_training_record_context(database)
                async with database.sessionmaker() as session:
                    await add_record(
                        session,
                        user_id=owner.id,
                        role_id=role.id,
                        started_at=START,
                        reason="reviewCompleted",
                        attempt_specs=[
                            {"number": 1, "status": "completed", "answered": True}
                        ],
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    overview = await TrainingRecordService(
                        session
                    ).get_training_records_overview(user_id=owner.id)

                assert overview.total_record_count == 1
                assert overview.completed_record_count == 1
                assert overview.average_score is None
                assert (
                    overview.by_kind[TrainingRecordKind.TARGETED_PRACTICE].average_score
                    is None
                )
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_training_record_overview_duration_matches_list_for_fractional_seconds() -> (
    None
):
    async def run_test() -> None:
        url = get_integration_database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role = await seed_training_record_context(database)
                record_id = uuid4()
                started_at = START
                ended_at = START + timedelta(seconds=10, microseconds=900_000)
                async with database.sessionmaker() as session:
                    session.add(
                        PracticeSession(
                            id=record_id,
                            user_id=owner.id,
                            target_role_id=role.id,
                            language="en",
                            version=1,
                            status="completed",
                            initial_question_type="behavioral",
                            initial_difficulty="basic",
                            source="personalized",
                            prioritize_weaknesses=False,
                            started_at=started_at,
                            completed_at=ended_at,
                            completion_reason="reviewCompleted",
                            created_at=started_at,
                            updated_at=ended_at,
                        )
                    )
                    attempt = await add_attempt(
                        session,
                        user_id=owner.id,
                        session_id=record_id,
                        number=1,
                        started_at=started_at,
                        status="completed",
                        answered=True,
                    )
                    attempt.completed_at = START + timedelta(seconds=5)
                    await session.commit()

                async with database.sessionmaker() as session:
                    service = TrainingRecordService(session)
                    page = await service.list_training_records(
                        user_id=owner.id,
                        target_role_id=role.id,
                    )
                    overview = await service.get_training_records_overview(
                        user_id=owner.id
                    )

                assert len(page.items) == 1
                assert page.items[0].record_id == record_id
                assert page.items[0].duration_seconds == 10
                assert overview.total_duration_seconds == 10
                assert overview.total_duration_seconds == sum(
                    item.duration_seconds for item in page.items
                )
            finally:
                await database.reset()

    asyncio.run(run_test())
