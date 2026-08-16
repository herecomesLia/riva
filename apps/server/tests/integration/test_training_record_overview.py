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
)
from riva.schemas.training_records import TrainingRecordKind
from riva.services.training_records import TrainingRecordService
from tests.integration.test_question_generation import database_url, seed_context
from tests.integration.test_training_record_list import (
    START,
    TRUSTED_ORIGIN,
    add_record,
    seed_records,
    settings,
    succeeded_run,
)


pytestmark = pytest.mark.integration


def test_training_record_overview_without_training_records() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, _role, _profile, _project_id = await seed_context(database)
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
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, second_role, archived_role, _other_owner, ids = (
                    await seed_records(database)
                )
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
                assert overview.by_kind[TrainingRecordKind.TARGETED_PRACTICE].record_count == 7
                assert (
                    overview.by_kind[TrainingRecordKind.TARGETED_PRACTICE]
                    .completed_record_count
                    == 5
                )
                assert (
                    overview.by_kind[TrainingRecordKind.TARGETED_PRACTICE].average_score
                    == 77.5
                )
                assert overview.by_kind[TrainingRecordKind.MOCK_INTERVIEW].record_count == 0
                assert (
                    overview.by_kind[TrainingRecordKind.MOCK_INTERVIEW]
                    .completed_record_count
                    == 0
                )
                assert overview.by_kind[TrainingRecordKind.MOCK_INTERVIEW].average_score is None

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


def test_training_record_overview_averages_records_and_ignores_unscored_records() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, _project_id = await seed_context(database)
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
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, _profile, _project_id = await seed_context(database)
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
