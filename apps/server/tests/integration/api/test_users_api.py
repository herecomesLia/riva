"""HTTP integration coverage for the current-user API."""

import pytest
from httpx import AsyncClient

from tests.support.assertions import assert_error_response
from tests.support.auth import ORIGIN_HEADERS, register_user
from tests.support.clock import Clock

SESSION_COOKIE = "riva_session"


async def test_get_current_user_requires_authentication(client: AsyncClient) -> None:
    response = await client.get("/api/users/me")

    assert_error_response(
        response,
        status_code=401,
        code="auth.not_authenticated",
        message="Authentication is required.",
    )


async def test_get_current_user_returns_authenticated_user(
    client: AsyncClient,
) -> None:
    registered = await register_user(client)

    response = await client.get("/api/users/me")

    assert response.status_code == 200
    assert response.json() == registered.json()


async def test_patch_current_user_persists_display_name(
    client: AsyncClient,
) -> None:
    await register_user(client)

    update_response = await client.patch(
        "/api/users/me",
        headers=ORIGIN_HEADERS,
        json={"displayName": "New Name"},
    )
    persisted_response = await client.get("/api/users/me")

    assert update_response.status_code == 200
    assert update_response.json()["displayName"] == "New Name"
    assert update_response.json()["avatarUrl"] is None
    assert persisted_response.status_code == 200
    assert persisted_response.json() == update_response.json()


async def test_patch_current_user_allows_empty_payload(client: AsyncClient) -> None:
    registered = await register_user(client)

    response = await client.patch(
        "/api/users/me",
        headers=ORIGIN_HEADERS,
        json={},
    )

    assert response.status_code == 200
    assert response.json() == registered.json()


async def test_patch_current_user_rejects_null_display_name(
    client: AsyncClient,
) -> None:
    await register_user(client)

    response = await client.patch(
        "/api/users/me",
        headers=ORIGIN_HEADERS,
        json={"displayName": None},
    )

    assert_error_response(
        response,
        status_code=422,
        code="request.validation_failed",
        message="Request validation failed.",
    )


async def test_patch_current_user_rejects_avatar_url(client: AsyncClient) -> None:
    await register_user(client)

    response = await client.patch(
        "/api/users/me",
        headers=ORIGIN_HEADERS,
        json={"avatarUrl": "https://example.test/avatar.png"},
    )

    assert_error_response(
        response,
        status_code=422,
        code="request.validation_failed",
        message="Request validation failed.",
    )


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("PUT", "/api/users/me/avatar"),
        ("DELETE", "/api/users/me/avatar"),
    ],
)
async def test_avatar_endpoints_are_not_implemented(
    client: AsyncClient,
    method: str,
    path: str,
) -> None:
    await register_user(client)

    response = await client.request(method, path, headers=ORIGIN_HEADERS)

    assert_error_response(
        response,
        status_code=501,
        code="request.not_implemented",
        message="This operation is not implemented.",
    )


async def test_invalid_session_is_rejected_and_cookie_is_deleted(
    client: AsyncClient,
) -> None:
    client.cookies.set(
        SESSION_COOKIE,
        "invalid-token",
        domain="testserver.local",
        path="/",
    )

    response = await client.get("/api/users/me")

    assert_error_response(
        response,
        status_code=401,
        code="auth.invalid_session",
        message="Session is invalid.",
    )
    assert SESSION_COOKIE not in client.cookies
    assert "Max-Age=0" in response.headers["Set-Cookie"]


async def test_session_refresh_reissues_same_cookie(
    client: AsyncClient,
    clock: Clock,
) -> None:
    await register_user(client)
    token = client.cookies.get(SESSION_COOKIE)
    clock.advance(seconds=300)

    response = await client.get("/api/users/me")

    assert response.status_code == 200
    assert "Set-Cookie" in response.headers
    assert client.cookies.get(SESSION_COOKIE) == token
