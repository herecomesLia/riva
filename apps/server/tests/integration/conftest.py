import asyncio
from collections.abc import AsyncIterator, Iterator

import pytest
import structlog
from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from testcontainers.community.postgres import PostgresContainer

from riva.core.app import create_app, wrap_cors
from riva.core.config import DatabaseSettings, Settings
from riva.db import Database
from riva.services.users import UserService
from tests.support.clock import Clock
from tests.support.settings import TEST_ORIGIN, make_test_settings

POSTGRES_IMAGE = "postgres:18-alpine"


class _NoopLogger:
    def info(self, *_args: object, **_kwargs: object) -> None:
        pass

    def error(self, *_args: object, **_kwargs: object) -> None:
        pass


@pytest.fixture(autouse=True)
def disable_request_logging() -> Iterator[None]:
    with pytest.MonkeyPatch.context() as monkeypatch:
        original_get_logger = structlog.get_logger
        noop_logger = _NoopLogger()

        def get_logger(*args: object, **kwargs: object) -> object:
            if args and args[0] == "riva.request":
                return noop_logger
            return original_get_logger(*args, **kwargs)

        monkeypatch.setattr(structlog, "get_logger", get_logger)
        yield


@pytest.fixture(scope="session")
def postgres_container() -> Iterator[PostgresContainer]:
    with PostgresContainer(POSTGRES_IMAGE, driver="psycopg") as postgres:
        yield postgres


@pytest.fixture(scope="session")
def test_database_url(postgres_container: PostgresContainer) -> str:
    return postgres_container.get_connection_url()


async def _initialize_database(database_url: str) -> None:
    database = Database(DatabaseSettings(url=database_url))
    try:
        await database.reset()
    finally:
        await database.dispose()


@pytest.fixture(scope="session")
def initialized_database(test_database_url: str) -> None:
    asyncio.run(_initialize_database(test_database_url))


@pytest.fixture
async def database(
    test_database_url: str,
    initialized_database: None,
) -> AsyncIterator[Database]:
    test_database = Database(DatabaseSettings(url=test_database_url))
    try:
        async with test_database.engine.connect() as connection:
            transaction = await connection.begin()
            test_database.sessionmaker = async_sessionmaker(
                bind=connection,
                expire_on_commit=False,
                join_transaction_mode="create_savepoint",
            )
            try:
                yield test_database
            finally:
                if transaction.is_active:
                    await transaction.rollback()
    finally:
        await test_database.dispose()


@pytest.fixture
async def resettable_database(test_database_url: str) -> AsyncIterator[Database]:
    test_database = Database(DatabaseSettings(url=test_database_url))
    try:
        await test_database.reset()
        yield test_database
    finally:
        try:
            await test_database.reset()
        finally:
            await test_database.dispose()


@pytest.fixture
async def db_session(database: Database) -> AsyncIterator[AsyncSession]:
    async with database.sessionmaker() as session:
        yield session


@pytest.fixture
def settings(test_database_url: str) -> Settings:
    return make_test_settings(database=DatabaseSettings(url=test_database_url))


@pytest.fixture
def user_service(db_session: AsyncSession, settings: Settings) -> UserService:
    return UserService(db_session, settings)


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> Clock:
    test_clock = Clock()
    monkeypatch.setattr("riva.services.users.utc_now", test_clock)
    return test_clock


@pytest.fixture
async def app(settings: Settings, database: Database) -> FastAPI:
    application = create_app(settings)

    # Replace create_app's database before lifespan starts so every request uses
    # the function-scoped database and transaction for this test.
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
