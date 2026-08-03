from uuid import UUID, uuid4

from fastapi import status
from fastapi.testclient import TestClient
import pytest

from riva.core.auth import get_auth_service, require_current_user
from riva.core.errors import APIError
from riva.core.roles import get_target_role_service
from riva.models import User
from riva.schemas.roles import RolesPageResponse, TargetRoleResponse

TRUSTED_ORIGIN = "http://localhost:5173"
ROLE_ID = UUID("11111111-1111-4111-8111-111111111111")


def empty_page() -> RolesPageResponse:
    return RolesPageResponse.model_validate(
        {
            "roles": [],
            "currentRoleId": None,
            "profileContext": {
                "exists": False,
                "version": None,
                "completed": False,
            },
        }
    )


def target_role() -> TargetRoleResponse:
    return TargetRoleResponse.model_validate(
        {
            "id": str(ROLE_ID),
            "title": "Backend Engineer",
            "company": None,
            "recruitmentType": None,
            "location": None,
            "experienceRange": None,
            "preparationStatus": "preparing",
            "createdAt": "2026-07-29T08:00:00Z",
            "updatedAt": "2026-07-29T08:00:00Z",
            "version": 2,
            "jobDescription": {
                "status": "saved",
                "rawText": "Build APIs.",
                "version": 1,
                "parsingFailureReason": None,
            },
            "jobDescriptionAnalysis": None,
            "matchingAnalysis": None,
        }
    )


def create_payload() -> dict[str, object]:
    return {
        "title": "Backend Engineer",
        "company": "Riva",
        "recruitmentType": "experienced",
        "location": "Shanghai",
        "experienceRange": {"minYears": 2, "maxYears": 5},
        "preparationStatus": "preparing",
    }


def update_payload() -> dict[str, object]:
    payload = create_payload()
    payload.pop("preparationStatus")
    payload["version"] = 1
    return payload


def analysis_update_payload() -> dict[str, object]:
    return {
        "version": 2,
        "jobDescriptionVersion": 1,
        "analysisVersion": 1,
        "field": "responsibilities",
        "value": ["Design APIs"],
    }


class FakeTargetRoleService:
    def __init__(self, error: APIError | None = None) -> None:
        self.error = error
        self.calls: list[tuple[str, tuple[object, ...]]] = []

    async def _result(self, method: str, *args: object) -> RolesPageResponse:
        self.calls.append((method, args))
        if self.error is not None:
            raise self.error
        return empty_page()

    async def get_roles_page(self, user):
        return await self._result("get", user)

    async def create_role(self, user, payload):
        return await self._result("create", user, payload)

    async def update_role(self, user, role_id, payload):
        return await self._result("update", user, role_id, payload)

    async def set_current_role(self, user, role_id, payload):
        return await self._result("current", user, role_id, payload)

    async def update_preparation_status(self, user, role_id, payload):
        return await self._result("status", user, role_id, payload)

    async def archive_role(self, user, role_id, payload):
        return await self._result("archive", user, role_id, payload)

    async def delete_role(self, user, role_id, version):
        return await self._result("delete", user, role_id, version)

    async def save_job_description(self, user, role_id, payload):
        return await self._result("jd", user, role_id, payload)

    async def update_job_description_analysis_module(
        self, user, role_id, payload
    ):
        return await self._result("analysis", user, role_id, payload)

    async def start_job_description_parsing(self, user, role_id, payload):
        return await self._result("start-parsing", user, role_id, payload)

    async def get_job_description_parsing_status(self, user, role_id, query):
        self.calls.append(("parsing-status", (user, role_id, query)))
        if self.error is not None:
            raise self.error
        return target_role()


def user() -> User:
    return User(
        id=uuid4(),
        username="lia",
        normalized_username="lia",
        password_hash="hash",
        display_name="Lia",
    )


def roles_client(app, service: FakeTargetRoleService) -> TestClient:
    app.dependency_overrides[require_current_user] = user
    app.dependency_overrides[get_target_role_service] = lambda: service
    return TestClient(app)


