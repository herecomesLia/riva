from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    ConfigDict,
    Field,
    StrictFloat,
    StrictInt,
    StrictStr,
    field_validator,
)

from riva.services.interview.types import InterviewRound
from riva.services.profile.types import StandardUUID
from riva.services.types import DomainModel


class _DashboardDomainModel(DomainModel):
    model_config = ConfigDict(extra="forbid")


DashboardNumber = Annotated[StrictInt | StrictFloat, Field(ge=0)]
DashboardScore = Annotated[
    StrictInt | StrictFloat,
    Field(ge=0, le=100),
]
DashboardNonNegativeInt = Annotated[StrictInt, Field(ge=0)]


class DashboardMetricSnapshotResponse(_DashboardDomainModel):
    current_value: DashboardNumber | None
    previous_value: DashboardNumber | None


class DashboardScoreMetricSnapshotResponse(DashboardMetricSnapshotResponse):
    current_value: DashboardScore | None
    previous_value: DashboardScore | None


class DashboardDurationMetricSnapshotResponse(DashboardMetricSnapshotResponse):
    current_value: DashboardNonNegativeInt | None
    previous_value: DashboardNonNegativeInt | None


class DashboardMetricsResponse(_DashboardDomainModel):
    role_fit: DashboardScoreMetricSnapshotResponse
    practice_time_minutes: DashboardDurationMetricSnapshotResponse
    targeted_practice_score: DashboardScoreMetricSnapshotResponse
    mock_interview_score: DashboardScoreMetricSnapshotResponse


class DashboardPerformanceRecordResponse(_DashboardDomainModel):
    id: StandardUUID
    occurred_at: datetime
    score: DashboardScore

    @field_validator("occurred_at")
    @classmethod
    def validate_occurred_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("occurred_at must be timezone-aware")
        return value


class DashboardExperienceYearsResponse(_DashboardDomainModel):
    min_years: DashboardNonNegativeInt | None
    max_years: DashboardNonNegativeInt | None


class DashboardCurrentRoleResponse(_DashboardDomainModel):
    id: StandardUUID
    title: StrictStr
    company: StrictStr | None
    recruitment_type: Literal["campus", "experienced"] | None
    location: StrictStr | None
    experience_years: DashboardExperienceYearsResponse | None
    profile_completed: bool
    job_description_added: bool


DashboardWeaknessCategory = Literal[
    "projectExpression",
    "quantifiedResults",
    "pressureResponse",
]


class DashboardWeaknessResponse(_DashboardDomainModel):
    id: StandardUUID
    category: DashboardWeaknessCategory
    description: StrictStr
    recommended_practice_count: Annotated[StrictInt, Field(ge=1, le=3)]


DashboardRecommendationQuestionType = Literal[
    "selfIntroduction",
    "projectDeepDive",
    "roleCapability",
    "behavioral",
    "technicalOrBusiness",
    "businessUnderstanding",
    "technicalFoundation",
    "resumeRisk",
    "motivation",
]


class DashboardTargetedPracticeRecommendationResponse(_DashboardDomainModel):
    action: Literal["targetedPractice"]
    reason: StrictStr
    question_type: DashboardRecommendationQuestionType
    difficulty: Literal["basic", "pressure"]
    focus_areas: Annotated[list[StrictStr], Field(max_length=3)]


class DashboardMockInterviewRecommendationResponse(_DashboardDomainModel):
    action: Literal["mockInterview"]
    reason: StrictStr
    round: InterviewRound
    difficulty: Literal["basic", "pressure"]
    focus_areas: Annotated[list[StrictStr], Field(max_length=3)]


DashboardRecommendationOutput = Annotated[
    DashboardTargetedPracticeRecommendationResponse
    | DashboardMockInterviewRecommendationResponse,
    Field(discriminator="action"),
]


class DashboardRecommendationResponse(_DashboardDomainModel):
    id: StandardUUID
    source_record_id: StandardUUID
    target_role_id: StandardUUID
    recommendation: DashboardRecommendationOutput
    estimated_minutes: DashboardNonNegativeInt


class DashboardPerformanceTrendResponse(_DashboardDomainModel):
    targeted_practice: list[DashboardPerformanceRecordResponse]
    mock_interview: list[DashboardPerformanceRecordResponse]


class DashboardResponse(_DashboardDomainModel):
    current_role: DashboardCurrentRoleResponse | None
    recommendation: DashboardRecommendationResponse | None
    metrics: DashboardMetricsResponse
    performance_trend: DashboardPerformanceTrendResponse
    weaknesses: list[DashboardWeaknessResponse]
