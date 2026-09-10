import asyncio
from collections.abc import AsyncIterator, Iterator
from uuid import UUID

import psycopg
import pytest
import structlog
from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from psycopg import sql
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from riva.core.app import create_app, wrap_cors
from riva.core.config import DatabaseSettings, Settings
from riva.db import Database
from riva.db.base import Base
from riva.models import User
from riva.models.target_role import JobDescription, TargetRole
from riva.services.users import UserService
from riva.tasks import setup_task_schema
from tests.support.clock import Clock
from tests.support.settings import TEST_ORIGIN, make_test_settings


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
def test_database_url(postgres_url: str, worker_id: str) -> str:
    url = make_url(postgres_url)
    database_name = f"riva_test_{worker_id}"
    with psycopg.connect(
        url.set(drivername="postgresql").render_as_string(hide_password=False),
        autocommit=True,
    ) as connection:
        connection.execute(
            sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name))
        )
    return url.set(database=database_name).render_as_string(hide_password=False)


async def _initialize_database(database_url: str) -> None:
    database = Database(DatabaseSettings(url=database_url))
    try:
        await database.reset()
        await setup_task_schema(database)
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
async def resettable_database(
    test_database_url: str, initialized_database: None
) -> AsyncIterator[Database]:
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
async def extraction_database(
    test_database_url: str, initialized_database: None
) -> AsyncIterator[Database]:
    # Worker and request transactions need independent connections and real commits.
    async with Database(DatabaseSettings(url=test_database_url)) as database:
        quote = database.engine.dialect.identifier_preparer.quote
        tables = [
            f"public.{quote(table.name)}" for table in Base.metadata.tables.values()
        ]
        tables.extend(
            ["procrastinate.procrastinate_jobs", "procrastinate.procrastinate_workers"]
        )
        # CASCADE also clears task events and periodic deferrals.
        truncate = text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE")
        try:
            async with database.engine.begin() as connection:
                await connection.execute(truncate)
            yield database
        finally:
            async with database.engine.begin() as connection:
                await connection.execute(truncate)


@pytest.fixture
async def extraction_role(extraction_database: Database) -> UUID:
    async with extraction_database.sessionmaker() as session:
        user = User(username="JDUser", password_hash="unused", display_name="JD User")
        session.add(user)
        await session.flush()
        role = TargetRole(
            user_id=user.id,
            title="Engineer",
            jd=JobDescription(responsibilities=["Original"], soft_skills=["Teamwork"]),
        )
        session.add(role)
        await session.commit()
        return role.id


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
