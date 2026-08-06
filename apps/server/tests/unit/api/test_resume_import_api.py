from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from riva.core.auth import get_auth_service, require_current_user
from riva.core.errors import APIError
from riva.core.resumes import get_resume_import_api_service
from riva.models import User
from riva.schemas.profile import CareerProfileResponse
from riva.schemas.resume_import_api import (
    ResumeImportApplicationResponse,
    ResumeImportDraftResponse,
)


TRUSTED_ORIGIN = "http://localhost:5173"
RESUME_ID = UUID("11111111-1111-4111-8111-111111111111")
NOW = datetime(2026, 8, 6, 12, 0, tzinfo=UTC)


def user() -> User:
    return User(
        id=uuid4(),
        username="resume-import-api",
        normalized_username="resume-import-api",
        password_hash="hash",
        display_name="Resume Import API",
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


def profile_response() -> CareerProfileResponse:
    return CareerProfileResponse.model_validate(
        {
            "profileId": uuid4(),
            "summary": "Resume summary",
            "version": 1,
            "updatedAt": NOW,
            "education": [],
            "workExperiences": [],
            "projectExperiences": [],
            "skills": [],
        }
    )


class FakeResumeImportAPIService:
    def __init__(self, *, error: APIError | None = None) -> None:
        self.error = error
        self.get_calls: list[tuple[UUID, UUID]] = []
        self.apply_calls: list[tuple[UUID, UUID, int]] = []

    async def get_draft(self, *, user_id: UUID, resume_document_id: UUID):
        self.get_calls.append((user_id, resume_document_id))
        if self.error is not None:
            raise self.error
        return draft_response()

    async def apply_draft(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
        draft_version: int,
    ):
        self.apply_calls.append((user_id, resume_document_id, draft_version))
        if self.error is not None:
            raise self.error
        return ResumeImportApplicationResponse(
            draft=draft_response(),
            profile=profile_response(),
            profile_created=True,
            profile_changed=True,
        )


def create_client(
    app,
    service: FakeResumeImportAPIService,
) -> tuple[TestClient, User]:
    current_user = user()
    app.dependency_overrides[require_current_user] = lambda: current_user
    app.dependency_overrides[get_resume_import_api_service] = lambda: service
    return TestClient(app), current_user


def test_draft_routes_forward_path_user_body_and_use_contracts(app) -> None:
    service = FakeResumeImportAPIService()
    client, current_user = create_client(app, service)

    with client:
        get_response = client.get(
            f"/api/profile/resumes/{RESUME_ID}/import-draft"
        )
        apply_response = client.post(
            f"/api/profile/resumes/{RESUME_ID}/import-draft/apply",
            json={"draftVersion": 1},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert get_response.status_code == 200
    assert get_response.json()["draftVersion"] == 1
    assert apply_response.status_code == 200
    assert apply_response.json()["profileCreated"] is True
    assert service.get_calls == [(current_user.id, RESUME_ID)]
    assert service.apply_calls == [(current_user.id, RESUME_ID, 1)]


def test_apply_requires_csrf_and_request_rejects_extra_fields(app) -> None:
    service = FakeResumeImportAPIService()
    client, _user = create_client(app, service)

    with client:
        csrf_response = client.post(
            f"/api/profile/resumes/{RESUME_ID}/import-draft/apply",
            json={"draftVersion": 1},
        )
        invalid_response = client.post(
            f"/api/profile/resumes/{RESUME_ID}/import-draft/apply",
            json={"draftVersion": 1, "profile": {}},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert csrf_response.status_code == 403
    assert invalid_response.status_code == 422
    assert service.apply_calls == []


def test_draft_routes_require_authentication(app) -> None:
    service = FakeResumeImportAPIService()
    app.dependency_overrides[get_resume_import_api_service] = lambda: service
    app.dependency_overrides[get_auth_service] = lambda: object()

    with TestClient(app) as client:
        response = client.get(
            f"/api/profile/resumes/{RESUME_ID}/import-draft"
        )

    assert response.status_code == 401
    assert service.get_calls == []


def test_facade_api_errors_are_returned_without_internal_details(app) -> None:
    service = FakeResumeImportAPIService(
        error=APIError(409, "resume_import_draft_not_ready")
    )
    client, _user = create_client(app, service)

    with client:
        response = client.get(
            f"/api/profile/resumes/{RESUME_ID}/import-draft"
        )

    assert response.status_code == 409
    assert response.json() == {"error": "resume_import_draft_not_ready"}
    assert "sql" not in response.text.lower()


def test_openapi_exposes_draft_paths_body_and_alias(app) -> None:
    paths = app.openapi()["paths"]
    get_path = "/api/profile/resumes/{resumeId}/import-draft"
    apply_path = f"{get_path}/apply"

    assert paths[get_path]["get"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]["$ref"] == "#/components/schemas/ResumeImportDraftResponse"
    assert paths[apply_path]["post"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]["$ref"] == (
        "#/components/schemas/ResumeImportApplicationResponse"
    )
    assert any(
        parameter["name"] == "resumeId"
        and parameter["in"] == "path"
        for parameter in paths[apply_path]["post"]["parameters"]
    )
    body_schema = paths[apply_path]["post"]["requestBody"]["content"][
        "application/json"
    ]["schema"]
    assert body_schema["$ref"] == (
        "#/components/schemas/ResumeImportApplicationRequest"
    )
