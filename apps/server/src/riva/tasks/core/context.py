from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass

import procrastinate

from riva.core.config import Settings
from riva.db import Database


@dataclass(slots=True)
class TaskResources:
    database: Database


@asynccontextmanager
async def task_resources(settings: Settings) -> AsyncGenerator[TaskResources]:
    async with Database(settings.database_url) as database:
        yield TaskResources(database=database)


def get_task_resources(context: procrastinate.JobContext) -> TaskResources:
    resources = context.additional_context.get("resources")
    if not isinstance(resources, TaskResources):
        # Missing worker setup is a runtime error, not an invalid task argument.
        raise RuntimeError(  # noqa: TRY004
            "Riva task resources are missing or invalid in JobContext."
        )
    return resources
