from copy import deepcopy
from typing import Any
from uuid import UUID, uuid4

from fastapi import status
from fastapi.testclient import TestClient

from riva.core.auth import get_auth_service, require_current_user
from riva.core.errors import APIError
from riva.core.profile import get_career_profile_service
from riva.models import User
from riva.schemas.profile import (
    CareerProfilePutRequest,
    CareerProfileResponse,
)

TRUSTED_ORIGIN = "http://localhost:5173"
EDUCATION_ID = "11111111-1111-4111-8111-111111111111"
WORK_ID = "22222222-2222-4222-8222-222222222222"
PROJECT_ID = "33333333-3333-4333-8333-333333333333"
SKILL_ID = "44444444-4444-4444-8444-444444444444"
PROFILE_ID = "55555555-5555-4555-8555-555555555555"


def put_payload(*, version: int | None = None) -> dict[str, Any]:
    return {
        "version": version,
        "summary": "  Backend engineer  ",
        "education": [
            {
                "id": EDUCATION_ID,
                "school": "Tongji University",
                "degree": "Master",
                "major": "Software Engineering",
                "startDate": "2018-09",
                "endDate": "2021-06",
                "isCurrent": False,
            }
        ],
        "workExperiences": [
            {
                "id": WORK_ID,
                "company": "Riva",
                "title": "Backend Engineer",
                "employmentType": "fullTime",
                "location": "Shanghai",
                "startDate": "2021-07",
                "endDate": None,
                "isCurrent": True,
                "responsibilities": ["Build APIs"],
                "achievements": [],
                "skillIds": [SKILL_ID],
            }
        ],
        "projectExperiences": [
            {
                "id": PROJECT_ID,
                "name": "Career Profile",
                "role": "Developer",
                "startDate": "2026-07",
                "endDate": None,
                "responsibilities": ["Designed the API"],
                "achievements": [],
                "skillIds": [SKILL_ID],
                "projectUrl": "https://example.com/profile",
            }
        ],
        "skills": [{"id": SKILL_ID, "name": "Python"}],
    }


def response_profile(*, version: int = 1) -> CareerProfileResponse:
    payload = CareerProfilePutRequest.model_validate(put_payload(version=None))
    content = payload.model_dump(mode="json", by_alias=True, exclude={"version"})
    for section in (
        content["education"],
        content["workExperiences"],
        content["projectExperiences"],
        content["skills"],
    ):
        for item in section:
            item["source"] = "userAdded"
    return CareerProfileResponse.model_validate(
        {
            "profileId": PROFILE_ID,
            "version": version,
            "updatedAt": "2026-07-29T08:30:00Z",
            **content,
        }
    )


class FakeCareerProfileService:
    def __init__(
        self,
        profile: CareerProfileResponse | None = None,
        *,
        replace_error: APIError | None = None,
    ) -> None:
        self.profile = profile
        self.replace_error = replace_error
        self.replacements: list[CareerProfilePutRequest] = []

    async def get_profile(self, user: User) -> CareerProfileResponse | None:
        return self.profile

    async def replace_profile(
        self,
        user: User,
        payload: CareerProfilePutRequest,
    ) -> CareerProfileResponse:
        self.replacements.append(payload)
        if self.replace_error is not None:
            raise self.replace_error
        self.profile = response_profile(
            version=1 if payload.version is None else payload.version + 1
        )
        return self.profile


def create_user() -> User:
    return User(
        id=uuid4(),
        username="lia",
        normalized_username="lia",
        password_hash="hash",
        display_name="Lia",
    )


def create_profile_client(
    app,
    profile_service: FakeCareerProfileService,
) -> tuple[TestClient, User]:
    user = create_user()
    app.dependency_overrides[require_current_user] = lambda: user
    app.dependency_overrides[get_career_profile_service] = lambda: profile_service
    return TestClient(app), user


def test_get_profile_requires_authentication(app) -> None:
    app.dependency_overrides[get_auth_service] = lambda: object()

    with TestClient(app) as client:
        response = client.get("/api/profile")

    assert response.status_code == 401
    assert response.json() == {"error": "not_authenticated"}


def test_put_profile_requires_authentication(app) -> None:
    app.dependency_overrides[get_auth_service] = lambda: object()

    with TestClient(app) as client:
        response = client.put(
            "/api/profile",
            json=put_payload(),
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 401
    assert response.json() == {"error": "not_authenticated"}


def test_get_profile_returns_null_envelope_when_missing(app) -> None:
    service = FakeCareerProfileService()
    client, _user = create_profile_client(app, service)

    with client:
        response = client.get("/api/profile")

    assert response.status_code == 200
    assert response.json() == {"profile": None}


def test_get_profile_returns_complete_envelope_without_account_fields(app) -> None:
    service = FakeCareerProfileService(response_profile())
    client, _user = create_profile_client(app, service)

    with client:
        response = client.get("/api/profile")

    assert response.status_code == 200
    profile = response.json()["profile"]
    assert profile["profileId"] == PROFILE_ID
    assert profile["workExperiences"][0]["skillIds"] == [SKILL_ID]
    assert profile["projectExperiences"][0]["source"] == "userAdded"
    assert "username" not in profile
    assert "displayName" not in profile
    assert "avatarUrl" not in profile


def test_put_profile_creates_and_normalizes_payload(app) -> None:
    service = FakeCareerProfileService()
    client, _user = create_profile_client(app, service)

    with client:
        response = client.put(
            "/api/profile",
            json=put_payload(),
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 200
    assert response.json()["profile"]["version"] == 1
    assert service.replacements[0].summary == "Backend engineer"
    assert service.replacements[0].skills[0].id == UUID(SKILL_ID)


def test_put_profile_updates_and_increments_version(app) -> None:
    service = FakeCareerProfileService(response_profile())
    client, _user = create_profile_client(app, service)

    with client:
        response = client.put(
            "/api/profile",
            json=put_payload(version=1),
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 200
    assert response.json()["profile"]["version"] == 2
    assert service.replacements[0].version == 1


def test_put_profile_returns_version_conflict(app) -> None:
    service = FakeCareerProfileService(
        response_profile(),
        replace_error=APIError(
            status.HTTP_409_CONFLICT,
            "profile_version_conflict",
        ),
    )
    client, _user = create_profile_client(app, service)

    with client:
        response = client.put(
            "/api/profile",
            json=put_payload(version=99),
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 409
    assert response.json() == {"error": "profile_version_conflict"}


def test_put_profile_requires_trusted_origin(app) -> None:
    service = FakeCareerProfileService(response_profile())
    client, _user = create_profile_client(app, service)

    with client:
        response = client.put("/api/profile", json=put_payload(version=1))

    assert response.status_code == 403
    assert response.json() == {"error": "csrf_failed"}
    assert service.replacements == []


def test_put_profile_rejects_invalid_input(app) -> None:
    service = FakeCareerProfileService()
    client, _user = create_profile_client(app, service)
    payload = deepcopy(put_payload())
    payload["workExperiences"][0]["skillIds"] = [str(uuid4())]

    with client:
        response = client.put(
            "/api/profile",
            json=payload,
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 422
    assert service.replacements == []
