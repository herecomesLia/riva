from httpx import AsyncClient

from riva.db import Database


async def test_database_fixture_connects(database: Database) -> None:
    await database.ping()


async def test_http_client_starts_application(client: AsyncClient) -> None:
    response = await client.get("/openapi.json")

    assert response.status_code == 200
