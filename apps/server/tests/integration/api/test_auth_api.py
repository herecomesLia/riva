"""HTTP integration coverage for the authentication API."""

from uuid import UUID

from httpx import AsyncClient

from tests.support.assertions import assert_error_response
from tests.support.auth import (
    DEFAULT_PASSWORD,
    DEFAULT_USERNAME,
    ORIGIN_HEADERS,
    register_user,
)

SESSION_COOKIE = "riva_session"


async def test_register_returns_user_and_sets_session_cookie(
    client: AsyncClient,
) -> None:
    response = await client.post(
        "/api/auth/register",
        headers=ORIGIN_HEADERS,
        json={"username": DEFAULT_USERNAME, "password": DEFAULT_PASSWORD},
    )

    assert response.status_code == 201
    body = response.json()
    assert str(UUID(body["id"])) == body["id"]
    assert body == {
        "id": body["id"],
        "username": DEFAULT_USERNAME,
        "displayName": DEFAULT_USERNAME,
        "avatarUrl": None,
    }
    assert "password" not in response.text
    assert "passwordHash" not in response.text
    assert client.cookies.get(SESSION_COOKIE)


async def test_duplicate_register_returns_username_taken(
    client: AsyncClient,
) -> None:
    await register_user(client, username="TestUser")

    response = await client.post(
        "/api/auth/register",
        headers=ORIGIN_HEADERS,
        json={"username": "testuser", "password": DEFAULT_PASSWORD},
    )

    assert_error_response(
        response,
        status_code=409,
        code="auth.username_taken",
        message="Username is already registered.",
    )


async def test_auth_router_enforces_csrf(client: AsyncClient) -> None:
    response = await client.post(
        "/api/auth/register",
        json={"username": DEFAULT_USERNAME, "password": DEFAULT_PASSWORD},
    )

    assert_error_response(
        response,
        status_code=403,
        code="request.csrf_failed",
        message="CSRF validation failed.",
    )


async def test_login_returns_user_and_replaces_cookie(client: AsyncClient) -> None:
    await register_user(client)
    previous_token = client.cookies.get(SESSION_COOKIE)

    response = await client.post(
        "/api/auth/login",
        headers=ORIGIN_HEADERS,
        json={"username": DEFAULT_USERNAME, "password": DEFAULT_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["username"] == DEFAULT_USERNAME
    assert client.cookies.get(SESSION_COOKIE) != previous_token


async def test_login_rejects_invalid_credentials(client: AsyncClient) -> None:
    await register_user(client)

    response = await client.post(
        "/api/auth/login",
        headers=ORIGIN_HEADERS,
        json={"username": DEFAULT_USERNAME, "password": "WrongPass123!"},
    )

    assert_error_response(
        response,
        status_code=401,
        code="auth.invalid_credentials",
        message="Invalid username or password.",
    )


async def test_logout_deletes_cookie_and_invalidates_authentication(
    client: AsyncClient,
) -> None:
    await register_user(client)

    logout_response = await client.post(
        "/api/auth/logout",
        headers=ORIGIN_HEADERS,
    )

    assert logout_response.status_code == 204
    assert SESSION_COOKIE not in client.cookies

    current_user_response = await client.get("/api/users/me")
    assert_error_response(
        current_user_response,
        status_code=401,
        code="auth.not_authenticated",
        message="Authentication is required.",
    )
