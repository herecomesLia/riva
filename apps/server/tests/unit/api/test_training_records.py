from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from riva.core.auth import get_auth_service, require_current_user
from riva.core.training_records import get_training_record_service
from riva.models import User
from riva.schemas.training_records import (
    TargetedPracticeTrainingRecordDetailResponse,
    TrainingRecordsPageResponse,
)
from riva.services.training_records import (
    TRAINING_RECORD_NOT_FOUND,
    TRAINING_RECORD_STATE_CONFLICT,
    TrainingRecordStateError,
)


RECORD_ID = UUID("11111111-1111-4111-8111-111111111111")
ATTEMPT_ID = UUID("22222222-2222-4222-8222-222222222222")
CARD_ID = UUID("33333333-3333-4333-8333-333333333333")
ROLE_ID = UUID("44444444-4444-4444-8444-444444444444")
NOW = datetime(2026, 8, 15, 8, 0, tzinfo=UTC)


def current_user() -> User:
    return User(
        id=uuid4(),
        username="training-record-api",
        normalized_username="training-record-api",
        password_hash="hash",
        display_name="Training Record API",
    )


def record_response() -> TargetedPracticeTrainingRecordDetailResponse:
    return TargetedPracticeTrainingRecordDetailResponse.model_validate(
        {
            "recordId": str(RECORD_ID),
            "kind": "targetedPractice",
            "status": "completed",
            "language": "zh-CN",
            "startedAt": NOW.isoformat(),
            "endedAt": NOW.isoformat(),
            "durationSeconds": 0,
            "targetRole": {
                "id": str(ROLE_ID),
                "title": "Backend Engineer",
                "company": "Riva",
            },
            "setup": {
                "source": "personalized",
                "prioritizeWeaknesses": True,
            },
            "attempts": [
                {
                    "attemptId": str(ATTEMPT_ID),
                    "attemptNumber": 1,
                    "retryOfAttemptId": None,
                    "completedAt": NOW.isoformat(),
                    "question": {
                        "questionCardId": str(CARD_ID),
                        "prompt": "Describe a project you owned.",
                        "questionType": "projectDeepDive",
                        "difficulty": "basic",
                        "assessedCapabilities": ["Ownership"],
                        "isSaved": False,
                        "isMarkedWeak": False,
                        "referenceAnswer": {
                            "status": "notRequested",
                            "content": None,
                            "viewedBeforeSubmission": False,
                        },
                    },
                    "mainAnswer": None,
                    "followUps": [],
                    "evaluation": None,
                    "review": None,
                    "recommendation": None,
                }
            ],
            "exposedWeaknesses": [],
            "recommendation": None,
        }
    )


def page_response() -> TrainingRecordsPageResponse:
    return TrainingRecordsPageResponse(
        items=[],
        pagination={
            "page": 2,
            "pageSize": 10,
            "totalItems": 0,
            "totalPages": 0,
        },
    )


class FakeTrainingRecordService:
    def __init__(
        self,
        result=None,
        error: str | None = None,
        list_result: TrainingRecordsPageResponse | None = None,
    ) -> None:
        self.result = result or record_response()
        self.error = error
        self.calls: list[tuple[UUID, UUID]] = []
        self.list_result = list_result or page_response()
        self.list_calls: list[dict[str, object]] = []

    async def get_targeted_practice_record(self, *, user_id: UUID, record_id: UUID):
        self.calls.append((user_id, record_id))
        if self.error is not None:
            raise TrainingRecordStateError(self.error)  # type: ignore[arg-type]
        return self.result

    async def list_training_records(self, **kwargs: object):
        self.list_calls.append(kwargs)
        return self.list_result


def client_for(app, service: FakeTrainingRecordService) -> tuple[TestClient, User]:
    user = current_user()
    app.dependency_overrides[require_current_user] = lambda: user
    app.dependency_overrides[get_training_record_service] = lambda: service
    return TestClient(app), user


