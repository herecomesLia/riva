from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager, nullcontext
from unittest.mock import AsyncMock, Mock

import pytest

from riva.db import Database
from riva.llm import LLMClient
from riva.tasks import TaskResources
from riva.tasks.core import context, worker
from tests.support.settings import make_test_settings


@pytest.mark.parametrize("fails", [False, True])
async def test_worker_resource_lifecycle(
    monkeypatch: pytest.MonkeyPatch, fails: bool
) -> None:
    events = []
    settings = make_test_settings()
    database = Database(settings.database_url)
    original_dispose = database.dispose
    llm = LLMClient(settings.llm)

    async def dispose() -> None:
        events.append("dispose")
        await original_dispose()

    monkeypatch.setattr(database, "dispose", dispose)
    llm_close = AsyncMock(wraps=llm.close)
    monkeypatch.setattr(llm, "close", llm_close)

    def create_database(database_url: str) -> Database:
        assert database_url == settings.database_url
        events.append("resources")
        return database

    def create_llm(llm_settings: object) -> LLMClient:
        assert llm_settings is settings.llm
        return llm

    @asynccontextmanager
    async def open_app() -> AsyncGenerator[None]:
        events.append("open")
        try:
            yield
        finally:
            events.append("close")

    async def check_connection() -> bool:
        events.append("schema")
        return True

    failure = RuntimeError("worker failed")

    async def run(**kwargs: object) -> None:
        events.append("worker")
        assert kwargs == {
            "queues": ("default",),
            "concurrency": settings.tasks.concurrency,
            "shutdown_graceful_timeout": settings.tasks.shutdown_timeout_seconds,
            "additional_context": {"resources": TaskResources(database, llm)},
        }
        if fails:
            raise failure

    app = Mock(
        replace_connector=Mock(return_value=nullcontext()),
        open_async=open_app,
        check_connection_async=AsyncMock(side_effect=check_connection),
        run_worker_async=AsyncMock(side_effect=run),
    )
    monkeypatch.setattr(context, "Database", create_database)
    monkeypatch.setattr(context, "LLMClient", create_llm)
    monkeypatch.setattr(worker, "app", app)
    monkeypatch.setattr(
        worker, "configure_task_registry", lambda app: events.append("registry")
    )
    monkeypatch.setattr(
        worker, "create_task_connector", lambda url: events.append("connector")
    )

    if fails:
        with pytest.raises(RuntimeError) as exc_info:
            await worker.run_worker(settings, queues=("default",))
        assert exc_info.value is failure
    else:
        await worker.run_worker(settings, queues=("default",))

    assert events == [
        "registry",
        "connector",
        "open",
        "schema",
        "resources",
        "worker",
        "dispose",
        "close",
    ]
    llm_close.assert_awaited_once_with()
