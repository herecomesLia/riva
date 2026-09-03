from uuid import uuid4

from httpx import AsyncClient

from tests.support.assertions import assert_error_response
from tests.support.auth import ORIGIN_HEADERS


async def test_request_validation_returns_structured_issues(
    client: AsyncClient,
) -> None:
    response = await client.post(
        "/api/auth/register",
        headers=ORIGIN_HEADERS,
        json={"username": "abc", "password": "123"},
    )

    body = assert_error_response(
        response,
        status_code=422,
        code="request.validation_failed",
        message="Request validation failed.",
    )
    locations = {tuple(issue["location"]) for issue in body["error"]["issues"]}
    assert ("body", "username") in locations
    assert ("body", "password") in locations


async def test_extra_request_field_returns_validation_error(
    client: AsyncClient,
) -> None:
    response = await client.post(
        "/api/auth/register",
        headers=ORIGIN_HEADERS,
        json={
            "username": "testuser",
            "password": "Abcd1234",
            "unexpected": "value",
        },
    )

    body = assert_error_response(
        response,
        status_code=422,
        code="request.validation_failed",
        message="Request validation failed.",
    )

    assert any(
        issue["location"] == ["body", "unexpected"] for issue in body["error"]["issues"]
    )


async def test_not_found_returns_standard_error_response(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/not-exist")

    body = assert_error_response(
        response,
        status_code=404,
        code="request.not_found",
        message="The requested endpoint was not found.",
    )
    assert body["error"]["issues"] == []


async def test_method_not_allowed_returns_standard_error_response(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/auth/login")

    assert_error_response(
        response,
        status_code=405,
        code="request.method_not_allowed",
        message="The HTTP method is not allowed for this endpoint.",
    )


async def test_server_generates_request_id_header(client: AsyncClient) -> None:
    response = await client.get("/api/not-exist")

    assert response.headers["X-Request-ID"]
    assert "requestId" not in response.json()


async def test_valid_client_request_id_is_preserved(client: AsyncClient) -> None:
    request_id = str(uuid4())

    response = await client.get(
        "/api/not-exist",
        headers={"X-Request-ID": request_id},
    )

    assert response.headers["X-Request-ID"] == request_id
    assert "requestId" not in response.json()