def test_get_targeted_practice_record_requires_authentication(app) -> None:
    app.dependency_overrides[get_auth_service] = lambda: object()

    with TestClient(app) as client:
        response = client.get(f"/api/training-records/practice/{RECORD_ID}")

    assert response.status_code == 401
    assert response.json() == {"error": "not_authenticated"}


def test_get_targeted_practice_record_forwards_uuid_and_returns_wire_model(app) -> None:
    service = FakeTrainingRecordService()
    client, user = client_for(app, service)

    with client:
        response = client.get(f"/api/training-records/practice/{RECORD_ID}")

    assert response.status_code == 200
    assert response.json()["recordId"] == str(RECORD_ID)
    assert service.calls == [(user.id, RECORD_ID)]


def test_get_targeted_practice_record_validates_record_id(app) -> None:
    service = FakeTrainingRecordService()
    client, _user = client_for(app, service)

    with client:
        response = client.get("/api/training-records/practice/not-a-uuid")

    assert response.status_code == 422
    assert service.calls == []


def test_get_targeted_practice_record_maps_not_found_without_leaking_state(app) -> None:
    service = FakeTrainingRecordService(error=TRAINING_RECORD_NOT_FOUND)
    client, _user = client_for(app, service)

    with client:
        response = client.get(f"/api/training-records/practice/{RECORD_ID}")

    assert response.status_code == 404
    assert response.json() == {"error": TRAINING_RECORD_NOT_FOUND}


def test_get_targeted_practice_record_maps_state_conflict(app) -> None:
    service = FakeTrainingRecordService(error=TRAINING_RECORD_STATE_CONFLICT)
    client, _user = client_for(app, service)

    with client:
        response = client.get(f"/api/training-records/practice/{RECORD_ID}")

    assert response.status_code == 409
    assert response.json() == {"error": TRAINING_RECORD_STATE_CONFLICT}


def test_get_targeted_practice_record_openapi_declares_response_model(app) -> None:
    with TestClient(app) as client:
        openapi = client.get("/openapi.json").json()

    operation = openapi["paths"]["/api/training-records/practice/{recordId}"]["get"]
    assert operation["parameters"][0]["name"] == "recordId"
    assert operation["responses"]["200"]["content"]["application/json"]["schema"][
        "$ref"
    ].endswith("TargetedPracticeTrainingRecordDetailResponse")


def test_list_training_records_forwards_repeated_filters_and_camel_case_queries(app) -> None:
    service = FakeTrainingRecordService()
    client, user = client_for(app, service)

    with client:
        response = client.get(
            "/api/training-records",
            params=[
                ("kinds", "targetedPractice"),
                ("kinds", "mockInterview"),
                ("statuses", "partiallyCompleted"),
                ("targetRoleId", str(ROLE_ID)),
                ("startedAtFrom", NOW.isoformat()),
                ("startedAtTo", NOW.isoformat()),
                ("page", "2"),
                ("pageSize", "10"),
            ],
        )

    assert response.status_code == 200
    assert response.json()["pagination"] == {
        "page": 2,
        "pageSize": 10,
        "totalItems": 0,
        "totalPages": 0,
    }
    assert service.list_calls == [
        {
            "user_id": user.id,
            "kinds": ["targetedPractice", "mockInterview"],
            "statuses": ["partiallyCompleted"],
            "target_role_id": ROLE_ID,
            "started_at_from": NOW,
            "started_at_to": NOW,
            "page": 2,
            "page_size": 10,
        }
    ]


def test_list_training_records_accepts_mock_interview_filter(app) -> None:
    service = FakeTrainingRecordService()
    client, _user = client_for(app, service)

    with client:
        response = client.get(
            "/api/training-records",
            params={"kinds": "mockInterview"},
        )

    assert response.status_code == 200
    assert service.list_calls[0]["kinds"] == ["mockInterview"]


def test_list_training_records_validates_page_size(app) -> None:
    service = FakeTrainingRecordService()
    client, _user = client_for(app, service)

    with client:
        response = client.get(
            "/api/training-records",
            params={"pageSize": 101},
        )

    assert response.status_code == 422
    assert service.list_calls == []