@pytest.mark.parametrize(
    "method,url,json",
    [
        ("get", "/api/roles", None),
        ("post", "/api/roles", create_payload()),
        ("patch", f"/api/roles/{ROLE_ID}", update_payload()),
        ("put", f"/api/roles/{ROLE_ID}/current", {"version": 1}),
        (
            "patch",
            f"/api/roles/{ROLE_ID}/preparation-status",
            {"version": 1, "preparationStatus": "paused"},
        ),
        ("post", f"/api/roles/{ROLE_ID}/archive", {"version": 1}),
        ("delete", f"/api/roles/{ROLE_ID}?version=1", None),
        (
            "put",
            f"/api/roles/{ROLE_ID}/job-description",
            {"version": 1, "rawText": "Build APIs."},
        ),
        (
            "patch",
            f"/api/roles/{ROLE_ID}/job-description/analysis",
            analysis_update_payload(),
        ),
        (
            "post",
            f"/api/roles/{ROLE_ID}/job-description/parsing",
            {"version": 2, "jobDescriptionVersion": 1},
        ),
        (
            "get",
            f"/api/roles/{ROLE_ID}/job-description/parsing"
            "?version=2&jobDescriptionVersion=1",
            None,
        ),
    ],
)
def test_roles_endpoints_require_authentication(app, method, url, json) -> None:
    app.dependency_overrides[get_auth_service] = lambda: object()

    with TestClient(app) as client:
        response = client.request(
            method,
            url,
            json=json,
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 401
    assert response.json() == {"error": "not_authenticated"}


def test_get_empty_roles_page(app) -> None:
    service = FakeTargetRoleService()

    with roles_client(app, service) as client:
        response = client.get("/api/roles")

    assert response.status_code == 200
    assert response.json() == empty_page().model_dump(mode="json")
    assert service.calls[0][0] == "get"


def test_create_returns_201_and_passes_normalized_request(app) -> None:
    service = FakeTargetRoleService()

    with roles_client(app, service) as client:
        response = client.post(
            "/api/roles",
            json={**create_payload(), "title": "  Backend Engineer  "},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 201
    request = service.calls[0][1][1]
    assert request.title == "Backend Engineer"


def test_start_parsing_returns_202_and_status_get_returns_role(app) -> None:
    service = FakeTargetRoleService()
    path = f"/api/roles/{ROLE_ID}/job-description/parsing"

    with roles_client(app, service) as client:
        started = client.post(
            path,
            json={"version": 2, "jobDescriptionVersion": 1},
            headers={"Origin": TRUSTED_ORIGIN},
        )
        polled = client.get(
            f"{path}?version=2&jobDescriptionVersion=1"
        )

    assert started.status_code == 202
    assert service.calls[0][0] == "start-parsing"
    assert service.calls[0][1][2].job_description_version == 1
    assert polled.status_code == 200
    assert polled.json() == target_role().model_dump(mode="json")
    assert service.calls[1][0] == "parsing-status"


@pytest.mark.parametrize(
    "method,url,payload,expected_call",
    [
        ("patch", f"/api/roles/{ROLE_ID}", update_payload(), "update"),
        ("put", f"/api/roles/{ROLE_ID}/current", {"version": 1}, "current"),
        (
            "patch",
            f"/api/roles/{ROLE_ID}/preparation-status",
            {"version": 1, "preparationStatus": "paused"},
            "status",
        ),
        (
            "post",
            f"/api/roles/{ROLE_ID}/archive",
            {"version": 1},
            "archive",
        ),
        ("delete", f"/api/roles/{ROLE_ID}?version=1", None, "delete"),
        (
            "put",
            f"/api/roles/{ROLE_ID}/job-description",
            {"version": 1, "rawText": "Build APIs."},
            "jd",
        ),
        (
            "patch",
            f"/api/roles/{ROLE_ID}/job-description/analysis",
            analysis_update_payload(),
            "analysis",
        ),
    ],
)
def test_mutation_routes_return_page_and_forward_path_role(
    app,
    method,
    url,
    payload,
    expected_call,
) -> None:
    service = FakeTargetRoleService()

    with roles_client(app, service) as client:
        response = client.request(
            method,
            url,
            json=payload,
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 200
    assert service.calls[0][0] == expected_call
    assert service.calls[0][1][1] == ROLE_ID


@pytest.mark.parametrize(
    "method,url,payload",
    [
        ("post", "/api/roles", create_payload()),
        ("patch", f"/api/roles/{ROLE_ID}", update_payload()),
        ("put", f"/api/roles/{ROLE_ID}/current", {"version": 1}),
        (
            "patch",
            f"/api/roles/{ROLE_ID}/preparation-status",
            {"version": 1, "preparationStatus": "paused"},
        ),
        ("post", f"/api/roles/{ROLE_ID}/archive", {"version": 1}),
        ("delete", f"/api/roles/{ROLE_ID}?version=1", None),
        (
            "put",
            f"/api/roles/{ROLE_ID}/job-description",
            {"version": 1, "rawText": "Build APIs."},
        ),
        (
            "patch",
            f"/api/roles/{ROLE_ID}/job-description/analysis",
            analysis_update_payload(),
        ),
        (
            "post",
            f"/api/roles/{ROLE_ID}/job-description/parsing",
            {"version": 2, "jobDescriptionVersion": 1},
        ),
    ],
)
def test_all_mutations_require_csrf(app, method, url, payload) -> None:
    service = FakeTargetRoleService()

    with roles_client(app, service) as client:
        response = client.request(method, url, json=payload)

    assert response.status_code == 403
    assert response.json() == {"error": "csrf_failed"}
    assert service.calls == []


@pytest.mark.parametrize(
    "method,url,payload",
    [
        ("post", "/api/roles", {**create_payload(), "userId": str(uuid4())}),
        (
            "patch",
            f"/api/roles/{ROLE_ID}",
            {**update_payload(), "userId": str(uuid4())},
        ),
        (
            "patch",
            f"/api/roles/{ROLE_ID}/preparation-status",
            {"version": 1, "preparationStatus": "archived"},
        ),
        ("delete", f"/api/roles/{ROLE_ID}?version=0", None),
        (
            "post",
            f"/api/roles/{ROLE_ID}/job-description/parsing",
            {"version": 2, "jobDescriptionVersion": 0},
        ),
        (
            "patch",
            f"/api/roles/{ROLE_ID}/job-description/analysis",
            {**analysis_update_payload(), "rivaSummary": "forbidden"},
        ),
        (
            "get",
            f"/api/roles/{ROLE_ID}/job-description/parsing"
            "?version=0&jobDescriptionVersion=1",
            None,
        ),
        (
            "get",
            "/api/roles/not-a-uuid/job-description/parsing"
            "?version=1&jobDescriptionVersion=1",
            None,
        ),
    ],
)
def test_roles_api_rejects_invalid_input(app, method, url, payload) -> None:
    service = FakeTargetRoleService()

    with roles_client(app, service) as client:
        response = client.request(
            method,
            url,
            json=payload,
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 422
    assert service.calls == []


def test_analysis_update_route_forwards_discriminated_request(app) -> None:
    service = FakeTargetRoleService()

    with roles_client(app, service) as client:
        response = client.patch(
            f"/api/roles/{ROLE_ID}/job-description/analysis",
            json=analysis_update_payload(),
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 200
    assert service.calls[0][0] == "analysis"
    assert service.calls[0][1][1] == ROLE_ID
    assert service.calls[0][1][2].field == "responsibilities"


@pytest.mark.parametrize(
    "error,status_code",
    [
        ("target_role_not_found", status.HTTP_404_NOT_FOUND),
        ("target_role_version_conflict", status.HTTP_409_CONFLICT),
        ("target_role_state_conflict", status.HTTP_409_CONFLICT),
    ],
)
def test_role_errors_keep_stable_error_contract(app, error, status_code) -> None:
    service = FakeTargetRoleService(APIError(status_code, error))

    with roles_client(app, service) as client:
        response = client.put(
            f"/api/roles/{ROLE_ID}/current",
            json={"version": 1},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == status_code
    assert response.json() == {"error": error}
