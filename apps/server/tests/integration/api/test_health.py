from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import AsyncClient


@pytest.mark.parametrize(
    (
        "database_available",
        "llm_available",
        "expected_status_code",
        "expected_body",
    ),
    [
        (
            True,
            True,
            200,
            {"status": "ok", "database": "ok", "llm": "ok"},
        ),
        (
            False,
            True,
            503,
            {
                "status": "unhealthy",
                "database": "unavailable",
                "llm": "ok",
            },
        ),
        (
            True,
            False,
            503,
            {"status": "unhealthy", "database": "ok", "llm": "unavailable"},
        ),
        (
            False,
            False,
            503,
            {
                "status": "unhealthy",
                "database": "unavailable",
                "llm": "unavailable",
            },
        ),
    ],
)
async def test_health_reports_dependency_state(
    client: AsyncClient,
    app: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
    database_available: bool,
    llm_available: bool,
    expected_status_code: int,
    expected_body: dict[str, str],
) -> None:
    monkeypatch.setattr(
        app.state.database,
        "check_health",
        AsyncMock(return_value=database_available),
    )
    monkeypatch.setattr(
        app.state.llm,
        "check_health",
        AsyncMock(return_value=llm_available),
    )

    response = await client.get("/api/health")

    assert response.status_code == expected_status_code
    assert response.json() == expected_body
