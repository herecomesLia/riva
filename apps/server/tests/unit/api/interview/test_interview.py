import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import httpx

from riva.api.dependencies import (
    require_current_user,
    require_interview_service,
    require_llm_provider,
)
from riva.models import InterviewSession, User
from riva.services.errors import AuthenticationRequiredError
from riva.services.interview.session import (
    INTERVIEW_SESSION_ALREADY_ACTIVE,
    InterviewSessionStateError,
    InterviewSetupContext,
)
from riva.services.interview.workflow import InterviewService

TRUSTED_ORIGIN = "http://localhost:5173"
NOW = datetime(2026, 8, 16, 10, 0, tzinfo=UTC)


def make_user() -> User:
    return User(
        id=uuid4(),
        username="interview-api-user",
        normalized_username="interview-api-user",
        password_hash="hash",
        display_name="Interview API User",
    )


def make_domain(user_id):
    role = type(
        "Role",
        (),
        {
            "id": uuid4(),
            "title": "Backend Engineer",
            "company": "Riva",
        },
    )()
    setup = InterviewSetupContext(
        target_roles=(role,),
        current_target_role_id=role.id,
        has_non_archived_role=True,
        profile_complete=True,
        blocked_reason=None,
    )
    active: InterviewSession | None = None

    class Domain:
        calls: list[tuple[str, object]] = []

        async def get_setup(self, *, user_id):
            return setup

        async def get_active_session(self, *, user_id):
            return active

        async def start_session(
            self,
            *,
            user_id,
            configuration,
            interaction_language,
        ):
            nonlocal active
            self.calls.append(
                (
                    "start",
                    {
                        "user_id": user_id,
                        "configuration": configuration,
                        "interaction_language": interaction_language,
                    },
                )
            )
            active = InterviewSession(
                id=uuid4(),
                user_id=user_id,
                target_role_id=configuration.target_role_id,
                language=interaction_language,
                version=1,
                status="opening",
                round=configuration.round.value,
                difficulty=configuration.difficulty.value,
                duration_minutes=int(configuration.duration_minutes),
                started_at=NOW,
                created_at=NOW,
                updated_at=NOW,
                plan_revision=0,
            )
            return active

    return Domain(), role


def install_interview_service(app, service, current_user) -> None:
    async def get_user() -> User:
        return current_user

    async def get_service() -> InterviewService:
        return service

    app.dependency_overrides[require_current_user] = get_user
    app.dependency_overrides[require_llm_provider] = lambda: object()
    app.dependency_overrides[require_interview_service] = get_service


def request(app, method: str, path: str, **kwargs: object) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def test_get_interview_returns_setup_and_empty_session(app) -> None:
    current_user = make_user()
    domain, _role = make_domain(current_user.id)
    service = InterviewService(
        object(),
        interview_service_factory=lambda _session: domain,
    )
    install_interview_service(app, service, current_user)

    result = request(app, "GET", "/api/interview")

    assert result.status_code == 200
    body = result.json()
    assert body["session"] is None
    assert body["setup"]["availability"] == {"status": "available"}
    assert body["setup"]["defaultConfiguration"]["round"] == "technical"
    assert body["setup"]["availableDurationMinutes"] == [15, 30, 45]


def test_start_interview_uses_accept_language_and_returns_201(app) -> None:
    current_user = make_user()
    domain, role = make_domain(current_user.id)
    service = InterviewService(
        object(),
        interview_service_factory=lambda _session: domain,
    )
    install_interview_service(app, service, current_user)

    result = request(
        app,
        "POST",
        "/api/interview/sessions",
        json={
            "targetRoleId": str(role.id),
            "round": "technical",
            "difficulty": "pressure",
            "durationMinutes": 30,
        },
        headers={"Origin": TRUSTED_ORIGIN, "Accept-Language": "en-US"},
    )

    assert result.status_code == 201
    body = result.json()
    assert body["session"]["status"] == "opening"
    assert body["session"]["language"] == "en"
    assert body["session"]["version"] == 1
    assert body["session"]["configuration"]["targetRoleId"] == str(role.id)
    assert body["session"]["progress"] == {
        "completedMainQuestions": 0,
        "totalMainQuestions": None,
        "planRevision": 0,
    }
    assert domain.calls[0][1]["user_id"] == current_user.id
    assert domain.calls[0][1]["interaction_language"] == "en"


def test_interview_requires_authentication(app) -> None:
    app.dependency_overrides[require_interview_service] = lambda: object()

    async def reject_authentication():
        raise AuthenticationRequiredError("not_authenticated")

    app.dependency_overrides[require_current_user] = reject_authentication

    result = request(app, "GET", "/api/interview")

    assert result.status_code == 401
    assert result.json() == {"error": "not_authenticated"}


def test_interview_state_error_is_mapped_to_conflict(app) -> None:
    current_user = make_user()
    domain, role = make_domain(current_user.id)

    async def conflict_start(**kwargs):
        raise InterviewSessionStateError(INTERVIEW_SESSION_ALREADY_ACTIVE)

    domain.start_session = conflict_start
    service = InterviewService(
        object(),
        interview_service_factory=lambda _session: domain,
    )
    install_interview_service(app, service, current_user)

    result = request(
        app,
        "POST",
        "/api/interview/sessions",
        json={
            "targetRoleId": str(role.id),
            "round": "technical",
            "difficulty": "pressure",
            "durationMinutes": 30,
        },
        headers={"Origin": TRUSTED_ORIGIN},
    )

    assert result.status_code == 409
    assert result.json() == {"error": "interview_session_already_active"}
