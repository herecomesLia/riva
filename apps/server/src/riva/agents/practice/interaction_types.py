from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

MAX_PRACTICE_ANSWER_LENGTH = 20_000
MAX_PRACTICE_FOLLOW_UPS = 2


PracticeAnswerContent = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_PRACTICE_ANSWER_LENGTH,
    ),
]


class PracticeAnswerKind(StrEnum):
    MAIN = "main"
    FOLLOW_UP = "followUp"


class _PracticeInteractionModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PracticeAnswerSnapshot(_PracticeInteractionModel):
    content: PracticeAnswerContent
    order: Annotated[int, Field(ge=1)]
