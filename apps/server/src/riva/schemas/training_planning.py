from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import (
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel

from riva.core.language import InteractionLanguage
from riva.schemas.base import APIModel
from riva.schemas.interview import (
    InterviewDifficulty,
    InterviewDurationMinutes,
    InterviewRound,
)
from riva.schemas.job_description_parsing import (
    AnalysisItemList,
    Company,
    RoleTitle,
)
from riva.schemas.matching_analysis import OverallMatchScore
from riva.schemas.profile import OptionalText, StandardUUID
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.schemas.training_memory import TrainingMemoryContext
from riva.schemas.training_records import TrainingRecordKind, TrainingRecordStatus


class TrainingPlanningModel(APIModel):
    model_config = ConfigDict(
        extra="forbid",
        from_attributes=True,
        alias_generator=to_camel,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )


TrainingPlanningText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000),
]
TrainingPlanningFocusArea = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
]
TrainingPlanningFocusAreas = Annotated[
    list[TrainingPlanningFocusArea],
    Field(max_length=3),
]


class TrainingPlanningTargetRole(TrainingPlanningModel):
    id: StandardUUID
    title: RoleTitle
    company: Company
    recruitment_type: OptionalText
    location: OptionalText


class TrainingPlanningMatchingAnalysis(TrainingPlanningModel):
    overall_match_score: OverallMatchScore
    matched_capabilities: AnalysisItemList
    missing_capabilities: AnalysisItemList
    underrepresented_capabilities: AnalysisItemList
    resume_gaps: AnalysisItemList
    high_risk_questions: AnalysisItemList
    preparation_recommendations: AnalysisItemList


def _validate_aware_ended_at(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("endedAt must be timezone-aware")
    return value


class TrainingPlanningTargetedPracticeRecord(TrainingPlanningModel):
    record_id: StandardUUID
    kind: Literal[TrainingRecordKind.TARGETED_PRACTICE]
    status: TrainingRecordStatus
    overall_score: float | None = Field(default=None, ge=0, le=100)
    ended_at: datetime
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty

    _validate_ended_at = field_validator("ended_at")(_validate_aware_ended_at)


class TrainingPlanningMockInterviewRecord(TrainingPlanningModel):
    record_id: StandardUUID
    kind: Literal[TrainingRecordKind.MOCK_INTERVIEW]
    status: TrainingRecordStatus
    overall_score: float | None = Field(default=None, ge=0, le=100)
    ended_at: datetime
    round: InterviewRound
    difficulty: InterviewDifficulty

    _validate_ended_at = field_validator("ended_at")(_validate_aware_ended_at)


TrainingPlanningRecentTrainingRecord = Annotated[
    TrainingPlanningTargetedPracticeRecord | TrainingPlanningMockInterviewRecord,
    Field(discriminator="kind"),
]


class TrainingPlanningTargetedPracticeConstraints(TrainingPlanningModel):
    question_types: Annotated[
        list[QuestionCardQuestionType],
        Field(min_length=1),
    ]
    difficulties: Annotated[
        list[QuestionCardDifficulty],
        Field(min_length=1),
    ]
    can_prioritize_weaknesses: bool = Field(strict=True)


class TrainingPlanningMockInterviewConstraints(TrainingPlanningModel):
    rounds: Annotated[list[InterviewRound], Field(min_length=1)]
    difficulties: Annotated[list[InterviewDifficulty], Field(min_length=1)]
    duration_minutes: Annotated[
        list[InterviewDurationMinutes],
        Field(min_length=1),
    ]


class TrainingPlanningConstraints(TrainingPlanningModel):
    targeted_practice: TrainingPlanningTargetedPracticeConstraints
    mock_interview: TrainingPlanningMockInterviewConstraints


class TrainingPlanningInput(TrainingPlanningModel):
    interaction_language: InteractionLanguage
    target_role: TrainingPlanningTargetRole
    matching_analysis: TrainingPlanningMatchingAnalysis | None = None
    training_memory: TrainingMemoryContext = Field(
        default_factory=TrainingMemoryContext,
    )
    recent_training: Annotated[
        list[TrainingPlanningRecentTrainingRecord],
        Field(max_length=5),
    ] = Field(default_factory=list)
    constraints: TrainingPlanningConstraints

    @model_validator(mode="after")
    def validate_recent_training_order(self) -> Self:
        for newer, older in zip(self.recent_training, self.recent_training[1:]):
            if newer.ended_at < older.ended_at:
                raise ValueError(
                    "recentTraining must be ordered from newest to oldest"
                )
        return self


class TrainingPlanningTargetedPracticeOutput(TrainingPlanningModel):
    action: Literal["targetedPractice"]
    reason: TrainingPlanningText
    focus_areas: TrainingPlanningFocusAreas = Field(default_factory=list)
    question_type: QuestionCardQuestionType
    difficulty: QuestionCardDifficulty
    prioritize_weaknesses: bool = Field(strict=True)


class TrainingPlanningMockInterviewOutput(TrainingPlanningModel):
    action: Literal["mockInterview"]
    reason: TrainingPlanningText
    focus_areas: TrainingPlanningFocusAreas = Field(default_factory=list)
    round: InterviewRound
    difficulty: InterviewDifficulty
    duration_minutes: InterviewDurationMinutes


TrainingPlanningOutput = Annotated[
    TrainingPlanningTargetedPracticeOutput | TrainingPlanningMockInterviewOutput,
    Field(discriminator="action"),
]


__all__ = [
    "TrainingPlanningConstraints",
    "TrainingPlanningFocusArea",
    "TrainingPlanningFocusAreas",
    "TrainingPlanningInput",
    "TrainingPlanningMatchingAnalysis",
    "TrainingPlanningMockInterviewConstraints",
    "TrainingPlanningMockInterviewOutput",
    "TrainingPlanningMockInterviewRecord",
    "TrainingPlanningModel",
    "TrainingPlanningOutput",
    "TrainingPlanningRecentTrainingRecord",
    "TrainingPlanningTargetRole",
    "TrainingPlanningTargetedPracticeConstraints",
    "TrainingPlanningTargetedPracticeOutput",
    "TrainingPlanningTargetedPracticeRecord",
    "TrainingPlanningText",
]
