from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import Field

from riva.models.practice import (
    PracticeAnswerTurn,
    PracticeDifficulty,
    PracticeDimensionScores,
    PracticeQuestionTurn,
    PracticeQuestionType,
    PracticeResult,
)
from riva.models.types import NonBlankStr
from riva.schemas.base import RequestModel, ResponseModel


class CreatePracticeRequest(RequestModel):
    role_id: UUID
    question_type: PracticeQuestionType
    difficulty: PracticeDifficulty
    max_follow_ups: int = Field(strict=True, ge=0)


class SubmitPracticeAnswerRequest(RequestModel):
    question_id: UUID
    content: NonBlankStr


class CreatePracticeResponse(ResponseModel):
    id: UUID


class PracticeRoleResponse(ResponseModel):
    id: UUID | None
    title: str
    company: str | None


class PracticeQuestionTurnResponse(PracticeQuestionTurn, ResponseModel):
    pass


class PracticeAnswerTurnResponse(PracticeAnswerTurn, ResponseModel):
    pass


type PracticeTurnResponse = Annotated[
    PracticeQuestionTurnResponse | PracticeAnswerTurnResponse,
    Field(discriminator="role"),
]


class PracticeDimensionScoresResponse(PracticeDimensionScores, ResponseModel):
    pass


class PracticeResultResponse(PracticeResult, ResponseModel):
    dimension_scores: PracticeDimensionScoresResponse


class PracticeRoundResponse(ResponseModel):
    id: UUID
    sequence: int
    turns: list[PracticeTurnResponse]
    result: PracticeResultResponse | None


class PracticeResponse(ResponseModel):
    id: UUID
    role: PracticeRoleResponse
    question_type: PracticeQuestionType
    difficulty: PracticeDifficulty
    max_follow_ups: int
    rounds: list[PracticeRoundResponse]
    ended_at: datetime | None
    created_at: datetime


class PracticeSummaryResponse(ResponseModel):
    id: UUID
    role: PracticeRoleResponse
    question_type: PracticeQuestionType
    difficulty: PracticeDifficulty
    round_count: int
    completed_round_count: int
    average_score: float | None
    ended_at: datetime | None
    created_at: datetime


class PracticeListResponse(ResponseModel):
    practices: list[PracticeSummaryResponse]
    active_practice_id: UUID | None = Field(
        description="The current active practice session; null when none is active."
    )
