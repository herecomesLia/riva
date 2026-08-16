import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.core.config import Settings
from riva.db.database import Database
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAnswer,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeReview,
    PracticeSession,
    TargetRole,
)
from riva.schemas.training_records import TrainingRecordKind, TrainingRecordStatus
from riva.services.training_records import TrainingRecordService
from tests.integration.test_question_generation import database_url, seed_context


pytestmark = pytest.mark.integration
TRUSTED_ORIGIN = "http://localhost:5173"
START = datetime(2026, 8, 10, 9, 0, tzinfo=UTC)


def settings(url: str) -> Settings:
    return Settings(
        database_url=url,
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="training-record-list-test-key",
        session_cookie_secure=False,
    )


def succeeded_run(user_id: UUID, *, agent_id: str) -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id=agent_id,
        prompt_id=f"{agent_id}-prompt",
        prompt_version="1",
        output_schema_id=f"{agent_id}-output",
        status=AgentRunStatus.SUCCEEDED,
        payload={},
        idempotency_key=f"{agent_id}-{uuid4()}",
        attempt_count=1,
        max_attempts=1,
        started_at=START,
        finished_at=START,
        provider="seed-provider",
        model="seed-model",
        input_tokens=1,
        output_tokens=1,
        result={"seeded": True},
    )


async def add_attempt(
    session,
    *,
    user_id: UUID,
    session_id: UUID,
    number: int,
    started_at: datetime,
    status: str,
    score: int | None = None,
    review_summary: str | None = None,
    answered: bool = False,
) -> PracticeAttempt:
    attempt = PracticeAttempt(
        id=uuid4(),
        user_id=user_id,
        session_id=session_id,
        attempt_number=number,
        question_type="behavioral",
        difficulty="basic",
        status=status,
        question_generation_run_id=None,
        question_card_id=None,
        retry_of_attempt_id=None,
        created_at=started_at,
        updated_at=started_at + timedelta(minutes=5),
        completed_at=(
            started_at + timedelta(minutes=5)
            if status in {"completed", "endedEarly"}
            else None
        ),
    )
    session.add(attempt)
    if answered:
        session.add(
            PracticeAnswer(
                id=uuid4(),
                attempt_id=attempt.id,
                kind="main",
                order=1,
                content=f"Answer {number}",
                follow_up_question_id=None,
                submitted_at=started_at + timedelta(minutes=1),
            )
        )
    if score is not None:
        evaluation_run = succeeded_run(user_id, agent_id="seed-evaluation")
        session.add(evaluation_run)
        session.add(
            PracticeEvaluation(
                id=uuid4(),
                attempt_id=attempt.id,
                source_agent_run_id=evaluation_run.id,
                overall_score=score,
                dimension_scores=[],
                focus_assessments=[],
                evaluated_at=started_at + timedelta(minutes=2),
            )
        )
    if review_summary is not None:
        review_run = succeeded_run(user_id, agent_id="seed-review")
        session.add(review_run)
        session.add(
            PracticeReview(
                id=uuid4(),
                attempt_id=attempt.id,
                source_agent_run_id=review_run.id,
                overall_performance=review_summary,
                highlights=[],
                main_issues=[],
                improvement_suggestions=[],
                reusable_answer_structure=[],
                exposed_weaknesses=[],
                reviewed_at=started_at + timedelta(minutes=3),
            )
        )
    return attempt


async def add_record(
    session,
    *,
    user_id: UUID,
    role_id: UUID,
    started_at: datetime,
    reason: str,
    status: str = "completed",
    attempt_specs: list[dict[str, object]],
    record_id: UUID | None = None,
) -> UUID:
    record_id = record_id or uuid4()
    practice_session = PracticeSession(
        id=record_id,
        user_id=user_id,
        target_role_id=role_id,
        language="en",
        version=1,
        status=status,
        initial_question_type="behavioral",
        initial_difficulty="basic",
        source="personalized",
        prioritize_weaknesses=False,
        started_at=started_at,
        completed_at=(started_at + timedelta(minutes=10) if status == "completed" else None),
        completion_reason=(reason if status == "completed" else None),
        created_at=started_at,
        updated_at=started_at + timedelta(minutes=10),
    )
    session.add(practice_session)
    for spec in attempt_specs:
        await add_attempt(
            session,
            user_id=user_id,
            session_id=record_id,
            number=int(spec["number"]),
            started_at=started_at,
            status=str(spec["status"]),
            score=spec.get("score"),  # type: ignore[arg-type]
            review_summary=spec.get("review_summary"),  # type: ignore[arg-type]
            answered=bool(spec.get("answered", False)),
        )
    return record_id


