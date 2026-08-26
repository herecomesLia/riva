from typing import Any

from httpx import Response


def assert_error_response(
    response: Response,
    *,
    status_code: int,
    code: str,
    message: str,
) -> dict[str, Any]:
    assert response.status_code == status_code

    body = response.json()
    assert body["error"]["code"] == code
    assert body["error"]["message"] == message

    request_id = body["requestId"]
    assert request_id
    assert response.headers["X-Request-ID"] == request_id
    return body
