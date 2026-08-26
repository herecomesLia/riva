from fastapi.testclient import TestClient
from pydantic import BaseModel
from starlette.exceptions import HTTPException

from riva.api.deps import get_user_service
from riva.db.errors import DatabaseUnavailableError
from tests.helpers.assertions import assert_error_response


def test_missing_route_returns_not_found_error_response(client) -> None:
    response = client.get("/api/does-not-exist")

    assert_error_response(
        response,
        status_code=404,
        code="request.not_found",
        message="The requested endpoint was not found.",
    )


def test_wrong_method_returns_method_not_allowed_and_preserves_allow_header(
    client,
) -> None:
    response = client.get("/api/auth/login")

    assert_error_response(
        response,
        status_code=405,
        code="request.method_not_allowed",
        message="The HTTP method is not allowed for this endpoint.",
    )
    assert "POST" in response.headers["allow"]


def test_request_validation_returns_safe_stable_issues(app) -> None:
    app.dependency_overrides[get_user_service] = lambda: object()

    with TestClient(app) as client:
        response = client.post(
            "/api/auth/register",
            json={"username": "valid-user", "password": "p@ss"},
            headers={"Origin": "http://localhost:5173"},
        )

    payload = response.json()
    assert response.status_code == 422
    assert payload["error"] == {
        "code": "request.validation_failed",
        "message": "Request validation failed.",
        "issues": [
            {
                "location": ["body", "password"],
                "message": "String should have at least 8 characters",
            }
        ],
    }
    assert set(payload) == {"error", "requestId"}
    assert payload["requestId"] == response.headers["x-request-id"]
    assert "input" not in response.text
    assert "ctx" not in response.text
    assert "p@ss" not in response.text


def test_database_unavailable_returns_dependency_error_response(app) -> None:
    async def database_error() -> None:
        raise DatabaseUnavailableError("database password=secret")

    app.add_api_route("/test-errors/database", database_error)

    with TestClient(app) as client:
        response = client.get("/test-errors/database")

    assert_error_response(
        response,
        status_code=503,
        code="dependency.database_unavailable",
        message="Database is temporarily unavailable.",
    )
    assert "database password=secret" not in response.text


class ExpectedResponse(BaseModel):
    value: int


def test_response_validation_returns_internal_error_response(app) -> None:
    async def invalid_response() -> dict[str, str]:
        return {"value": "not-an-integer"}

    app.add_api_route(
        "/test-errors/response-validation",
        invalid_response,
        response_model=ExpectedResponse,
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/test-errors/response-validation")

    assert_error_response(
        response,
        status_code=500,
        code="server.internal_error",
        message="An internal server error occurred.",
    )
    assert "not-an-integer" not in response.text


def test_unknown_exception_returns_internal_error_response(app) -> None:
    async def unknown_error() -> None:
        raise RuntimeError("sensitive internal detail")

    app.add_api_route("/test-errors/unknown", unknown_error)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/test-errors/unknown")

    assert_error_response(
        response,
        status_code=500,
        code="server.internal_error",
        message="An internal server error occurred.",
    )
    assert "sensitive internal detail" not in response.text


def test_http_exception_fallback_preserves_status_and_hides_detail(app) -> None:
    async def http_error() -> None:
        raise HTTPException(
            status_code=418,
            detail="sensitive HTTP detail",
            headers={"X-Test-Header": "preserved"},
        )

    app.add_api_route("/test-errors/http", http_error)

    with TestClient(app) as client:
        response = client.get("/test-errors/http")

    assert_error_response(
        response,
        status_code=418,
        code="request.http_error",
        message="Request failed.",
    )
    assert response.headers["x-test-header"] == "preserved"
    assert "sensitive HTTP detail" not in response.text
