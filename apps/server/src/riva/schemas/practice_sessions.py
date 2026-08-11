from enum import StrEnum

from pydantic import ConfigDict

from riva.schemas.base import APIModel
from riva.schemas.profile import StandardUUID
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)


class PracticeQuestionSource(StrEnum):
    PERSONALIZED = "personalized"
    SAVED = "saved"
    HISTORY = "history"


class PracticeSessionStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"


class PracticeSessionCompletionReason(StrEnum):
    REVIEW_COMPLETED = "reviewCompleted"
    USER_ENDED_EARLY = "userEndedEarly"


class PracticeAttemptStatus(StrEnum):
    GENERATING_QUESTION = "generatingQuestion"
    ANSWERING = "answering"
    ANSWERING_FOLLOW_UP = "answeringFollowUp"
    EVALUATING = "evaluating"
    REVIEW = "review"
    COMPLETED = "completed"
    ENDED_EARLY = "endedEarly"


class PracticeSessionSelection(APIModel):
    model_config = ConfigDict(extra="forbid")

    target_role_id: StandardUUID
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty
    source: PracticeQuestionSource
    prioritize_weaknesses: bool


__all__ = [
    "PracticeAttemptStatus",
    "PracticeQuestionSource",
    "PracticeSessionCompletionReason",
    "PracticeSessionSelection",
    "PracticeSessionStatus",
]