async def seed_records(database: Database):
    owner, role, _profile, _project_id = await seed_context(database)
    other_owner, other_role, _other_profile, _other_project_id = await seed_context(
        database
    )
    second_role = TargetRole(
        id=uuid4(),
        user_id=owner.id,
        title="Product Engineer",
        company="Riva Labs",
        recruitment_type="experienced",
        location="Shanghai",
        preparation_status="preparing",
        job_description_status="saved",
        raw_job_description="Build products.",
        job_description_version=1,
        version=1,
    )
    archived_role = TargetRole(
        id=uuid4(),
        user_id=owner.id,
        title="Archived Engineer",
        company="Old Riva",
        recruitment_type="experienced",
        location="Shanghai",
        preparation_status="archived",
        job_description_status="saved",
        raw_job_description="Maintain old systems.",
        job_description_version=1,
        version=1,
    )

    ids: dict[str, UUID] = {}
    async with database.sessionmaker() as session:
        session.add_all([second_role, archived_role])
        ids["completed"] = await add_record(
            session,
            user_id=owner.id,
            role_id=role.id,
            started_at=START + timedelta(hours=1),
            reason="reviewCompleted",
            attempt_specs=[
                {
                    "number": 1,
                    "status": "completed",
                    "score": 80,
                    "review_summary": "First review.",
                    "answered": True,
                },
                {
                    "number": 2,
                    "status": "completed",
                    "score": 90,
                    "review_summary": "Last review.",
                    "answered": True,
                },
            ],
        )
        ids["partial"] = await add_record(
            session,
            user_id=owner.id,
            role_id=role.id,
            started_at=START + timedelta(hours=2),
            reason="userEndedEarly",
            attempt_specs=[
                {
                    "number": 1,
                    "status": "completed",
                    "score": 70,
                    "review_summary": "Partial review.",
                    "answered": True,
                },
                {"number": 2, "status": "endedEarly"},
            ],
        )
        ids["ended"] = await add_record(
            session,
            user_id=owner.id,
            role_id=role.id,
            started_at=START + timedelta(hours=3),
            reason="userEndedEarly",
            attempt_specs=[{"number": 1, "status": "endedEarly"}],
        )
        ids["no_score"] = await add_record(
            session,
            user_id=owner.id,
            role_id=role.id,
            started_at=START + timedelta(hours=4),
            reason="reviewCompleted",
            attempt_specs=[
                {"number": 1, "status": "completed", "answered": True}
            ],
        )
        ids["archived"] = await add_record(
            session,
            user_id=owner.id,
            role_id=archived_role.id,
            started_at=START + timedelta(hours=5),
            reason="reviewCompleted",
            attempt_specs=[{"number": 1, "status": "completed"}],
        )
        ids["tie_low"] = await add_record(
            session,
            user_id=owner.id,
            role_id=second_role.id,
            started_at=START + timedelta(hours=6),
            reason="reviewCompleted",
            record_id=UUID("00000000-0000-4000-8000-000000000010"),
            attempt_specs=[{"number": 1, "status": "completed"}],
        )
        ids["tie_high"] = await add_record(
            session,
            user_id=owner.id,
            role_id=second_role.id,
            started_at=START + timedelta(hours=6),
            reason="reviewCompleted",
            record_id=UUID("00000000-0000-4000-8000-000000000020"),
            attempt_specs=[{"number": 1, "status": "completed"}],
        )
        await add_record(
            session,
            user_id=owner.id,
            role_id=role.id,
            started_at=START + timedelta(hours=7),
            reason="reviewCompleted",
            status="active",
            attempt_specs=[{"number": 1, "status": "answering"}],
        )
        ids["other"] = await add_record(
            session,
            user_id=other_owner.id,
            role_id=other_role.id,
            started_at=START + timedelta(hours=8),
            reason="reviewCompleted",
            attempt_specs=[{"number": 1, "status": "completed"}],
        )
        await session.commit()
    return owner, role, second_role, archived_role, other_owner, ids


