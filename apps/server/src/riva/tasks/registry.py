from dataclasses import dataclass
from enum import Enum

import procrastinate


@dataclass(frozen=True, slots=True)
class TaskSpec:
    name: str
    queue: str


class Task(Enum):
    @property
    def name(self) -> str:
        return self.value.name

    @property
    def queue(self) -> str:
        return self.value.queue


IMPORT_PATHS: tuple[str, ...] = ()


def configure_task_registry(app: procrastinate.App) -> None:
    app.import_paths = IMPORT_PATHS
