from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from riva.api.dependencies import (
    require_current_user,
    require_llm_provider,
    require_training_record_reference_answer_service,
    require_training_record_service,
    require_user_service,
)
from riva.models import User
from riva.schemas.training_records import (
    TargetedPracticeTrainingRecordDetailResponse,
    TrainingRecordReferenceAnswerResponse,
    TrainingRecordsOverviewResponse,
    TrainingRecordsPageResponse,
)
from riva.services.training.record_answers import (
    REFERENCE_ANSWER_GENERATION_UNAVAILABLE,
    TRAINING_RECORD_FOLLOW_UP_NOT_FOUND,
    TRAINING_RECORD_QUESTION_NOT_FOUND,
    TrainingRecordReferenceAnswerStateError,
)
from riva.services.training.record_answers import (
    TRAINING_RECORD_NOT_FOUND as REFERENCE_ANSWER_RECORD_NOT_FOUND,
)
from riva.services.training.record_answers import (
    TRAINING_RECORD_STATE_CONFLICT as REFERENCE_ANSWER_STATE_CONFLICT,
)
from riva.services.training.records import (
    TRAINING_RECORD_NOT_FOUND,
    TRAINING_RECORD_STATE_CONFLICT,
    TrainingRecordStateError,
)

RECORD_ID = UUID("11111111-1111-4111-8111-111111111111")
ATTEMPT_ID = UUID("22222222-2222-4222-8222-222222222222")
CARD_ID = UUID("33333333-3333-4333-8333-333333333333")
ROLE_ID = UUID("44444444-4444-4444-8444-444444444444")
NOW = datetime(2026, 8, 15, 8, 0, tzinfo=UTC)
TRUSTED_ORIGIN = "http://localhost:5173"


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


def overview_response() -> TrainingRecordsOverviewResponse:
    return TrainingRecordsOverviewResponse(
        total_record_count=1,
        completed_record_count=1,
        total_duration_seconds=600,
        answered_question_count=1,
        average_score=82.0,
        target_roles=[
            {
                "id": ROLE_ID,
                "title": "Backend Engineer",
                "company": "Riva",
            }
        ],
        by_kind={
            "targetedPractice": {
                "recordCount": 1,
                "completedRecordCount": 1,
                "averageScore": 82.0,
            },
            "mockInterview": {
                "recordCount": 0,
                "completedRecordCount": 0,
                "averageScore": None,
            },
        },
    )