def test_training_record_list_filters_aggregates_and_paginates() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, role, second_role, archived_role, _other_owner, ids = (
                    await seed_records(database)
                )
                async with database.sessionmaker() as session:
                    service = TrainingRecordService(session)
                    page = await service.list_training_records(
                        user_id=owner.id,
                        page=1,
                        page_size=20,
                    )
                    assert [item.record_id for item in page.items] == [
                        ids["tie_high"],
                        ids["tie_low"],
                        ids["archived"],
                        ids["no_score"],
                        ids["ended"],
                        ids["partial"],
                        ids["completed"],
                    ]
                    assert page.pagination.total_items == 7
                    assert page.pagination.total_pages == 1

                    completed = next(
                        item for item in page.items if item.record_id == ids["completed"]
                    )
                    assert completed.status == TrainingRecordStatus.COMPLETED
                    assert completed.answered_question_count == 2
                    assert completed.total_question_count == 2
                    assert completed.overall_score == 85.0
                    assert completed.review_summary == "Last review."
                    assert completed.question_type == "behavioral"
                    assert completed.difficulty == "basic"
                    assert completed.duration_seconds == 600

                    partial = next(
                        item for item in page.items if item.record_id == ids["partial"]
                    )
                    assert partial.status == TrainingRecordStatus.PARTIALLY_COMPLETED
                    assert partial.answered_question_count == 1
                    assert partial.total_question_count == 2
                    assert partial.overall_score == 70.0
                    assert partial.review_summary == "Partial review."

                    ended = next(
                        item for item in page.items if item.record_id == ids["ended"]
                    )
                    assert ended.status == TrainingRecordStatus.ENDED_EARLY
                    assert ended.answered_question_count == 0
                    assert ended.overall_score is None
                    assert ended.review_summary is None

                    no_score = next(
                        item for item in page.items if item.record_id == ids["no_score"]
                    )
                    assert no_score.overall_score is None
                    assert no_score.review_summary is None

                    status_page = await service.list_training_records(
                        user_id=owner.id,
                        statuses=[TrainingRecordStatus.PARTIALLY_COMPLETED],
                    )
                    assert [item.record_id for item in status_page.items] == [
                        ids["partial"]
                    ]

                    role_page = await service.list_training_records(
                        user_id=owner.id,
                        target_role_id=second_role.id,
                    )
                    assert [item.record_id for item in role_page.items] == [
                        ids["tie_high"],
                        ids["tie_low"],
                    ]

                    boundary_page = await service.list_training_records(
                        user_id=owner.id,
                        started_at_from=START + timedelta(hours=2),
                        started_at_to=START + timedelta(hours=2),
                    )
                    assert [item.record_id for item in boundary_page.items] == [
                        ids["partial"]
                    ]

                    archived_page = await service.list_training_records(
                        user_id=owner.id,
                        target_role_id=archived_role.id,
                    )
                    assert [item.record_id for item in archived_page.items] == [
                        ids["archived"]
                    ]

                    first_page = await service.list_training_records(
                        user_id=owner.id,
                        page=1,
                        page_size=2,
                    )
                    assert [item.record_id for item in first_page.items] == [
                        ids["tie_high"],
                        ids["tie_low"],
                    ]
                    assert first_page.pagination.total_items == 7
                    assert first_page.pagination.total_pages == 4

                    mock_only = await service.list_training_records(
                        user_id=owner.id,
                        kinds=[TrainingRecordKind.MOCK_INTERVIEW],
                    )
                    assert mock_only.items == []
                    assert mock_only.pagination.total_items == 0

                    both_kinds = await service.list_training_records(
                        user_id=owner.id,
                        kinds=[
                            TrainingRecordKind.TARGETED_PRACTICE,
                            TrainingRecordKind.MOCK_INTERVIEW,
                        ],
                    )
                    assert both_kinds.pagination.total_items == 7
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_training_record_list_api_projects_targeted_practice_page() -> None:
    async def run_test() -> None:
        url = database_url()
        async with Database(url) as database:
            await database.reset()
            try:
                owner, _role, _second_role, _archived_role, _other, ids = (
                    await seed_records(database)
                )
                app = create_app(settings(url))
                app.dependency_overrides[require_current_user] = lambda: owner
                with TestClient(app) as client:
                    response = client.get(
                        "/api/training-records",
                        params=[
                            ("kinds", "targetedPractice"),
                            ("kinds", "mockInterview"),
                            ("statuses", "completed"),
                            ("page", "1"),
                            ("pageSize", "2"),
                        ],
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                    mock_only = client.get(
                        "/api/training-records",
                        params={"kinds": "mockInterview"},
                        headers={"Origin": TRUSTED_ORIGIN},
                    )
                assert response.status_code == 200
                body = response.json()
                assert [item["recordId"] for item in body["items"]] == [
                    str(ids["tie_high"]),
                    str(ids["tie_low"]),
                ]
                assert body["pagination"] == {
                    "page": 1,
                    "pageSize": 2,
                    "totalItems": 5,
                    "totalPages": 3,
                }
                assert mock_only.status_code == 200
                assert mock_only.json() == {
                    "items": [],
                    "pagination": {
                        "page": 1,
                        "pageSize": 20,
                        "totalItems": 0,
                        "totalPages": 0,
                    },
                }
            finally:
                await database.reset()

    asyncio.run(run_test())
