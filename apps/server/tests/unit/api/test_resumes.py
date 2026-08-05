from datetime import UTC, datetime
import io
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from riva.core.auth import get_auth_service, require_current_user
from riva.core.errors import APIError
from riva.core.resumes import get_resume_document_service
from riva.models import User
from riva.schemas.resume_documents import (
    ResumeDocumentResponse,
    ResumeDocumentsResponse,
    SucceededResumeDocumentResponse,
)


TRUSTED_ORIGIN = "http://localhost:5173"
RESUME_ID = "11111111-1111-4111-8111-111111111111"


def create_user() -> User:
    return User(
        id=uuid4(),
        username="lia",
        normalized_username="lia",
        password_hash="hash",
        display_name="Lia",
    )


def response_document(
    *,
    resume_id: str = RESUME_ID,
) -> SucceededResumeDocumentResponse:
    return SucceededResumeDocumentResponse(
        id=resume_id,
        source_type="file",
        original_filename="resume.txt",
        media_type="text/plain",
        byte_size=4,
        uploaded_at=datetime(2026, 8, 5, tzinfo=UTC),
        extraction_status="succeeded",
        extracted_at=datetime(2026, 8, 5, tzinfo=UTC),
        failure_reason=None,
    )


class FakeResumeDocumentService:
    def __init__(self, *, error: APIError | None = None) -> None:
        self.error = error
        self.file_calls: list[dict[str, object]] = []
        self.text_calls: list[dict[str, object]] = []
        self.list_limits: list[int] = []
        self.detail_ids: list[object] = []
        self.file_response: ResumeDocumentResponse = response_document()
        self.text_response: ResumeDocumentResponse = response_document(
            resume_id="22222222-2222-4222-8222-222222222222"
        )

    async def create_file_document(self, user, **kwargs):
        self.file_calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.file_response

    async def create_pasted_text_document(self, user, **kwargs):
        self.text_calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.text_response

    async def list_documents(self, user, *, limit: int):
        self.list_limits.append(limit)
        if self.error is not None:
            raise self.error
        return ResumeDocumentsResponse(documents=[response_document()])

    async def get_document(self, user, resume_document_id):
        self.detail_ids.append(resume_document_id)
        if self.error is not None:
            raise self.error
        return response_document()


def create_resume_client(
    app,
    service: FakeResumeDocumentService,
) -> tuple[TestClient, User]:
    user = create_user()
    app.dependency_overrides[require_current_user] = lambda: user
    app.dependency_overrides[get_resume_document_service] = lambda: service
    return TestClient(app), user


def test_file_post_forwards_multipart_fields_and_closes_file(app) -> None:
    service = FakeResumeDocumentService()
    client, _user = create_resume_client(app, service)

    with client:
        response = client.post(
            "/api/profile/resumes",
            files={"file": ("resume.txt", b"resume", "text/plain")},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 201
    assert response.json()["extractionStatus"] == "succeeded"
    assert len(service.file_calls) == 1
    call = service.file_calls[0]
    file_obj = call["file_obj"]
    assert call["original_filename"] == "resume.txt"
    assert call["declared_media_type"] == "text/plain"
    assert isinstance(file_obj, io.IOBase)
    assert file_obj.closed is True


def test_pasted_text_post_uses_text_field(app) -> None:
    service = FakeResumeDocumentService()
    client, _user = create_resume_client(app, service)

    with client:
        response = client.post(
            "/api/profile/resumes",
            data={"text": "中文简历"},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 201
    assert service.text_calls == [{"text": "中文简历"}]
    assert service.file_calls == []


def test_file_and_nonempty_text_are_ambiguous_and_file_is_closed(app) -> None:
    service = FakeResumeDocumentService()
    client, _user = create_resume_client(app, service)

    with client:
        response = client.post(
            "/api/profile/resumes",
            data={"text": "also text"},
            files={"file": ("resume.txt", b"resume", "text/plain")},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 422
    assert response.json() == {"error": "resume_source_ambiguous"}
    assert service.file_calls == []


def test_missing_source_returns_fixed_error(app) -> None:
    service = FakeResumeDocumentService()
    client, _user = create_resume_client(app, service)

    with client:
        response = client.post(
            "/api/profile/resumes",
            data={"text": "  \n"},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 422
    assert response.json() == {"error": "resume_source_required"}


def test_post_requires_csrf_and_authentication(app) -> None:
    service = FakeResumeDocumentService()
    client, _user = create_resume_client(app, service)

    with client:
        csrf_response = client.post(
            "/api/profile/resumes",
            data={"text": "resume"},
        )
    assert csrf_response.status_code == 403
    assert service.text_calls == []

    app.dependency_overrides.pop(require_current_user)
    app.dependency_overrides[get_auth_service] = lambda: object()
    with TestClient(app) as unauthenticated_client:
        response = unauthenticated_client.post(
            "/api/profile/resumes",
            data={"text": "resume"},
            headers={"Origin": TRUSTED_ORIGIN},
        )
    assert response.status_code == 401


def test_json_body_is_not_accepted_as_text_upload(app) -> None:
    service = FakeResumeDocumentService()
    client, _user = create_resume_client(app, service)

    with client:
        response = client.post(
            "/api/profile/resumes",
            json={"text": "resume"},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 422
    assert service.text_calls == []
    assert service.file_calls == []


def test_service_errors_are_forwarded_without_sensitive_data(app) -> None:
    service = FakeResumeDocumentService(
        error=APIError(503, "resume_storage_unavailable")
    )
    client, _user = create_resume_client(app, service)

    with client:
        response = client.post(
            "/api/profile/resumes",
            data={"text": "resume"},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 503
    assert response.json() == {"error": "resume_storage_unavailable"}
    assert "storageKey" not in response.text


def test_list_route_uses_default_and_explicit_limit(app) -> None:
    service = FakeResumeDocumentService()
    client, _user = create_resume_client(app, service)

    with client:
        default_response = client.get("/api/profile/resumes")
        explicit_response = client.get("/api/profile/resumes?limit=7")

    assert default_response.status_code == 200
    assert explicit_response.status_code == 200
    assert service.list_limits == [20, 7]
    assert "extractedText" not in default_response.text


def test_list_route_validates_limit(app) -> None:
    service = FakeResumeDocumentService()
    client, _user = create_resume_client(app, service)

    with client:
        zero = client.get("/api/profile/resumes?limit=0")
        too_large = client.get("/api/profile/resumes?limit=101")

    assert zero.status_code == 422
    assert too_large.status_code == 422
    assert service.list_limits == []


def test_detail_route_uses_resume_id_alias_and_forwards_not_found(app) -> None:
    service = FakeResumeDocumentService(
        error=APIError(404, "resume_document_not_found")
    )
    client, _user = create_resume_client(app, service)

    with client:
        response = client.get(f"/api/profile/resumes/{RESUME_ID}")
        invalid = client.get("/api/profile/resumes/not-a-uuid")

    assert response.status_code == 404
    assert response.json() == {"error": "resume_document_not_found"}
    assert invalid.status_code == 422
    assert service.detail_ids == [UUID(RESUME_ID)]
