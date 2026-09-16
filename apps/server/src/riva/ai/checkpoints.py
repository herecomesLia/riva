from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from sqlalchemy.engine import make_url


@asynccontextmanager
async def open_checkpointer(database_url: str) -> AsyncGenerator[AsyncPostgresSaver]:
    url = make_url(database_url)
    if url.drivername != "postgresql+psycopg":
        raise ValueError("Checkpoints require a postgresql+psycopg database URL.")
    async with AsyncConnectionPool(
        conninfo=url.set(drivername="postgresql").render_as_string(hide_password=False),
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        open=False,
    ) as pool:
        await pool.wait()
        yield AsyncPostgresSaver(pool)


async def setup_checkpoints(database_url: str) -> None:
    # Saver migrations require autocommit. Tables live in public, so db reset
    # removes checkpoints together with the business records they describe.
    async with open_checkpointer(database_url) as checkpointer:
        await checkpointer.setup()
