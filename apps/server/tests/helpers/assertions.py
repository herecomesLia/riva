def assert_error_response(
    response,
    *,
    status_code: int,
    code: str,
    message: str,
) -> None:
    assert response.status_code == status_code
    payload = response.json()
    assert payload["error"] == {
        "code": code,
        "message": message,
    }
    assert isinstance(payload["requestId"], str)
    assert payload["requestId"]
    assert response.headers["x-request-id"] == payload["requestId"]
