from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import status
from fastapi.testclient import TestClient
import pytest

from riva.core.auth import get_auth_service, require_current_user
from riva.core.question_cards import get_question_card_service
from riva.core.errors import APIError
from riva.models import User
from riva.schemas.question_cards import (
    QuestionCardResponse,
    QuestionGenerationStatusResponse,
)
from riva.services.question_cards import QUESTION_GENERATION_REQUEST_CONFLICT


TRUSTED_ORIGIN = "http://localhost:5173"
RUN_ID = UUID("11111111-1111-4111-8111-111111111111")
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


def status_response(
    state: str,
    *,
    question_card: QuestionCardResponse | None = None,
) -> QuestionGenerationStatusResponse:
    return QuestionGenerationStatusResponse(
        run_id=RUN_ID,
        status=state,
        question_type="projectDeepDive",
        difficulty="basic",
        language="zh-CN",
        attempt_count=1 if state != "queued" else 0,
        max_attempts=3,
        error_code="provider_unavailable" if state == "failed" else None,
        failure_reason=(
            "The question could not be generated right now. Please try again."
            if state == "failed"
            else None
        ),
        created_at=NOW,
        started_at=None if state == "queued" else NOW,
        finished_at=NOW if state in {"succeeded", "failed"} else None,
        question_card=question_card,
    )


class FakeQuestionCardService:
    def __init__(
        self,
        *,
        start_result: QuestionGenerationStatusResponse | None = None,
        status_result: QuestionGenerationStatusResponse | None = None,
        card_result: QuestionCardResponse | None = None,
        error: APIError | None = None,
    ) -> None:
        self.start_result = start_result or status_response("queued")
        self.status_result = status_result or status_response("queued")
        self.card_result = card_result or card_response()
        self.error = error
        self.calls: list[tuple[str, object]] = []

    async def start_generation(
        self,
        current_user: User,
        payload: object,
        *,
        interaction_language: str,
    ) -> QuestionGenerationStatusResponse:
        self.calls.append(
            ("start", (current_user, payload, interaction_language))
        )
        if self.error is not None:
            raise self.error
        return self.start_result

    async def get_generation_status(
        self,
        *,
        user_id: UUID,
        run_id: UUID,
    ) -> QuestionGenerationStatusResponse:
        self.calls.append(("status", (user_id, run_id)))
        if self.error is not None:
            raise self.error
        return self.status_result

    async def get_question_card(
        self,
        *,
        user_id: UUID,
        question_card_id: UUID,
    ) -> QuestionCardResponse:
        self.calls.append(("card", (user_id, question_card_id)))
        if self.error is not None:
            raise self.error
        return self.card_result


def create_client(
    app,
    service: FakeQuestionCardService,
) -> tuple[TestClient, User]:
    current_user = user()
    app.dependency_overrides[require_current_user] = lambda: current_user
    app.dependency_overrides[get_question_card_service] = lambda: service
    return TestClient(app), current_user


def generation_payload() -> dict[str, object]:
    return {
        "requestId": str(uuid4()),
        "targetRoleId": str(uuid4()),
        "questionType": "projectDeepDive",
        "difficulty": "basic",
    }


