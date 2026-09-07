from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import AsyncClient

from riva.schemas.health import HealthStatus


@pytest.mark.parametrize(
    (
        "database_available",
        "llm_status",
        "expected_status_code",
        "expected_body",
    ),
    [
        (
            True,
            HealthStatus.ok,
            200,
            {"status": "ok", "database": "ok", "llm": "ok"},
        ),
        (
            False,
            HealthStatus.ok,
            503,
            {
                "status": "unavailable",
                "database": "unavailable",
                "llm": "ok",
            },
        ),
        (
            True,
            HealthStatus.unavailable,
            200,
            {"status": "degraded", "database": "ok", "llm": "unavailable"},
        ),
        (
            False,
            HealthStatus.unavailable,
            503,
            {
                "status": "unavailable",
                "database": "unavailable",
                "llm": "unavailable",
            },
        ),
        (
            True,
            HealthStatus.degraded,
            200,
            {"status": "degraded", "database": "ok", "llm": "degraded"},
        ),
    ],
)
async def test_health_reports_dependency_state(
    client: AsyncClient,
    app: FastAPI,
    monkeypatch: pytest.MonkeyPatch,
    database_available: bool,
    llm_status: HealthStatus,
    expected_status_code: int,
    expected_body: dict[str, str],
) -> None:
    monkeypatch.setattr(
        app.state.database,
        "check_health",
        AsyncMock(
            return_value=HealthStatus.ok
            if database_available
            else HealthStatus.unavailable
        ),
    )
    monkeypatch.setattr(
        app.state.llm,
        "check_health",
        AsyncMock(return_value=llm_status),
    )

    response = await client.get("/api/health")

    assert response.status_code == expected_status_code
    assert response.json() == expected_body
