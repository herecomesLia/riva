from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import status
from fastapi.testclient import TestClient
import pytest

from riva.core.auth import get_auth_service, require_current_user
from riva.core.training_planning import get_training_planning_service
from riva.core.errors import APIError
from riva.models import User
from riva.schemas.training_planning import (
    StartTrainingPlanningRequest,
    TrainingPlanningStatusResponse,
    TrainingPlanningTargetedPracticeOutput,
)
from riva.services.training_planning import (
    TRAINING_PLANNING_REQUEST_CONFLICT,
    TRAINING_PLANNING_STATE_CONFLICT,
    TrainingPlanningStateError,
)


TRUSTED_ORIGIN = "http://localhost:5173"
RUN_ID = UUID("11111111-1111-4111-8111-111111111111")
ROLE_ID = UUID("22222222-2222-4222-8222-222222222222")
NOW = datetime(2026, 8, 18, 10, 0, tzinfo=UTC)


def user() -> User:
    return User(
        id=uuid4(),
        username="training-planner-api",
        normalized_username="training-planner-api",
        password_hash="hash",
        display_name="Training Planner API",
    )


def status_response(
    state: str,
    *,
    plan: TrainingPlanningTargetedPracticeOutput | None = None,
) -> TrainingPlanningStatusResponse:
    return TrainingPlanningStatusResponse(
        runId=RUN_ID,
        status=state,
        targetRoleId=ROLE_ID,
        interactionLanguage="en",
        attemptCount=1 if state != "queued" else 0,
        maxAttempts=3,
        errorCode="provider_unavailable" if state == "failed" else None,
        failureReason=(
            "The training plan could not be generated right now. Please try again."
            if state == "failed"
            else None
        ),
        createdAt=NOW,
        startedAt=None if state == "queued" else NOW,
        finishedAt=NOW if state in {"succeeded", "failed"} else None,
        plan=plan,
    )


class FakeTrainingPlanningService:
    def __init__(
        self,
        *,
        start_result: TrainingPlanningStatusResponse | None = None,
        status_result: TrainingPlanningStatusResponse | None = None,
        error: TrainingPlanningStateError | APIError | None = None,
    ) -> None:
        self.start_result = start_result or status_response("queued")
        self.status_result = status_result or status_response("queued")
        self.error = error
        self.calls: list[tuple[str, object]] = []

    async def start_planning(
        self,
        current_user: User,
        payload: StartTrainingPlanningRequest,
        *,
        interaction_language: str,
    ) -> TrainingPlanningStatusResponse:
        self.calls.append(
            ("start", (current_user, payload, interaction_language))
        )
        if isinstance(self.error, TrainingPlanningStateError):
            raise self.error
        if isinstance(self.error, APIError):
            raise self.error
        return self.start_result

    async def get_planning_status(
        self,
        *,
        user_id: UUID,
        run_id: UUID,
    ) -> TrainingPlanningStatusResponse:
        self.calls.append(("status", (user_id, run_id)))
        if isinstance(self.error, TrainingPlanningStateError):
            raise self.error
        if isinstance(self.error, APIError):
            raise self.error
        return self.status_result


def create_client(app, service: FakeTrainingPlanningService) -> tuple[TestClient, User]:
    current_user = user()
    app.dependency_overrides[require_current_user] = lambda: current_user
    app.dependency_overrides[get_training_planning_service] = lambda: service
    return TestClient(app), current_user


def request_payload() -> dict[str, str]:
    return {"requestId": str(uuid4()), "targetRoleId": str(ROLE_ID)}


def test_training_planning_endpoints_require_authentication(app) -> None:
    service = FakeTrainingPlanningService()
    app.dependency_overrides[get_training_planning_service] = lambda: service
    app.dependency_overrides[get_auth_service] = lambda: object()

    with TestClient(app) as client:
        post = client.post(
            "/api/training-plans",
            json=request_payload(),
            headers={"Origin": TRUSTED_ORIGIN},
        )
        get = client.get(f"/api/training-plans/{RUN_ID}")

    assert post.status_code == status.HTTP_401_UNAUTHORIZED
    assert post.json() == {"error": "not_authenticated"}
    assert get.status_code == status.HTTP_401_UNAUTHORIZED
    assert service.calls == []


