from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager, nullcontext
from unittest.mock import AsyncMock, Mock

import pytest

from riva.core.config import DatabaseSettings
from riva.db import Database
from riva.llm import LLMClient
from riva.tasks import TaskResources
from riva.tasks.core import worker
from tests.support.settings import make_test_settings


@pytest.mark.parametrize("fails", [False, True])
async def test_worker_resource_lifecycle(
    monkeypatch: pytest.MonkeyPatch, fails: bool
) -> None:
    settings = make_test_settings()
    database = Database(settings.database)
    original_dispose = database.dispose
    llm = LLMClient(settings.llm)
    practice_round_agent = Mock()
    checkpointer = Mock()
    checkpointer_closed = Mock()

    @asynccontextmanager
    async def open_checkpointer(database_url: str) -> AsyncGenerator[Mock]:
        assert database_url == settings.database.url
        try:
            yield checkpointer
        finally:
            checkpointer_closed()

    def create_practice_round_agent(client: LLMClient, saver: object) -> Mock:
        assert client is llm
        assert saver is checkpointer
        return practice_round_agent

    monkeypatch.setattr("riva.ai.checkpoints.open_checkpointer", open_checkpointer)
    monkeypatch.setattr(
        "riva.ai.practice.PracticeRoundAgent", create_practice_round_agent
    )

    dispose_mock = AsyncMock(wraps=original_dispose)
    monkeypatch.setattr(database, "dispose", dispose_mock)
    llm_close = AsyncMock(wraps=llm.close)
    monkeypatch.setattr(llm, "close", llm_close)

    def create_database(database_settings: DatabaseSettings) -> Database:
        assert database_settings is settings.database
        return database

    def create_llm(llm_settings: object) -> LLMClient:
        assert llm_settings is settings.llm
        return llm

    @asynccontextmanager
    async def open_app() -> AsyncGenerator[None]:
        try:
            yield
        finally:
            assert dispose_mock.await_count == 1
            llm_close.assert_awaited_once_with()
            checkpointer_closed.assert_called_once_with()

    failure = RuntimeError("worker failed")

    async def run(**kwargs: object) -> None:
        assert kwargs["additional_context"] == {
            "resources": TaskResources(database, llm, practice_round_agent)
        }
        if fails:
            raise failure

    app = Mock(
        replace_connector=Mock(return_value=nullcontext()),
        open_async=open_app,
        check_connection_async=AsyncMock(return_value=True),
        run_worker_async=AsyncMock(side_effect=run),
    )
    monkeypatch.setattr("riva.db.Database", create_database)
    monkeypatch.setattr("riva.llm.LLMClient", create_llm)
    monkeypatch.setattr(worker, "app", app)

    if fails:
        with pytest.raises(RuntimeError) as exc_info:
            await worker.run_worker(settings, queues=("default",))
        assert exc_info.value is failure
    else:
        await worker.run_worker(settings, queues=("default",))

    dispose_mock.assert_awaited_once_with()
    llm_close.assert_awaited_once_with()
