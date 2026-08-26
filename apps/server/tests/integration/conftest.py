from collections.abc import AsyncIterator, Iterator

import pytest
from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from testcontainers.community.postgres import PostgresContainer

from riva.core.app import create_app, wrap_cors
from riva.db import Database
from tests.support.settings import TEST_ORIGIN, make_test_settings

POSTGRES_IMAGE = "postgres:18-alpine"


@pytest.fixture(scope="session")
def postgres_container() -> Iterator[PostgresContainer]:
    with PostgresContainer(POSTGRES_IMAGE, driver="asyncpg") as postgres:
        yield postgres


@pytest.fixture(scope="session")
def test_database_url(postgres_container: PostgresContainer) -> str:
    return postgres_container.get_connection_url()


@pytest.fixture
async def database(test_database_url: str) -> AsyncIterator[Database]:
    test_database = Database(test_database_url)
    try:
        await test_database.reset()
        yield test_database
    finally:
        await test_database.dispose()


@pytest.fixture
async def db_session(database: Database) -> AsyncIterator[AsyncSession]:
    async with database.sessionmaker() as session:
        yield session


@pytest.fixture
async def app(
    test_database_url: str,
    database: Database,
) -> FastAPI:
    settings = make_test_settings(database_url=test_database_url)
    application = create_app(settings)

    # Replace create_app's database before lifespan starts so every request uses
    # the function-scoped database that was reset for this test.
    application_database: Database = application.state.database
    application.state.database = database
    await application_database.dispose()
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    asgi_app = wrap_cors(app, app.state.settings)
    async with LifespanManager(asgi_app) as manager:
        transport = ASGITransport(
            app=manager.app,
            raise_app_exceptions=False,
        )
        async with AsyncClient(
            transport=transport,
            base_url=TEST_ORIGIN,
        ) as http_client:
            yield http_client