@pytest.mark.parametrize(
    ("header", "expected_language"),
    [("zh-CN", "zh-CN"), ("en-US", "en")],
)
def test_start_returns_202_and_uses_accept_language(
    app,
    header: str,
    expected_language: str,
) -> None:
    service = FakeTrainingPlanningService()
    client, current_user = create_client(app, service)

    with client:
        response = client.post(
            "/api/training-plans",
            json=request_payload(),
            headers={"Origin": TRUSTED_ORIGIN, "Accept-Language": header},
        )

    assert response.status_code == status.HTTP_202_ACCEPTED
    assert response.json()["status"] == "queued"
    assert response.json()["runId"] == str(RUN_ID)
    call_user, payload, language = service.calls[0][1]
    assert call_user is current_user
    assert payload.target_role_id == ROLE_ID
    assert language == expected_language


def test_request_body_cannot_override_language(app) -> None:
    service = FakeTrainingPlanningService()
    client, _current_user = create_client(app, service)

    with client:
        response = client.post(
            "/api/training-plans",
            json={**request_payload(), "interactionLanguage": "en"},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert service.calls == []


def test_post_is_csrf_protected_but_get_status_is_not(app) -> None:
    service = FakeTrainingPlanningService()
    client, _current_user = create_client(app, service)

    with client:
        post = client.post("/api/training-plans", json=request_payload())
        get = client.get(f"/api/training-plans/{RUN_ID}")

    assert post.status_code == status.HTTP_403_FORBIDDEN
    assert get.status_code == status.HTTP_200_OK
    assert [call[0] for call in service.calls] == ["status"]


def test_status_returns_camel_case_and_plan(app) -> None:
    plan = TrainingPlanningTargetedPracticeOutput(
        action="targetedPractice",
        reason="Practice the current gap.",
        focusAreas=["project results"],
        questionType="projectDeepDive",
        difficulty="basic",
        prioritizeWeaknesses=False,
    )
    service = FakeTrainingPlanningService(
        status_result=status_response("succeeded", plan=plan)
    )
    client, current_user = create_client(app, service)

    with client:
        response = client.get(f"/api/training-plans/{RUN_ID}")

    assert response.status_code == 200
    body = response.json()
    assert body["targetRoleId"] == str(ROLE_ID)
    assert body["interactionLanguage"] == "en"
    assert body["plan"]["questionType"] == "projectDeepDive"
    assert service.calls == [("status", (current_user.id, RUN_ID))]


@pytest.mark.parametrize(
    ("code", "expected_status", "expected_error"),
    [
        (
            "training_planning_target_not_found",
            404,
            "training_planning_target_not_found",
        ),
        ("training_planning_not_found", 404, "training_planning_not_found"),
        (
            "training_planning_target_unavailable",
            409,
            "training_planning_target_unavailable",
        ),
        (TRAINING_PLANNING_REQUEST_CONFLICT, 409, TRAINING_PLANNING_REQUEST_CONFLICT),
        (TRAINING_PLANNING_STATE_CONFLICT, 409, TRAINING_PLANNING_STATE_CONFLICT),
        ("training_planning_unavailable", 503, "training_planning_unavailable"),
        ("training_planning_snapshot_invalid", 409, TRAINING_PLANNING_STATE_CONFLICT),
    ],
)
def test_state_errors_use_the_public_error_contract(
    app,
    code: str,
    expected_status: int,
    expected_error: str,
) -> None:
    service = FakeTrainingPlanningService(
        error=TrainingPlanningStateError(code)  # type: ignore[arg-type]
    )
    client, _current_user = create_client(app, service)

    with client:
        response = client.get(f"/api/training-plans/{RUN_ID}")

    assert response.status_code == expected_status
    assert response.json() == {"error": expected_error}


def test_request_conflict_is_not_accepted_as_replay(app) -> None:
    service = FakeTrainingPlanningService(
        error=TrainingPlanningStateError(TRAINING_PLANNING_REQUEST_CONFLICT)
    )
    client, _current_user = create_client(app, service)

    with client:
        response = client.post(
            "/api/training-plans",
            json=request_payload(),
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.json() == {"error": TRAINING_PLANNING_REQUEST_CONFLICT}


def test_openapi_exposes_training_planning_contract(app) -> None:
    paths = app.openapi()["paths"]
    assert "/api/training-plans" in paths
    assert "/api/training-plans/{runId}" in paths
    assert (
        paths["/api/training-plans"]["post"]["responses"]["202"][
            "content"
        ]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/TrainingPlanningStatusResponse"
    )
