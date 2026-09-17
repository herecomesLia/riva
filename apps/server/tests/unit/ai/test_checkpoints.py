from contextlib import asynccontextmanager
from unittest.mock import AsyncMock
from uuid import uuid4

from riva.ai.checkpoints import delete_checkpoints


async def test_delete_checkpoints_is_best_effort(monkeypatch):
    saver = AsyncMock()
    saver.adelete_thread.side_effect = RuntimeError("Storage unavailable")

    @asynccontextmanager
    async def open_checkpointer(url):
        yield saver

    monkeypatch.setattr("riva.ai.checkpoints.open_checkpointer", open_checkpointer)
    round_id = uuid4()
    await delete_checkpoints("unused", [round_id])
    saver.adelete_thread.assert_awaited_once_with(str(round_id))
