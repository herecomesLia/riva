from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import status
from fastapi.testclient import TestClient

from riva.core.auth import get_auth_service, require_current_user
from riva.core.errors import APIError
from riva.core.resumes import get_resume_parsing_lifecycle_service
from riva.models import User
from riva.schemas.resume_import_api import ResumeImportDraftResponse

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


def draft_response() -> ResumeImportDraftResponse:
    return ResumeImportDraftResponse.model_validate(
        {
            "resumeDocumentId": RESUME_ID,
            "sourceRunId": uuid4(),
            "parsingResultVersion": 1,
            "draftVersion": 1,
            "status": "ready",
            "baseProfileId": None,
            "baseProfileVersion": None,
            "appliedProfileVersion": None,
            "appliedAt": None,
            "canApply": True,
            "summary": "Resume summary",
            "summaryAction": "set",
            "education": [],
            "workExperiences": [],
            "projectExperiences": [],
            "skills": [],
            "unresolvedItems": [],
            "skippedItems": [],
            "protectedItems": [],
            "changeSummary": {
                "newItems": 0,
                "changedItems": 0,
                "missingItems": 0,
            },
            "createdAt": NOW,
            "updatedAt": NOW,
        }
    )


class FakeResumeParsingLifecycleService:
    def __init__(self, *, error: APIError | None = None) -> None:
        self.error = error
        self.calls: list[tuple[str, UUID, UUID, str]] = []

    async def start(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
        interaction_language: str,
    ) -> ResumeImportDraftResponse:
        self.calls.append(("start", user_id, resume_document_id, interaction_language))
        if self.error is not None:
            raise self.error
        return draft_response()

    async def retry(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
        interaction_language: str,
    ) -> ResumeImportDraftResponse:
        self.calls.append(("retry", user_id, resume_document_id, interaction_language))
        if self.error is not None:
            raise self.error
        return draft_response()


def create_client(
    app,
    service: FakeResumeParsingLifecycleService,
) -> tuple[TestClient, User]:
    current_user = user()
    app.dependency_overrides[require_current_user] = lambda: current_user
    app.dependency_overrides[get_resume_parsing_lifecycle_service] = lambda: service
    return TestClient(app), current_user


def test_parsing_routes_return_final_draft_and_normalize_language(app) -> None:
    service = FakeResumeParsingLifecycleService()
    client, current_user = create_client(app, service)

    with client:
        started = client.post(
            f"/api/profile/resumes/{RESUME_ID}/parsing",
            headers={"Origin": TRUSTED_ORIGIN, "Accept-Language": "en-US"},
        )
        retried = client.post(
            f"/api/profile/resumes/{RESUME_ID}/parsing/retry",
            headers={"Origin": TRUSTED_ORIGIN, "Accept-Language": "zh-CN"},
        )

    assert started.status_code == status.HTTP_200_OK
    assert retried.status_code == status.HTTP_200_OK
    assert started.json()["resumeDocumentId"] == str(RESUME_ID)
    assert started.json()["status"] == "ready"
    assert service.calls == [
        ("start", current_user.id, RESUME_ID, "en"),
        ("retry", current_user.id, RESUME_ID, "zh-CN"),
    ]


def test_status_route_is_removed(app) -> None:
    with TestClient(app) as client:
        response = client.get(f"/api/profile/resumes/{RESUME_ID}/parsing")

    assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


def test_write_routes_require_csrf(app) -> None:
    service = FakeResumeParsingLifecycleService()
    client, _current_user = create_client(app, service)

    with client:
        start = client.post(f"/api/profile/resumes/{RESUME_ID}/parsing")
        retry = client.post(f"/api/profile/resumes/{RESUME_ID}/parsing/retry")

    assert start.status_code == status.HTTP_403_FORBIDDEN
    assert retry.status_code == status.HTTP_403_FORBIDDEN
    assert service.calls == []


def test_lifecycle_errors_keep_the_public_error_contract(app) -> None:
    service = FakeResumeParsingLifecycleService(
        error=APIError(409, "resume_parsing_retry_required")
    )
    client, _current_user = create_client(app, service)

    with client:
        response = client.post(
            f"/api/profile/resumes/{RESUME_ID}/parsing",
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.json() == {"error": "resume_parsing_retry_required"}


def test_lifecycle_routes_require_authentication(app) -> None:
    service = FakeResumeParsingLifecycleService()
    app.dependency_overrides[get_resume_parsing_lifecycle_service] = lambda: service
    app.dependency_overrides[get_auth_service] = lambda: object()

    with TestClient(app) as client:
        response = client.post(
            f"/api/profile/resumes/{RESUME_ID}/parsing",
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert service.calls == []


def test_openapi_exposes_direct_resume_parsing_contract(app) -> None:
    paths = app.openapi()["paths"]
    base = "/api/profile/resumes/{resumeId}/parsing"
    retry = f"{base}/retry"

    assert base in paths
    assert retry in paths
    assert "get" not in paths[base]
    for path in (base, retry):
        response = paths[path]["post"]["responses"]
        assert "202" not in response
        assert (
            response["200"]["content"]["application/json"]["schema"]["$ref"]
            == "#/components/schemas/ResumeImportDraftResponse"
        )