@pytest.mark.parametrize(
    ("method", "url", "json"),
    [
        ("post", "/api/question-cards/generations", generation_payload()),
        ("get", f"/api/question-cards/generations/{RUN_ID}", None),
        ("get", f"/api/question-cards/{CARD_ID}", None),
    ],
)
def test_question_card_endpoints_require_authentication(
    app,
    method: str,
    url: str,
    json: dict[str, object] | None,
) -> None:
    service = FakeQuestionCardService()
    app.dependency_overrides[get_question_card_service] = lambda: service
    app.dependency_overrides[get_auth_service] = lambda: object()

    with TestClient(app) as client:
        response = client.request(
            method,
            url,
            json=json,
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json() == {"error": "not_authenticated"}
    assert service.calls == []


@pytest.mark.parametrize(
    ("header", "expected_language"),
    [("zh-CN", "zh-CN"), ("en-US", "en")],
)
def test_start_generation_returns_202_and_freezes_accept_language(
    app,
    header: str,
    expected_language: str,
) -> None:
    service = FakeQuestionCardService()
    client, current_user = create_client(app, service)

    with client:
        response = client.post(
            "/api/question-cards/generations",
            json=generation_payload(),
            headers={
                "Origin": TRUSTED_ORIGIN,
                "Accept-Language": header,
            },
        )

    assert response.status_code == status.HTTP_202_ACCEPTED
    assert response.json()["status"] == "queued"
    assert response.json()["runId"] == str(RUN_ID)
    assert service.calls[0][0] == "start"
    call_user, payload, language = service.calls[0][1]
    assert call_user is current_user
    assert payload.request_id is not None
    assert language == expected_language


def test_start_generation_body_cannot_override_language(app) -> None:
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


def test_post_is_csrf_protected_but_get_status_is_not(app) -> None:
    service = FakeQuestionCardService()
    client, _current_user = create_client(app, service)

    with client:
        start = client.post(
            "/api/question-cards/generations",
            json=generation_payload(),
        )
        get_status = client.get(f"/api/question-cards/generations/{RUN_ID}")

    assert start.status_code == status.HTTP_403_FORBIDDEN
    assert get_status.status_code == status.HTTP_200_OK
    assert [call[0] for call in service.calls] == ["status"]


def test_status_and_card_routes_return_camel_case_public_contract(app) -> None:
    service = FakeQuestionCardService(
        status_result=status_response("succeeded", question_card=card_response()),
        card_result=card_response(),
    )
    client, current_user = create_client(app, service)

    with client:
        status_result = client.get(f"/api/question-cards/generations/{RUN_ID}")
        card_result = client.get(f"/api/question-cards/{CARD_ID}")

    assert status_result.status_code == 200
    assert status_result.json()["questionCard"]["isSaved"] is False
    assert card_result.status_code == 200
    card_json = card_result.json()
    assert card_json["id"] == str(CARD_ID)
    assert "sourceAgentRunId" not in card_json
    assert "matchingAnalysisRunId" not in card_json
    assert "followUpDirections" not in card_json
    assert "scoringFocus" not in card_json
    assert service.calls == [
        ("status", (current_user.id, RUN_ID)),
        ("card", (current_user.id, CARD_ID)),
    ]


def test_failed_status_uses_safe_service_error(app) -> None:
    service = FakeQuestionCardService(
        status_result=status_response("failed"),
        error=APIError(409, "question_generation_state_conflict"),
    )
    client, _current_user = create_client(app, service)
    service.error = None

    with client:
        response = client.get(f"/api/question-cards/generations/{RUN_ID}")

    assert response.status_code == 200
    assert response.json()["failureReason"] == (
        "The question could not be generated right now. Please try again."
    )
    assert "provider response" not in response.text.lower()


def test_application_error_contract_is_preserved(app) -> None:
    service = FakeQuestionCardService(
        error=APIError(404, "question_generation_not_found")
    )
    client, _current_user = create_client(app, service)

    with client:
        response = client.get(f"/api/question-cards/generations/{RUN_ID}")

    assert response.status_code == 404
    assert response.json() == {"error": "question_generation_not_found"}


def test_start_generation_request_conflict_is_not_accepted_as_replay(app) -> None:
    service = FakeQuestionCardService(
        error=APIError(409, QUESTION_GENERATION_REQUEST_CONFLICT)
    )
    client, _current_user = create_client(app, service)

    with client:
        response = client.post(
            "/api/question-cards/generations",
            json=generation_payload(),
            headers={
                "Origin": TRUSTED_ORIGIN,
                "Accept-Language": "en-US",
            },
        )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.json() == {"error": QUESTION_GENERATION_REQUEST_CONFLICT}


def test_openapi_exposes_question_card_contract(app) -> None:
    paths = app.openapi()["paths"]
    start = "/api/question-cards/generations"
    generation = f"{start}/{{runId}}"
    card = "/api/question-cards/{questionCardId}"

    assert start in paths
    assert generation in paths
    assert card in paths
    assert (
        paths[start]["post"]["responses"]["202"]["content"][
            "application/json"
        ]["schema"]["$ref"]
        == "#/components/schemas/QuestionGenerationStatusResponse"
    )
    assert (
        paths[generation]["get"]["responses"]["200"]["content"][
            "application/json"
        ]["schema"]["$ref"]
        == "#/components/schemas/QuestionGenerationStatusResponse"
    )
    assert (
        paths[card]["get"]["responses"]["200"]["content"][
            "application/json"
        ]["schema"]["$ref"]
        == "#/components/schemas/QuestionCardResponse"
    )
