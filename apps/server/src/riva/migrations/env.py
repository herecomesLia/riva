import asyncio

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from riva.db.base import Base
from riva.db.database import load_models


config = context.config
load_models()
target_metadata = Base.metadata


def _database_url() -> str:
    database_url = config.attributes.get("database_url")
    if not isinstance(database_url, str) or not database_url.strip():
        raise RuntimeError(
            "Alembic migration database URL must be provided through "
            "Config.attributes['database_url']."
        )
    return database_url


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        autogenerate_plugins=[
            "alembic.autogenerate.*",
            "~alembic.autogenerate.checkconstraint_byname",
        ],
    )

    with context.begin_transaction():
        context.run_migrations()


def _run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        autogenerate_plugins=[
            "alembic.autogenerate.*",
            "~alembic.autogenerate.checkconstraint_byname",
        ],
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable: AsyncEngine = create_async_engine(
        _database_url(),
        poolclass=pool.NullPool,
    )
    try:
        async with connectable.connect() as connection:
            await connection.run_sync(_run_migrations)
    finally:
        await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
