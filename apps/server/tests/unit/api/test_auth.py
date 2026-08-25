from dataclasses import dataclass, field
from uuid import uuid4

from fastapi.testclient import TestClient

from riva.api.deps import get_user_service
from riva.api.errors import APIError
from riva.models import User
from riva.services.users import AuthenticationResult, CurrentSession

TRUSTED_ORIGIN = "http://localhost:5173"
SAME_ORIGIN = "http://testserver"


@dataclass
class FakeUserService:
    users: dict[str, User] = field(default_factory=dict)
    tokens: dict[str, User] = field(default_factory=dict)
    revoked_tokens: set[str] = field(default_factory=set)
    refresh_tokens: set[str] = field(default_factory=set)
    logout_tokens: list[str | None] = field(default_factory=list)
    counter: int = 0

    async def register(self, username: str, password: str) -> AuthenticationResult:
        normalized_username = username.lower()
        if normalized_username in self.users:
            raise APIError(409, "username_taken")

        user = User(
            id=uuid4(),
            username=username,
            normalized_username=normalized_username,
            password_hash="hashed-password",
            display_name=username,
            avatar_url=None,
        )
        self.users[normalized_username] = user
        token = self._new_token("register")
        self.tokens[token] = user
        return AuthenticationResult(user=user, token=token)

    async def login(
        self,
        username: str,
        password: str,
        *,
        current_token: str | None = None,
    ) -> AuthenticationResult:
        normalized_username = username.lower()
        if normalized_username not in self.users or password != "correct-password":
            raise APIError(401, "invalid_credentials")
        if current_token in self.tokens:
            self.revoked_tokens.add(current_token)

        token = self._new_token("login")
        self.tokens[token] = self.users[normalized_username]
        return AuthenticationResult(
            user=self.users[normalized_username],
            token=token,
        )

    async def get_current_session(self, token: str) -> CurrentSession:
        if token == "expired-token":
            raise APIError(401, "session_expired", clear_session_cookie=True)
        if token == "disabled-token":
            raise APIError(403, "account_disabled", clear_session_cookie=True)
        if token not in self.tokens or token in self.revoked_tokens:
            raise APIError(401, "invalid_session", clear_session_cookie=True)

        return CurrentSession(
            user=self.tokens[token],
            token=token,
            refreshed=token in self.refresh_tokens,
        )

    async def logout(self, token: str | None) -> None:
        self.logout_tokens.append(token)
        if token in self.tokens:
            self.revoked_tokens.add(token)

    def _new_token(self, prefix: str) -> str:
        self.counter += 1
        return f"{prefix}-token-{self.counter}"


def create_auth_client(app) -> tuple[TestClient, FakeUserService]:
    user_service = FakeUserService()
    app.dependency_overrides[get_user_service] = lambda: user_service
    return TestClient(app), user_service


def test_register_sets_cookie_and_me_returns_current_user(app) -> None:
    client, _user_service = create_auth_client(app)

    with client:
        register_response = client.post(
            "/api/auth/register",
            json={"username": "New_User-1", "password": "correct-password"},
            headers={"Origin": TRUSTED_ORIGIN},
        )
        me_response = client.get("/api/users/me")

    assert register_response.status_code == 201
    assert set(register_response.json()) == {
        "id",
        "username",
        "displayName",
        "avatarUrl",
    }
    assert register_response.json()["username"] == "New_User-1"
    assert register_response.json()["displayName"] == "New_User-1"
    assert register_response.json()["avatarUrl"] is None
    assert "riva_session=" in register_response.headers["set-cookie"]
    assert "HttpOnly" in register_response.headers["set-cookie"]
    assert "Max-Age=604800" in register_response.headers["set-cookie"]
    assert "SameSite=lax" in register_response.headers["set-cookie"]
    assert me_response.status_code == 200
    assert me_response.json()["username"] == "New_User-1"


