import asyncio
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from riva.core.app import create_app
from riva.core.auth import require_current_user
from riva.db.database import Database
from riva.schemas.training_records import TrainingRecordKind, TrainingRecordStatus
from riva.services.training_records import TrainingRecordService
from tests.helpers.integration_database import get_integration_database_url
from tests.helpers.training_records import START, TRUSTED_ORIGIN, seed_records, settings


pytestmark = pytest.mark.integration


def test_training_record_list_filters_aggregates_and_paginates() -> None:
    async def run_test() -> None:
        url = get_integration_database_url()
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
        url = get_integration_database_url()
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
