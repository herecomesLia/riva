from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient

from riva.core.auth import get_auth_service, require_current_user
from riva.core.errors import APIError
from riva.core.profile import get_profile_service
from riva.models import Profile, User

TRUSTED_ORIGIN = "http://localhost:5173"


def profile_content() -> dict[str, Any]:
    return {
        "summary": "Backend engineer",
        "education": [
            {
                "id": "education_1",
                "source": "userAdded",
                "school": "Tongji University",
                "degree": "Master",
                "major": "Software Engineering",
                "start_date": "2018-09",
                "end_date": "2021-06",
                "is_current": False,
            }
        ],
        "work_experiences": [
            {
                "id": "work_1",
                "source": "userAdded",
                "company": "Riva",
                "title": "Backend Engineer",
                "employment_type": "fullTime",
                "location": "Shanghai",
                "start_date": "2021-07",
                "end_date": None,
                "is_current": True,
                "responsibilities": ["Build APIs"],
                "achievements": [],
                "skill_ids": ["skill_python"],
            }
        ],
        "project_experiences": [],
        "skills": [
            {
                "id": "skill_python",
                "source": "userAdded",
                "name": "Python",
            }
        ],
    }


def create_user() -> User:
    return User(
        id=uuid4(),
        username="lia",
        normalized_username="lia",
        password_hash="hash",
        display_name="Lia",
    )


def create_profile(user: User) -> Profile:
    now = datetime(2026, 7, 28, tzinfo=UTC)
    return Profile(
        profile_id=uuid4(),
        user_id=user.id,
        version=1,
        created_at=now,
        updated_at=now,
        **profile_content(),
    )


class FakeProfileService:
    def __init__(self, profile: Profile | None = None) -> None:
        self.profile = profile
        self.replacements: list[dict[str, Any]] = []

    async def get_profile(self, user: User) -> Profile:
        if self.profile is None:
            raise APIError(status.HTTP_404_NOT_FOUND, "profile_not_found")
        return self.profile

    async def replace_profile(
        self,
        user: User,
        content: dict[str, Any],
    ) -> Profile:
        self.replacements.append(content)
        if self.profile is None:
            self.profile = create_profile(user)
        for field, value in content.items():
            setattr(self.profile, field, value)
        return self.profile


def create_profile_client(
    app,
    *,
    with_profile: bool,
) -> tuple[TestClient, FakeProfileService, User]:
    user = create_user()
    profile_service = FakeProfileService(
        create_profile(user) if with_profile else None
    )
    app.dependency_overrides[require_current_user] = lambda: user
    app.dependency_overrides[get_profile_service] = lambda: profile_service
    return TestClient(app), profile_service, user


def put_payload() -> dict[str, Any]:
    return {
        "summary": "  Backend engineer  ",
        "education": [
            {
                "id": "education_1",
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
                "id": "work_1",
                "company": "Riva",
                "title": "Backend Engineer",
                "employmentType": "fullTime",
                "location": "Shanghai",
                "startDate": "2021-07",
                "endDate": None,
                "isCurrent": True,
                "responsibilities": ["Build APIs"],
                "achievements": [],
                "skillIds": ["skill_python"],
            }
        ],
        "projectExperiences": [],
        "skills": [{"id": "skill_python", "name": "Python"}],
    }


def test_profile_requires_authentication(app) -> None:
    app.dependency_overrides[get_auth_service] = lambda: object()

    with TestClient(app) as client:
        response = client.get("/api/profile")

    assert response.status_code == 401
    assert response.json() == {"error": "not_authenticated"}


def test_get_profile_returns_current_users_profile(app) -> None:
    client, _profile_service, _user = create_profile_client(
        app,
        with_profile=True,
    )

    with client:
        response = client.get("/api/profile")

    assert response.status_code == 200
    assert response.json()["summary"] == "Backend engineer"
    assert response.json()["education"][0]["school"] == "Tongji University"
    assert response.json()["workExperiences"][0]["skillIds"] == ["skill_python"]
    assert response.json()["skills"][0]["source"] == "userAdded"
    assert response.json()["version"] == 1


def test_get_profile_returns_not_found_when_profile_does_not_exist(app) -> None:
    client, _profile_service, _user = create_profile_client(
        app,
        with_profile=False,
    )

    with client:
        response = client.get("/api/profile")

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}


def test_put_profile_replaces_all_profile_content(app) -> None:
    client, profile_service, _user = create_profile_client(
        app,
        with_profile=False,
    )

    with client:
        response = client.put(
            "/api/profile",
            json=put_payload(),
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 200
    assert response.json()["summary"] == "Backend engineer"
    assert response.json()["workExperiences"][0]["employmentType"] == "fullTime"
    assert response.json()["profileId"]
    assert profile_service.replacements[0]["summary"] == "Backend engineer"
    assert profile_service.replacements[0]["work_experiences"][0]["skill_ids"] == [
        "skill_python"
    ]


def test_put_profile_requires_trusted_origin(app) -> None:
    client, profile_service, _user = create_profile_client(
        app,
        with_profile=True,
    )

    with client:
        response = client.put("/api/profile", json=put_payload())

    assert response.status_code == 403
    assert response.json() == {"error": "csrf_failed"}
    assert profile_service.replacements == []
