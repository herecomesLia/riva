from dataclasses import dataclass
from enum import Enum, StrEnum

import procrastinate


@dataclass(frozen=True, slots=True)
class TaskSpec:
    name: str
    queue: str


class PracticeRunAction(StrEnum):
    START = "start"
    ANSWER = "answer"
    FINISH = "finish"
    RESTART = "restart"


class Task(Enum):
    RUN_PRACTICE_ROUND = TaskSpec(name="practice.run_round", queue="ai")
    EXTRACT_JD_TEXT = TaskSpec(name="roles.extract_jd_text", queue="ai")
    EXTRACT_CAREER_PROFILE_TEXT = TaskSpec(
        name="career_profile.extract_career_profile_text", queue="ai"
    )
    ANALYZE_ROLE_MATCHING = TaskSpec(name="roles.analyze_matching", queue="ai")

    @property
    def name(self) -> str:
        return self.value.name

    @property
    def queue(self) -> str:
        return self.value.queue


IMPORT_PATHS: tuple[str, ...] = (
    "riva.tasks.roles",
    "riva.tasks.career_profile",
    "riva.tasks.practice",
)


def configure_task_registry(app: procrastinate.App) -> None:
    app.import_paths = IMPORT_PATHS
