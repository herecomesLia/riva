from datetime import datetime
from enum import IntEnum, StrEnum
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, field_validator

from riva.core.language import InteractionLanguage
from riva.schemas.base import APIModel
from riva.schemas.profile import RequiredText, StandardUUID
from riva.schemas.job_description_parsing import Company, RoleTitle


class InterviewAPIModel(APIModel):
    model_config = ConfigDict(extra="forbid")


class InterviewRound(StrEnum):
    HR = "hr"
    FIRST_BUSINESS = "firstBusiness"
    TECHNICAL = "technical"
    MANAGER = "manager"
    FINAL = "final"
    COMPREHENSIVE = "comprehensive"


class InterviewDifficulty(StrEnum):
    BASIC = "basic"
    PRESSURE = "pressure"


class InterviewQuestionType(StrEnum):
    SELF_INTRODUCTION = "selfIntroduction"
    PROJECT_DEEP_DIVE = "projectDeepDive"
    ROLE_CAPABILITY = "roleCapability"
    BEHAVIORAL = "behavioral"
    TECHNICAL_OR_BUSINESS = "technicalOrBusiness"
    RESUME_RISK = "resumeRisk"
    MOTIVATION = "motivation"


class InterviewDurationMinutes(IntEnum):
    FIFTEEN = 15
    THIRTY = 30
    FORTY_FIVE = 45


class InterviewSessionStatus(StrEnum):
    OPENING = "opening"
    GENERATING_QUESTION = "generatingQuestion"
    QUESTION = "question"
    GENERATING_TURN = "generatingTurn"
    FOLLOW_UP = "followUp"
    CANDIDATE_QUESTIONS = "candidateQuestions"
    GENERATING_CANDIDATE_ANSWER = "generatingCandidateAnswer"
    GENERATING_REVIEW = "generatingReview"
    COMPLETED = "completed"


class InterviewGenerationStatus(StrEnum):
    GENERATING = "generating"
    FAILED = "failed"


InterviewSetupBlockedReason = Literal[
    "profileIncomplete",
    "jobDescriptionMissing",
]


class InterviewConfiguration(InterviewAPIModel):
    target_role_id: StandardUUID
    round: InterviewRound
    difficulty: InterviewDifficulty
    duration_minutes: InterviewDurationMinutes


class InterviewDefaultConfiguration(InterviewAPIModel):
    target_role_id: StandardUUID | None
    round: InterviewRound
    difficulty: InterviewDifficulty
    duration_minutes: InterviewDurationMinutes


class InterviewTargetRoleResponse(InterviewAPIModel):
    id: StandardUUID
    title: RoleTitle
    company: Company
    supported_rounds: Annotated[
        tuple[InterviewRound, ...],
        Field(min_length=1),
    ]


class InterviewSetupAvailableResponse(InterviewAPIModel):
    status: Literal["available"]


class InterviewSetupBlockedResponse(InterviewAPIModel):
    status: Literal["blocked"]
    reason: InterviewSetupBlockedReason


InterviewSetupAvailabilityResponse = Annotated[
    InterviewSetupAvailableResponse | InterviewSetupBlockedResponse,
    Field(discriminator="status"),
]


class InterviewSetupResponse(InterviewAPIModel):
    availability: InterviewSetupAvailabilityResponse
    target_roles: list[InterviewTargetRoleResponse]
    available_difficulties: Annotated[
        tuple[InterviewDifficulty, ...],
        Field(min_length=1),
    ]
    available_duration_minutes: Annotated[
        tuple[InterviewDurationMinutes, ...],
        Field(min_length=1),
    ]
    default_configuration: InterviewDefaultConfiguration


class InterviewProgressResponse(InterviewAPIModel):
    completed_main_questions: Annotated[int, Field(strict=True, ge=0)]
    total_main_questions: Annotated[int, Field(strict=True, ge=1)] | None
    plan_revision: Annotated[int, Field(strict=True, ge=0)]


class InterviewQuestionResponse(InterviewAPIModel):
    id: StandardUUID
    prompt: RequiredText
    type: InterviewQuestionType
    assessed_capabilities: list[RequiredText]
    order: Annotated[int, Field(strict=True, ge=1)]


class InterviewAwaitingQuestionResponse(InterviewAPIModel):
    status: Literal["awaitingAnswer"]
    question: InterviewQuestionResponse
    answer: None = None


class InterviewGeneratingQuestionSessionResponse(InterviewAPIModel):
    status: Literal["generatingQuestion"]
    session_id: StandardUUID
    language: InteractionLanguage
    version: Annotated[int, Field(strict=True, ge=1)]
    configuration: InterviewConfiguration
    started_at: datetime
    progress: InterviewProgressResponse
    completed_questions: list[object] = Field(default_factory=list)
    generation_status: InterviewGenerationStatus

    @field_validator("started_at")
    @classmethod
    def validate_started_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("started_at must be timezone-aware")
        return value


class InterviewOpeningSessionResponse(InterviewAPIModel):
    status: Literal["opening"]
    session_id: StandardUUID
    language: InteractionLanguage
    version: Annotated[int, Field(strict=True, ge=1)]
    configuration: InterviewConfiguration
    started_at: datetime
    progress: InterviewProgressResponse
    completed_questions: list[object] = Field(default_factory=list)
    opening_message: RequiredText

    @field_validator("started_at")
    @classmethod
    def validate_started_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("started_at must be timezone-aware")
        return value


class InterviewQuestionSessionResponse(InterviewAPIModel):
    status: Literal["question"]
    session_id: StandardUUID
    language: InteractionLanguage
    version: Annotated[int, Field(strict=True, ge=1)]
    configuration: InterviewConfiguration
    started_at: datetime
    progress: InterviewProgressResponse
    completed_questions: list[object] = Field(default_factory=list)
    current_question: InterviewAwaitingQuestionResponse

    @field_validator("started_at")
    @classmethod
    def validate_started_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("started_at must be timezone-aware")
        return value


class InterviewPageResponse(InterviewAPIModel):
    setup: InterviewSetupResponse
    session: (
        InterviewOpeningSessionResponse
        | InterviewGeneratingQuestionSessionResponse
        | InterviewQuestionSessionResponse
        | None
    )


class StartInterviewRequest(InterviewConfiguration):
    """Client-selected interview configuration for a new session."""


class BeginInterviewQuestionsRequest(InterviewAPIModel):
    version: Annotated[int, Field(strict=True, ge=1)]


__all__ = [
    "InterviewConfiguration",
    "InterviewAwaitingQuestionResponse",
    "BeginInterviewQuestionsRequest",
    "InterviewDefaultConfiguration",
    "InterviewDifficulty",
    "InterviewDurationMinutes",
    "InterviewGenerationStatus",
    "InterviewGeneratingQuestionSessionResponse",
    "InterviewOpeningSessionResponse",
    "InterviewPageResponse",
    "InterviewProgressResponse",
    "InterviewQuestionResponse",
    "InterviewQuestionSessionResponse",
    "InterviewQuestionType",
    "InterviewRound",
    "InterviewSessionStatus",
    "InterviewSetupAvailabilityResponse",
    "InterviewSetupAvailableResponse",
    "InterviewSetupBlockedReason",
    "InterviewSetupBlockedResponse",
    "InterviewSetupResponse",
    "InterviewTargetRoleResponse",
    "StartInterviewRequest",
]