def test_register_rejects_duplicate_username(app) -> None:
    client, _user_service = create_auth_client(app)

    with client:
        first_response = client.post(
            "/api/auth/register",
            json={"username": "New-User", "password": "correct-password"},
            headers={"Origin": TRUSTED_ORIGIN},
        )
        second_response = client.post(
            "/api/auth/register",
            json={"username": "new-user", "password": "correct-password"},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json() == {"error": "username_taken"}


def test_register_rejects_usernames_shorter_than_four_chars(app) -> None:
    client, _user_service = create_auth_client(app)

    with client:
        response = client.post(
            "/api/auth/register",
            json={"username": "abc", "password": "correct-password"},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "username"]


def test_login_keeps_invalid_username_as_invalid_credentials(app) -> None:
    client, _user_service = create_auth_client(app)

    with client:
        response = client.post(
            "/api/auth/login",
            json={"username": "abc", "password": "short"},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 401
    assert response.json() == {"error": "invalid_credentials"}


def test_login_sets_cookie_and_revokes_current_browser_session(app) -> None:
    client, user_service = create_auth_client(app)

    with client:
        client.post(
            "/api/auth/register",
            json={"username": "new-user", "password": "correct-password"},
            headers={"Origin": TRUSTED_ORIGIN},
        )
        old_token = client.cookies["riva_session"]
        login_response = client.post(
            "/api/auth/login",
            json={"username": "new-user", "password": "correct-password"},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert login_response.status_code == 200
    assert set(login_response.json()) == {
        "id",
        "username",
        "displayName",
        "avatarUrl",
    }
    assert login_response.json()["displayName"] == "new-user"
    assert login_response.json()["avatarUrl"] is None
    assert login_response.cookies["riva_session"] != old_token
    assert old_token in user_service.revoked_tokens


def test_login_invalid_credentials_returns_simple_json_error(app) -> None:
    client, _user_service = create_auth_client(app)

    with client:
        response = client.post(
            "/api/auth/login",
            json={"username": "missing-user", "password": "wrong-password"},
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 401
    assert response.json() == {"error": "invalid_credentials"}


def test_me_requires_cookie(app) -> None:
    client, _user_service = create_auth_client(app)

    with client:
        response = client.get("/api/users/me")

    assert response.status_code == 401
    assert response.json() == {"error": "not_authenticated"}


def test_auth_me_endpoint_is_removed(app) -> None:
    client, _user_service = create_auth_client(app)

    with client:
        response = client.get("/api/auth/me")

    assert response.status_code == 404


def test_me_clears_invalid_cookie(app) -> None:
    client, _user_service = create_auth_client(app)
    client.cookies.set("riva_session", "missing-token")

    with client:
        response = client.get("/api/users/me")

    assert response.status_code == 401
    assert response.json() == {"error": "invalid_session"}
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert "Path=/" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]


def test_logout_without_cookie_returns_204_and_clears_cookie(app) -> None:
    client, user_service = create_auth_client(app)

    with client:
        response = client.post(
            "/api/auth/logout",
            headers={"Origin": TRUSTED_ORIGIN},
        )

    assert response.status_code == 204
    assert user_service.logout_tokens == [None]
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert "Path=/" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]


def test_logout_revokes_valid_session(app) -> None:
    client, user_service = create_auth_client(app)

    with client:
        client.post(
            "/api/auth/register",
            json={"username": "new-user", "password": "correct-password"},
            headers={"Origin": TRUSTED_ORIGIN},
        )
        token = client.cookies["riva_session"]
        logout_response = client.post(
            "/api/auth/logout",
            headers={"Origin": TRUSTED_ORIGIN},
        )
        me_response = client.get("/api/users/me")

    assert logout_response.status_code == 204
    assert token in user_service.revoked_tokens
    assert me_response.status_code == 401
    assert me_response.json() == {"error": "not_authenticated"}


def test_me_clears_expired_and_disabled_sessions(app) -> None:
    client, _user_service = create_auth_client(app)

    with client:
        client.cookies.set("riva_session", "expired-token")
        expired_response = client.get("/api/users/me")
        client.cookies.set("riva_session", "disabled-token")
        disabled_response = client.get("/api/users/me")

    assert expired_response.status_code == 401
    assert expired_response.json() == {"error": "session_expired"}
    assert "Max-Age=0" in expired_response.headers["set-cookie"]
    assert disabled_response.status_code == 403
    assert disabled_response.json() == {"error": "account_disabled"}
    assert "Max-Age=0" in disabled_response.headers["set-cookie"]


def test_me_refreshes_cookie_when_session_is_refreshed(app) -> None:
    client, user_service = create_auth_client(app)

    with client:
        client.post(
            "/api/auth/register",
            json={"username": "new-user", "password": "correct-password"},
            headers={"Origin": TRUSTED_ORIGIN},
        )
        token = client.cookies["riva_session"]
        user_service.refresh_tokens.add(token)
        response = client.get("/api/users/me")

    assert response.status_code == 200
    assert "Max-Age=604800" in response.headers["set-cookie"]


def test_auth_unsafe_methods_require_trusted_origin(app) -> None:
    client, _user_service = create_auth_client(app)

    with client:
        missing_origin_response = client.post(
            "/api/auth/register",
            json={"username": "new-user", "password": "correct-password"},
        )
        untrusted_origin_response = client.post(
            "/api/auth/register",
            json={"username": "new-user", "password": "correct-password"},
            headers={"Origin": "http://evil.example"},
        )

    assert missing_origin_response.status_code == 403
    assert missing_origin_response.json() == {"error": "csrf_failed"}
    assert untrusted_origin_response.status_code == 403
    assert untrusted_origin_response.json() == {"error": "csrf_failed"}


def test_auth_csrf_allows_same_origin_and_trusted_referer(app) -> None:
    client, _user_service = create_auth_client(app)

    with client:
        same_origin_response = client.post(
            "/api/auth/register",
            json={"username": "same-origin", "password": "correct-password"},
            headers={"Origin": SAME_ORIGIN},
        )
        trusted_referer_response = client.post(
            "/api/auth/register",
            json={"username": "referer-user", "password": "correct-password"},
            headers={"Referer": f"{TRUSTED_ORIGIN}/signup"},
        )

    assert same_origin_response.status_code == 201
    assert trusted_referer_response.status_code == 201


def test_auth_csrf_rejects_untrusted_referer(app) -> None:
    client, _user_service = create_auth_client(app)

    with client:
        response = client.post(
            "/api/auth/register",
            json={"username": "new-user", "password": "correct-password"},
            headers={"Referer": "http://evil.example/signup"},
        )

    assert response.status_code == 403
    assert response.json() == {"error": "csrf_failed"}


def test_options_preflight_is_not_blocked_by_csrf(app) -> None:
    client, _user_service = create_auth_client(app)

    with client:
        response = client.options(
            "/api/auth/register",
            headers={
                "Origin": TRUSTED_ORIGIN,
                "Access-Control-Request-Method": "POST",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == TRUSTED_ORIGIN
