import pytest
from httpx import AsyncClient

from riva.db import Database
from riva.db.errors import DatabaseUnavailableError


async def test_health_reports_real_database_as_healthy(client: AsyncClient) -> None:
    response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


async def test_health_reports_database_unavailable(
    client: AsyncClient,
    database: Database,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def unavailable() -> None:
        raise DatabaseUnavailableError("injected database failure")

    monkeypatch.setattr(database, "ping", unavailable)

    response = await client.get("/api/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "unhealthy",
        "database": "unavailable",
    }
