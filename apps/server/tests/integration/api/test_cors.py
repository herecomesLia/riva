from fastapi import FastAPI
from httpx import AsyncClient

from riva.api.deps import get_user_service
from tests.support.assertions import assert_error_response
from tests.support.auth import DEFAULT_PASSWORD, DEFAULT_USERNAME, ORIGIN_HEADERS
from tests.support.settings import TEST_ORIGIN


async def test_allowed_origin_receives_cors_headers(client: AsyncClient) -> None:
    response = await client.get(
        "/api/health",
        headers={"Origin": TEST_ORIGIN},
    )

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == TEST_ORIGIN
    assert response.headers["Access-Control-Allow-Credentials"] == "true"


async def test_preflight_receives_cors_headers(client: AsyncClient) -> None:
    response = await client.options(
        "/api/auth/login",
        headers={
            "Origin": TEST_ORIGIN,
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == TEST_ORIGIN
    assert response.headers["Access-Control-Allow-Credentials"] == "true"
    assert "POST" in response.headers["Access-Control-Allow-Methods"]


async def test_disallowed_origin_does_not_receive_allow_origin_header(
    client: AsyncClient,
) -> None:
    response = await client.get(
        "/api/health",
        headers={"Origin": "https://evil.test"},
    )

    assert response.status_code == 200
    assert "Access-Control-Allow-Origin" not in response.headers


async def test_unhandled_error_keeps_cors_and_hides_internal_detail(
    app: FastAPI,
    client: AsyncClient,
) -> None:
    async def fail_user_service() -> None:
        raise RuntimeError("internal-secret")

    app.dependency_overrides[get_user_service] = fail_user_service

    response = await client.post(
        "/api/auth/register",
        headers=ORIGIN_HEADERS,
        json={"username": DEFAULT_USERNAME, "password": DEFAULT_PASSWORD},
    )

    assert_error_response(
        response,
        status_code=500,
        code="server.internal_error",
        message="An internal server error occurred.",
    )
    assert "internal-secret" not in response.text
    assert response.headers["Access-Control-Allow-Origin"] == TEST_ORIGIN
