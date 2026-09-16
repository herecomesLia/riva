from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import TYPE_CHECKING

import procrastinate

from riva.core.config import Settings
from riva.tasks.errors import TaskError

if TYPE_CHECKING:
    from riva.ai.practice import PracticeAgent
    from riva.db import Database
    from riva.llm import LLMClient


@dataclass(slots=True)
class TaskResources:
    database: Database
    llm: LLMClient
    practice_agent: PracticeAgent


@asynccontextmanager
async def task_resources(settings: Settings) -> AsyncGenerator[TaskResources]:
    from riva.ai.checkpoints import open_checkpointer
    from riva.ai.practice import PracticeAgent
    from riva.db import Database
    from riva.llm import LLMClient

    async with (
        Database(settings.database) as database,
        LLMClient(settings.llm) as llm,
        open_checkpointer(settings.database.url) as checkpointer,
    ):
        yield TaskResources(
            database=database,
            llm=llm,
            practice_agent=PracticeAgent(llm, checkpointer),
        )


def get_task_resources(context: procrastinate.JobContext) -> TaskResources:
    resources = context.additional_context.get("resources")
    if not isinstance(resources, TaskResources):
        # Missing worker setup is a runtime error, not an invalid task argument.
        raise TaskError("Riva task resources are missing or invalid in JobContext.")
    return resources
