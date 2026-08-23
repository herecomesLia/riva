from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import status
from fastapi.testclient import TestClient

from riva.api.dependencies import (
    require_current_user,
    require_llm_provider,
    require_question_card_service,
    require_user_service,
)
from riva.models import User
from riva.schemas.question_cards import (
    QuestionCardResponse,
    StartQuestionGenerationRequest,
)
from riva.services.errors import DomainConflictError, ServiceError
from riva.services.practice.cards import QUESTION_GENERATION_REQUEST_CONFLICT

TRUSTED_ORIGIN = "http://localhost:5173"
CARD_ID = UUID("22222222-2222-4222-8222-222222222222")
NOW = datetime(2026, 8, 10, 10, 0, tzinfo=UTC)


def user() -> User:
    return User(
        id=uuid4(),
        username="question-card-api",
        normalized_username="question-card-api",
        password_hash="hash",
        display_name="Question Card API",
    )


def card_response() -> QuestionCardResponse:
    return QuestionCardResponse(
        id=CARD_ID,
        target_role_id=uuid4(),
        language="zh-CN",
        question_type="projectDeepDive",
        difficulty="basic",
        prompt="Tell me about the payment project.",
        assessed_capabilities=["Ownership"],
        recommended_materials=[],
        answer_hints=["Explain the context."],
        answer_framework=["Context", "Action", "Result"],
        is_saved=False,
        is_marked_weak=False,
        created_at=NOW,
        updated_at=NOW,
    )


class FakeQuestionCardService:
    def __init__(self, *, error: ServiceError | None = None) -> None:
        self.error = error
        self.calls: list[tuple[str, object]] = []

    async def start_generation(
        self,
        current_user: User,
        payload: StartQuestionGenerationRequest,
        *,
        interaction_language: str,
    ) -> QuestionCardResponse:
        self.calls.append(("start", (current_user, payload, interaction_language)))
        if self.error is not None:
            raise self.error
        return card_response()

    async def get_question_card(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
    ) -> QuestionCardResponse:
        self.calls.append(("card", (user_id, question_card_id)))
        if self.error is not None:
            raise self.error
        return card_response()


def create_client(
    app,
    service: FakeQuestionCardService,
) -> tuple[TestClient, User]:
    current_user = user()
    app.dependency_overrides[require_current_user] = lambda: current_user
    app.dependency_overrides[require_llm_provider] = lambda: object()
    app.dependency_overrides[require_question_card_service] = lambda: service
    return TestClient(app), current_user


def generation_payload() -> dict[str, object]:
    return {
        "requestId": str(uuid4()),
        "targetRoleId": str(uuid4()),
        "questionType": "projectDeepDive",
        "difficulty": "basic",
    }


def test_generation_returns_final_card_and_normalizes_language(app) -> None:
    service = FakeQuestionCardService()
    client, current_user = create_client(app, service)

    with client:
        response = client.post(
            "/api/question-cards/generations",
            json=generation_payload(),
            headers={"Origin": TRUSTED_ORIGIN, "Accept-Language": "en-US"},
        )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == card_response().model_dump(mode="json", by_alias=True)
    call_user, payload, language = service.calls[0][1]
    assert call_user is current_user
    assert payload.request_id is not None
    assert language == "en"


def test_question_card_get_still_returns_card(app) -> None:
    service = FakeQuestionCardService()
    client, current_user = create_client(app, service)

    with client:
        response = client.get(f"/api/question-cards/{CARD_ID}")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["id"] == str(CARD_ID)
    assert service.calls == [("card", (current_user.id, CARD_ID))]


def test_generation_status_route_is_removed(app) -> None:
    with TestClient(app) as client:
        response = client.get(
            "/api/question-cards/generations/11111111-1111-4111-8111-111111111111"
        )

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_write_routes_require_csrf(app) -> None:
    service = FakeQuestionCardService()
    client, _current_user = create_client(app, service)

    with client:
        response = client.post(
            "/api/question-cards/generations",
            json=generation_payload(),
        )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert service.calls == []


def test_request_body_cannot_override_language(app) -> None:
    service = FakeQuestionCardService()
    client, _current_user = create_client(app, service)

    with client:
        response = client.post(
            "/api/question-cards/generations",
            json={**generation_payload(), "interactionLanguage": "en"},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert service.calls == []


def test_generation_conflicts_keep_the_public_error_contract(app) -> None:
    service = FakeQuestionCardService(
        error=DomainConflictError(QUESTION_GENERATION_REQUEST_CONFLICT)
    )
    client, _current_user = create_client(app, service)

    with client:
        response = client.post(
            "/api/question-cards/generations",
            json=generation_payload(),
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.json() == {"error": QUESTION_GENERATION_REQUEST_CONFLICT}


def test_question_card_routes_require_authentication(app) -> None:
    service = FakeQuestionCardService()
    app.dependency_overrides[require_question_card_service] = lambda: service
    app.dependency_overrides[require_user_service] = lambda: object()

    with TestClient(app) as client:
        response = client.post(
            "/api/question-cards/generations",
            json=generation_payload(),
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert service.calls == []


def test_openapi_exposes_direct_question_card_contract(app) -> None:
    paths = app.openapi()["paths"]
    generation = "/api/question-cards/generations"

    assert (
        paths[generation]["post"]["responses"]["200"]["content"]["application/json"][
            "schema"
        ]["$ref"]
        == "#/components/schemas/QuestionCardResponse"
    )
