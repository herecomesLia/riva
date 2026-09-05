from enum import StrEnum

import procrastinate


class Task(StrEnum):
    pass


IMPORT_PATHS: tuple[str, ...] = ()


def configure_task_registry(app: procrastinate.App) -> None:
    app.import_paths = IMPORT_PATHS
