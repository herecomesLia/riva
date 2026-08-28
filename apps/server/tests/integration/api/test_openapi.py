"""OpenAPI contract tests for RIVA.

Only test RIVA-owned public API invariants here.
Do not test FastAPI/Pydantic defaults, generated metadata, or full OpenAPI snapshots.
Prefer invariant-based checks over endpoint-by-endpoint duplication.
"""

from riva.core.app import create_app
from tests.support.settings import make_test_settings

ERROR_RESPONSE_REF = "#/components/schemas/ErrorResponse"
HTTP_METHODS = {"delete", "get", "head", "options", "patch", "post", "put", "trace"}

# Representative composition cases, not an exhaustive endpoint inventory.
EXPECTED_ERROR_RESPONSES = {
    ("/api/auth/register", "post"): {"403", "409", "422", "500"},
    ("/api/users/me", "get"): {"401", "403", "500"},
    ("/api/health", "get"): {"500", "503"},
    ("/api/career-profile", "post"): {"401", "403", "409", "422", "500"},
}

ERROR_RESPONSE_EXCEPTIONS = {
    ("/api/health", "get", "503"): "#/components/schemas/HealthResponse",
}


def test_router_response_composition_preserves_declared_errors() -> None:
    schema = create_app(make_test_settings()).openapi()

    for (path, method), expected_statuses in EXPECTED_ERROR_RESPONSES.items():
        responses = schema["paths"][path][method]["responses"]

        assert expected_statuses <= responses.keys()


def test_error_responses_use_public_error_schema() -> None:
    schema = create_app(make_test_settings()).openapi()

    for path, path_item in schema["paths"].items():
        for method, operation in path_item.items():
            if method not in HTTP_METHODS:
                continue

            for status_code, response in operation["responses"].items():
                if not 400 <= int(status_code) < 600:
                    continue

                expected_ref = ERROR_RESPONSE_EXCEPTIONS.get(
                    (path, method, status_code),
                    ERROR_RESPONSE_REF,
                )
                response_schema = response["content"]["application/json"]["schema"]

                assert response_schema.get("$ref") == expected_ref, (
                    f"{method.upper()} {path} -> {status_code} must reference "
                    f"{expected_ref}"
                )


def test_validated_operations_declare_public_422_error() -> None:
    schema = create_app(make_test_settings()).openapi()

    for path, path_item in schema["paths"].items():
        for method, operation in path_item.items():
            if method not in HTTP_METHODS:
                continue
            if "requestBody" not in operation and not operation.get("parameters"):
                continue

            response = operation["responses"].get("422")

            assert response is not None, (
                f"{method.upper()} {path} accepts validated input but does not declare 422"
            )
            response_schema = response["content"]["application/json"]["schema"]
            assert response_schema.get("$ref") == ERROR_RESPONSE_REF, (
                f"{method.upper()} {path} -> 422 must reference {ERROR_RESPONSE_REF}"
            )
