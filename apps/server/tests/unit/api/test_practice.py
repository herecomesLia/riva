import asyncio
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
from riva.core.auth import get_auth_service, require_current_user
from riva.core.practice import get_practice_api_service
from riva.models import User
from riva.schemas.practice_sessions import (
    PracticeGeneratingQuestionResponse,
    PracticeSessionSelection,
)


TRUSTED_ORIGIN = "http://localhost:5173"
SESSION_ID = UUID("11111111-1111-4111-8111-111111111111")


def user() -> User:
    return User(
        id=uuid4(),
        username="practice-api",
        normalized_username="practice-api",
        password_hash="hash",
        display_name="Practice API",
    )


def selection() -> PracticeSessionSelection:
    return PracticeSessionSelection(
        target_role_id=uuid4(),
        question_type="projectDeepDive",
        difficulty="basic",
        source="personalized",
        prioritize_weaknesses=False,
    )


def response() -> PracticeGeneratingQuestionResponse:
    return PracticeGeneratingQuestionResponse(
        status="generatingQuestion",
        session_id=SESSION_ID,
        language="zh-CN",
        version=1,
        selection=selection(),
        started_at=datetime(2026, 8, 11, 12, 0, tzinfo=UTC),
        attempt_id=uuid4(),
        attempt_number=1,
    )


class FakePracticeAPIService:
    def __init__(self) -> None:
        self.result = response()
        self.calls: list[tuple[str, dict[str, object]]] = []

    async def start_session(self, **kwargs: object):
        self.calls.append(("start", kwargs))
        return self.result

    async def refresh_question_generation(self, **kwargs: object):
        self.calls.append(("refresh", kwargs))
        return self.result

    async def get_session(self, **kwargs: object):
        self.calls.append(("get", kwargs))
        return self.result


def request(app, method: str, path: str, **kwargs: object) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def install_service(app, service: FakePracticeAPIService, current_user: User) -> None:
    async def get_user() -> User:
        return current_user

    async def get_service() -> FakePracticeAPIService:
        return service

    app.dependency_overrides[require_current_user] = get_user
    app.dependency_overrides[get_practice_api_service] = get_service


def test_start_forwards_accept_language_returns_202_and_camel_case(app) -> None:
    service = FakePracticeAPIService()
    current_user = user()
    install_service(app, service, current_user)
    payload = selection().model_dump(mode="json")

    result = request(
        app,
        "POST",
        "/api/practice/sessions",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN, "Accept-Language": "en-US"},
    )

    assert result.status_code == 202
    assert result.json()["status"] == "generatingQuestion"
    assert result.json()["sessionId"] == str(SESSION_ID)
    assert service.calls[0][0] == "start"
    assert service.calls[0][1]["user_id"] == current_user.id
    assert service.calls[0][1]["interaction_language"] == "en"


def test_start_body_cannot_supply_language_and_mutations_require_csrf(app) -> None:
    service = FakePracticeAPIService()
    install_service(app, service, user())
    payload = {**selection().model_dump(mode="json"), "language": "en"}

    invalid = request(
        app,
        "POST",
        "/api/practice/sessions",
        json=payload,
        headers={"Origin": TRUSTED_ORIGIN},
    )
    csrf = request(
        app,
        "POST",
        "/api/practice/sessions",
        json=selection().model_dump(mode="json"),
    )

    assert invalid.status_code == 422
    assert csrf.status_code == 403
    assert service.calls == []


def test_refresh_uses_session_id_and_version_and_get_is_safe(app) -> None:
    service = FakePracticeAPIService()
    install_service(app, service, user())

    refreshed = request(
        app,
        "POST",
        f"/api/practice/sessions/{SESSION_ID}/question-generation/refresh",
        json={"version": 1},
        headers={"Origin": TRUSTED_ORIGIN},
    )
    fetched = request(app, "GET", f"/api/practice/sessions/{SESSION_ID}")

    assert refreshed.status_code == 200
    assert fetched.status_code == 200
    assert [call[0] for call in service.calls] == ["refresh", "get"]
    assert service.calls[0][1]["session_id"] == SESSION_ID
    assert service.calls[0][1]["payload"].version == 1


def test_practice_routes_require_authentication(app) -> None:
    service = FakePracticeAPIService()

    async def get_service() -> FakePracticeAPIService:
        return service

    app.dependency_overrides[get_practice_api_service] = get_service

    async def get_auth() -> object:
        return object()

    app.dependency_overrides[get_auth_service] = get_auth

    result = request(app, "GET", f"/api/practice/sessions/{SESSION_ID}")

    assert result.status_code == 401
    assert result.json() == {"error": "not_authenticated"}
    assert service.calls == []


def test_openapi_exposes_practice_union_contract(app) -> None:
    paths = app.openapi()["paths"]

    assert "/api/practice/sessions" in paths
    assert "/api/practice/sessions/{sessionId}" in paths
    assert (
        "/api/practice/sessions/{sessionId}/question-generation/refresh"
        in paths
    )
    assert "202" in paths["/api/practice/sessions"]["post"]["responses"]
    assert "200" in paths["/api/practice/sessions/{sessionId}"]["get"]["responses"]
    response_schema = paths["/api/practice/sessions"]["post"]["responses"]["202"][
        "content"
    ]["application/json"]["schema"]
    assert response_schema["discriminator"]["propertyName"] == "status"
