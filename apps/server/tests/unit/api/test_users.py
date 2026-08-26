from uuid import uuid4

from fastapi.testclient import TestClient

from riva.api.deps import get_user_service, require_current_user
from riva.models import User
from tests.helpers.assertions import assert_error_response

TRUSTED_ORIGIN = "http://localhost:5173"


class FakeUserService:
    def __init__(self) -> None:
        self.changes: list[dict[str, str | None]] = []

    async def update_profile(
        self,
        user: User,
        changes: dict[str, str | None],
    ) -> User:
        self.changes.append(changes)
        for field, value in changes.items():
            setattr(user, field, value)
        return user


def create_user() -> User:
    return User(
        id=uuid4(),
        username="lia",
        normalized_username="lia",
        password_hash="hash",
        display_name="Lia",
        avatar_url=None,
    )


def create_users_client(app) -> tuple[TestClient, FakeUserService, User]:
    user_service = FakeUserService()
    user = create_user()
    app.dependency_overrides[require_current_user] = lambda: user
    app.dependency_overrides[get_user_service] = lambda: user_service
    return TestClient(app), user_service, user


def test_get_current_user_profile_requires_authentication(app) -> None:
    app.dependency_overrides[get_user_service] = lambda: object()

    with TestClient(app) as client:
        response = client.get("/api/users/me")

    assert_error_response(
        response,
        status_code=401,
        code="auth.not_authenticated",
        message="Authentication is required.",
    )


def test_get_current_user_profile(app) -> None:
    client, _user_service, user = create_users_client(app)

    with client:
        response = client.get("/api/users/me")

    assert response.status_code == 200
    assert response.json() == {
        "id": str(user.id),
        "username": "lia",
        "displayName": "Lia",
        "avatarUrl": None,
    }


def test_patch_current_user_profile(app) -> None:
    client, user_service, _user = create_users_client(app)

    with client:
        response = client.patch(
            "/api/users/me",
            json={
                "displayName": "  Lia Chen  ",
                "avatarUrl": "https://example.com/avatar.png",
            },
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 200
    assert set(response.json()) == {
        "id",
        "username",
        "displayName",
        "avatarUrl",
    }
    assert response.json()["displayName"] == "Lia Chen"
    assert response.json()["avatarUrl"] == "https://example.com/avatar.png"
    assert user_service.changes == [
        {
            "display_name": "Lia Chen",
            "avatar_url": "https://example.com/avatar.png",
        }
    ]


def test_patch_current_user_profile_preserves_omitted_fields(app) -> None:
    client, user_service, _user = create_users_client(app)

    with client:
        response = client.patch(
            "/api/users/me",
            json={"avatarUrl": None},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 200
    assert response.json()["displayName"] == "Lia"
    assert user_service.changes == [{"avatar_url": None}]


def test_patch_current_user_profile_requires_trusted_origin(app) -> None:
    client, user_service, _user = create_users_client(app)

    with client:
        response = client.patch(
            "/api/users/me",
            json={"displayName": "Lia Chen"},
        )

    assert_error_response(
        response,
        status_code=403,
        code="request.csrf_failed",
        message="CSRF validation failed.",
    )
    assert user_service.changes == []