def reference_answer_response(
    *,
    subject: str = "mainQuestion",
    follow_up_id: UUID | None = None,
) -> TrainingRecordReferenceAnswerResponse:
    target: dict[str, object] = {
        "kind": "targetedPractice",
        "recordId": str(RECORD_ID),
        "questionId": str(ATTEMPT_ID),
        "subject": subject,
    }
    if follow_up_id is not None:
        target["followUpId"] = str(follow_up_id)
    return TrainingRecordReferenceAnswerResponse.model_validate(
        {
            "target": target,
            "referenceAnswer": {"status": "unavailable"},
        }
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
        self.overview_result = overview_response()
        self.overview_calls: list[UUID] = []

    async def get_targeted_practice_record(self, *, user_id: UUID, record_id: UUID):
        self.calls.append((user_id, record_id))
        if self.error is not None:
            raise TrainingRecordStateError(self.error)  # type: ignore[arg-type]
        return self.result

    async def list_training_records(self, **kwargs: object):
        self.list_calls.append(kwargs)
        return self.list_result

    async def get_training_records_overview(self, *, user_id: UUID):
        self.overview_calls.append(user_id)
        return self.overview_result


class FakeTrainingRecordReferenceAnswerService:
    def __init__(
        self,
        *,
        result: TrainingRecordReferenceAnswerResponse | None = None,
        error: str | None = None,
    ) -> None:
        self.result = result or reference_answer_response()
        self.error = error
        self.request_calls: list[dict[str, object]] = []

    async def request_reference_answer(self, **kwargs: object):
        self.request_calls.append(kwargs)
        if self.error is not None:
            raise TrainingRecordReferenceAnswerStateError(self.error)  # type: ignore[arg-type]
        return self.result


def client_for(app, service: FakeTrainingRecordService) -> tuple[TestClient, User]:
    user = current_user()
    app.dependency_overrides[require_current_user] = lambda: user
    app.dependency_overrides[require_training_record_service] = lambda: service
    return TestClient(app), user


def reference_answer_client_for(
    app,
    service: FakeTrainingRecordReferenceAnswerService,
) -> tuple[TestClient, User]:
    user = current_user()
    app.dependency_overrides[require_current_user] = lambda: user
    app.dependency_overrides[require_llm_provider] = lambda: object()
    app.dependency_overrides[require_training_record_reference_answer_service] = (
        lambda: service
    )
    return TestClient(app), user


def test_get_targeted_practice_record_requires_authentication(app) -> None:
    app.dependency_overrides[require_user_service] = lambda: object()

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


def test_list_training_records_forwards_repeated_filters_and_camel_case_queries(
    app,
) -> None:
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


def test_get_training_records_overview_returns_camel_case_wire_contract(app) -> None:
    service = FakeTrainingRecordService()
    client, user = client_for(app, service)

    with client:
        response = client.get("/api/training-records/overview")

    assert response.status_code == 200
    assert response.json() == {
        "totalRecordCount": 1,
        "completedRecordCount": 1,
        "totalDurationSeconds": 600,
        "answeredQuestionCount": 1,
        "averageScore": 82.0,
        "targetRoles": [
            {
                "id": str(ROLE_ID),
                "title": "Backend Engineer",
                "company": "Riva",
            }
        ],
        "byKind": {
            "targetedPractice": {
                "recordCount": 1,
                "completedRecordCount": 1,
                "averageScore": 82.0,
            },
            "mockInterview": {
                "recordCount": 0,
                "completedRecordCount": 0,
                "averageScore": None,
            },
        },
    }
    assert service.overview_calls == [user.id]


def test_request_training_record_reference_answer_forwards_main_request(app) -> None:
    service = FakeTrainingRecordReferenceAnswerService()
    client, user = reference_answer_client_for(app, service)

    with client:
        response = client.post(
            f"/api/training-records/practice/{RECORD_ID}/reference-answer",
            json={
                "subject": "mainQuestion",
                "questionId": str(ATTEMPT_ID),
            },
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 200
    assert response.json()["target"] == {
        "kind": "targetedPractice",
        "recordId": str(RECORD_ID),
        "questionId": str(ATTEMPT_ID),
        "subject": "mainQuestion",
    }
    assert response.json()["referenceAnswer"]["status"] == "unavailable"
    assert len(service.request_calls) == 1
    assert service.request_calls[0]["user_id"] == user.id
    assert service.request_calls[0]["record_id"] == RECORD_ID
    payload = service.request_calls[0]["payload"]
    assert payload.model_dump(mode="json", by_alias=True) == {
        "subject": "mainQuestion",
        "questionId": str(ATTEMPT_ID),
    }


def test_training_record_reference_answer_routes_validate_body(app) -> None:
    service = FakeTrainingRecordReferenceAnswerService()
    client, _user = reference_answer_client_for(app, service)

    with client:
        response = client.post(
            f"/api/training-records/practice/{RECORD_ID}/reference-answer",
            json={"subject": "mainQuestion"},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 422
    assert service.request_calls == []


@pytest.mark.parametrize(
    ("error_code", "expected_status"),
    [
        (REFERENCE_ANSWER_RECORD_NOT_FOUND, 404),
        (TRAINING_RECORD_QUESTION_NOT_FOUND, 404),
        (TRAINING_RECORD_FOLLOW_UP_NOT_FOUND, 404),
        (REFERENCE_ANSWER_STATE_CONFLICT, 409),
        (REFERENCE_ANSWER_GENERATION_UNAVAILABLE, 503),
    ],
)
def test_training_record_reference_answer_routes_map_service_errors(
    app,
    error_code: str,
    expected_status: int,
) -> None:
    service = FakeTrainingRecordReferenceAnswerService(error=error_code)
    client, _user = reference_answer_client_for(app, service)

    with client:
        response = client.post(
            f"/api/training-records/practice/{RECORD_ID}/reference-answer",
            json={
                "subject": "mainQuestion",
                "questionId": str(ATTEMPT_ID),
            },
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == expected_status
    assert response.json() == {"error": error_code}
