from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from riva.core.auth import get_auth_service, require_current_user
from riva.core.errors import APIError
from riva.core.resumes import get_resume_parsing_lifecycle_service
from riva.models import User
from riva.schemas.resume_parsing_lifecycle import ResumeParsingStatusResponse

TRUSTED_ORIGIN = "http://localhost:5173"
RESUME_ID = UUID("11111111-1111-4111-8111-111111111111")
NOW = datetime(2026, 8, 6, 12, 0, tzinfo=UTC)


def user() -> User:
    return User(
        id=uuid4(),
        username="resume-api",
        normalized_username="resume-api",
        password_hash="hash",
        display_name="Resume API",
    )


def queued_response() -> ResumeParsingStatusResponse:
    return ResumeParsingStatusResponse(
        resume_document_id=RESUME_ID,
        status="queued",
        run_id=uuid4(),
        attempt_count=0,
        max_attempts=3,
        error_code=None,
        failure_reason=None,
        can_retry=False,
        created_at=NOW,
        started_at=None,
        finished_at=None,
        result_version=None,
        draft_version=None,
        draft_status=None,
    )


class FakeResumeParsingLifecycleService:
    def __init__(self, *, error: APIError | None = None) -> None:
        self.error = error
        self.calls: list[tuple[object, ...]] = []

    async def start(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
        interaction_language: str,
    ):
        self.calls.append(("start", user_id, resume_document_id, interaction_language))
        if self.error is not None:
            raise self.error
        return queued_response()

    async def get_status(self, *, user_id: UUID, resume_document_id: UUID):
        self.calls.append(("status", user_id, resume_document_id))
        if self.error is not None:
            raise self.error
        return queued_response()

    async def retry(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
        interaction_language: str,
    ):
        self.calls.append(("retry", user_id, resume_document_id, interaction_language))
        if self.error is not None:
            raise self.error
        return queued_response()


def create_client(
    app,
    service: FakeResumeParsingLifecycleService,
) -> tuple[TestClient, User]:
    current_user = user()
    app.dependency_overrides[require_current_user] = lambda: current_user
    app.dependency_overrides[get_resume_parsing_lifecycle_service] = lambda: service
    return TestClient(app), current_user


def test_lifecycle_routes_forward_user_and_resume_id_and_use_status_codes(app) -> None:
    service = FakeResumeParsingLifecycleService()
    client, current_user = create_client(app, service)

    with client:
        started = client.post(
            f"/api/profile/resumes/{RESUME_ID}/parsing",
            headers={"Origin": TRUSTED_ORIGIN, "Accept-Language": "en-US"},
        )
        status_response = client.get(
            f"/api/profile/resumes/{RESUME_ID}/parsing",
        )
        retried = client.post(
            f"/api/profile/resumes/{RESUME_ID}/parsing/retry",
            headers={"Origin": TRUSTED_ORIGIN, "Accept-Language": "en-US"},
        )

    assert started.status_code == 202
    assert status_response.status_code == 200
    assert retried.status_code == 202
    assert started.json()["resumeDocumentId"] == str(RESUME_ID)
    assert started.json()["maxAttempts"] == 3
    assert service.calls == [
        ("start", current_user.id, RESUME_ID, "en"),
        ("status", current_user.id, RESUME_ID),
        ("retry", current_user.id, RESUME_ID, "en"),
    ]


def test_write_routes_are_csrf_protected_but_get_does_not_need_body(app) -> None:
    service = FakeResumeParsingLifecycleService()
    client, _user = create_client(app, service)

    with client:
        start = client.post(f"/api/profile/resumes/{RESUME_ID}/parsing")
        retry = client.post(f"/api/profile/resumes/{RESUME_ID}/parsing/retry")
        status_response = client.get(f"/api/profile/resumes/{RESUME_ID}/parsing")

    assert start.status_code == 403
    assert retry.status_code == 403
    assert status_response.status_code == 200
    assert service.calls == [("status", _user.id, RESUME_ID)]


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("zh-CN", "zh-CN"),
        ("zh", "zh-CN"),
        ("zh-TW", "zh-CN"),
        ("en", "en"),
        ("en-US", "en"),
        ("fr", "zh-CN"),
    ],
)
def test_start_normalizes_accept_language_before_service_call(
    app,
    header: str,
    expected: str,
) -> None:
    service = FakeResumeParsingLifecycleService()
    client, _user = create_client(app, service)

    with client:
        response = client.post(
            f"/api/profile/resumes/{RESUME_ID}/parsing",
            headers={"Origin": TRUSTED_ORIGIN, "Accept-Language": header},
        )

    assert response.status_code == 202
    assert service.calls[0][3] == expected


def test_lifecycle_service_errors_keep_existing_error_contract(app) -> None:
    service = FakeResumeParsingLifecycleService(
        error=APIError(409, "resume_parsing_retry_required")
    )
    client, _user = create_client(app, service)

    with client:
        response = client.post(
            f"/api/profile/resumes/{RESUME_ID}/parsing",
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 409
    assert response.json() == {"error": "resume_parsing_retry_required"}
    assert "provider" not in response.text


def test_lifecycle_routes_require_authentication(app) -> None:
    service = FakeResumeParsingLifecycleService()
    app.dependency_overrides[get_resume_parsing_lifecycle_service] = lambda: service
    app.dependency_overrides[get_auth_service] = lambda: object()

    with TestClient(app) as client:
        response = client.get(f"/api/profile/resumes/{RESUME_ID}/parsing")

    assert response.status_code == 401
    assert service.calls == []


def test_openapi_exposes_resume_parsing_lifecycle_contract(app) -> None:
    paths = app.openapi()["paths"]
    base = "/api/profile/resumes/{resumeId}/parsing"
    retry = f"{base}/retry"

    assert base in paths
    assert retry in paths
    assert "202" in paths[base]["post"]["responses"]
    assert "200" in paths[base]["get"]["responses"]
    assert "202" in paths[retry]["post"]["responses"]
    assert (
        paths[base]["post"]["responses"]["202"]["content"]["application/json"][
            "schema"
        ]["$ref"]
        == "#/components/schemas/ResumeParsingStatusResponse"
    )
    assert (
        paths[base]["get"]["responses"]["200"]["content"]["application/json"]["schema"][
            "$ref"
        ]
        == "#/components/schemas/ResumeParsingStatusResponse"
    )
    assert (
        paths[retry]["post"]["responses"]["202"]["content"]["application/json"][
            "schema"
        ]["$ref"]
        == "#/components/schemas/ResumeParsingStatusResponse"
    )
    for operation in (
        paths[base]["post"],
        paths[base]["get"],
        paths[retry]["post"],
    ):
        assert any(
            parameter["name"] == "resumeId" and parameter["in"] == "path"
            for parameter in operation["parameters"]
        )
