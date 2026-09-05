from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass

import procrastinate

from riva.core.config import Settings
from riva.db import Database
from riva.llm import LLMClient
from riva.tasks.errors import TaskError


@dataclass(slots=True)
class TaskResources:
    database: Database
    llm: LLMClient


@asynccontextmanager
async def task_resources(settings: Settings) -> AsyncGenerator[TaskResources]:
    async with (
        Database(settings.database_url) as database,
        LLMClient(settings.llm) as llm,
    ):
        yield TaskResources(database=database, llm=llm)


def get_task_resources(context: procrastinate.JobContext) -> TaskResources:
    resources = context.additional_context.get("resources")
    if not isinstance(resources, TaskResources):
        # Missing worker setup is a runtime error, not an invalid task argument.
        raise TaskError("Riva task resources are missing or invalid in JobContext.")
    return resources
