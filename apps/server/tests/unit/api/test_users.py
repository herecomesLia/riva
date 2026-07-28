from uuid import uuid4

from fastapi.testclient import TestClient

from riva.core.auth import get_auth_service, require_current_user
from riva.core.users import get_users_service
from riva.models import User

TRUSTED_ORIGIN = "http://localhost:5173"


class FakeUsersService:
    def __init__(self) -> None:
        self.changes: list[dict[str, str | None]] = []

    def get_profile(self, user: User) -> User:
        return user

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


def create_users_client(app) -> tuple[TestClient, FakeUsersService, User]:
    users_service = FakeUsersService()
    user = create_user()
    app.dependency_overrides[require_current_user] = lambda: user
    app.dependency_overrides[get_users_service] = lambda: users_service
    return TestClient(app), users_service, user


def test_get_current_user_profile_requires_authentication(app) -> None:
    app.dependency_overrides[get_auth_service] = lambda: object()

    with TestClient(app) as client:
        response = client.get("/api/users/me")

    assert response.status_code == 401
    assert response.json() == {"error": "not_authenticated"}


def test_get_current_user_profile(app) -> None:
    client, _users_service, user = create_users_client(app)

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
    client, users_service, _user = create_users_client(app)

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
    assert response.json()["displayName"] == "Lia Chen"
    assert response.json()["avatarUrl"] == "https://example.com/avatar.png"
    assert users_service.changes == [
        {
            "display_name": "Lia Chen",
            "avatar_url": "https://example.com/avatar.png",
        }
    ]


def test_patch_current_user_profile_preserves_omitted_fields(app) -> None:
    client, users_service, _user = create_users_client(app)

    with client:
        response = client.patch(
            "/api/users/me",
            json={"avatarUrl": None},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 200
    assert response.json()["displayName"] == "Lia"
    assert users_service.changes == [{"avatar_url": None}]


def test_patch_current_user_profile_requires_trusted_origin(app) -> None:
    client, users_service, _user = create_users_client(app)

    with client:
        response = client.patch(
            "/api/users/me",
            json={"displayName": "Lia Chen"},
        )

    assert response.status_code == 403
    assert response.json() == {"error": "csrf_failed"}
    assert users_service.changes == []
