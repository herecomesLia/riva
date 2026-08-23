from uuid import UUID, uuid4

from fastapi import status
from fastapi.testclient import TestClient

from riva.agents.training.planning_types import TrainingPlanningTargetedPracticeOutput
from riva.api.dependencies import (
    require_current_user,
    require_llm_provider,
    require_training_planning_service,
    require_user_service,
)
from riva.models import User
from riva.schemas.training_planning import (
    EnsureCurrentTrainingPlanningRequest,
    StartTrainingPlanningRequest,
    TrainingPlanningResponse,
)
from riva.services.training.planning import (
    TRAINING_PLANNING_REQUEST_CONFLICT,
    TrainingPlanningStateError,
)

TRUSTED_ORIGIN = "http://localhost:5173"
ROLE_ID = UUID("22222222-2222-4222-8222-222222222222")


def user() -> User:
    return User(
        id=uuid4(),
        username="training-planner-api",
        normalized_username="training-planner-api",
        password_hash="hash",
        display_name="Training Planner API",
    )


def planning_response() -> TrainingPlanningResponse:
    return TrainingPlanningResponse(
        target_role_id=ROLE_ID,
        interaction_language="en",
        plan=TrainingPlanningTargetedPracticeOutput(
            action="targetedPractice",
            reason="Practice the current evidence gap.",
            focus_areas=["project results"],
            question_type="projectDeepDive",
            difficulty="basic",
            prioritize_weaknesses=False,
        ),
    )


class FakeTrainingPlanningService:
    def __init__(
        self,
        *,
        error: TrainingPlanningStateError | None = None,
    ):
        self.error = error
        self.calls: list[tuple[str, object, str]] = []

    async def start_planning(
        self,
        current_user: User,
        payload: StartTrainingPlanningRequest,
        *,
        interaction_language: str,
    ) -> TrainingPlanningResponse:
        self.calls.append(("start", payload, interaction_language))
        if self.error is not None:
            raise self.error
        return planning_response()

    async def ensure_current_planning(
        self,
        current_user: User,
        payload: EnsureCurrentTrainingPlanningRequest,
        *,
        interaction_language: str,
    ) -> TrainingPlanningResponse:
        self.calls.append(("current", payload, interaction_language))
        if self.error is not None:
            raise self.error
        return planning_response()


def create_client(app, service: FakeTrainingPlanningService) -> tuple[TestClient, User]:
    current_user = user()
    app.dependency_overrides[require_current_user] = lambda: current_user
    app.dependency_overrides[require_llm_provider] = lambda: object()
    app.dependency_overrides[require_training_planning_service] = lambda: service
    return TestClient(app), current_user


def request_payload() -> dict[str, str]:
    return {"requestId": str(uuid4()), "targetRoleId": str(ROLE_ID)}


def test_start_returns_final_plan_and_normalizes_language(app) -> None:
    service = FakeTrainingPlanningService()
    client, _current_user = create_client(app, service)

    with client:
        response = client.post(
            "/api/training-plans",
            json=request_payload(),
            headers={"Origin": TRUSTED_ORIGIN, "Accept-Language": "en-US"},
        )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == planning_response().model_dump(mode="json", by_alias=True)
    assert service.calls[0][0] == "start"
    assert service.calls[0][2] == "en"


def test_current_returns_final_plan(app) -> None:
    service = FakeTrainingPlanningService()
    client, _current_user = create_client(app, service)

    with client:
        response = client.post(
            "/api/training-plans/current",
            json={"targetRoleId": str(ROLE_ID)},
            headers={"Origin": TRUSTED_ORIGIN, "Accept-Language": "zh-CN"},
        )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["targetRoleId"] == str(ROLE_ID)
    assert response.json()["interactionLanguage"] == "en"
    assert service.calls[0][0] == "current"
    assert service.calls[0][2] == "zh-CN"


def test_status_route_is_removed(app) -> None:
    with TestClient(app) as client:
        response = client.get(
            "/api/training-plans/11111111-1111-4111-8111-111111111111"
        )

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_write_routes_require_csrf(app) -> None:
    service = FakeTrainingPlanningService()
    client, _current_user = create_client(app, service)

    with client:
        response = client.post("/api/training-plans", json=request_payload())

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert service.calls == []


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


def test_state_errors_keep_the_public_error_contract(app) -> None:
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


def test_training_planning_routes_require_authentication(app) -> None:
    service = FakeTrainingPlanningService()
    app.dependency_overrides[require_training_planning_service] = lambda: service
    app.dependency_overrides[require_user_service] = lambda: object()

    with TestClient(app) as client:
        response = client.post(
            "/api/training-plans",
            json=request_payload(),
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert service.calls == []


def test_openapi_exposes_direct_training_planning_contract(app) -> None:
    paths = app.openapi()["paths"]

    for path in ("/api/training-plans", "/api/training-plans/current"):
        response = paths[path]["post"]["responses"]
        assert "202" not in response
        assert (
            response["200"]["content"]["application/json"]["schema"]["$ref"]
            == "#/components/schemas/TrainingPlanningResponse"
        )
