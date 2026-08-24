from datetime import datetime
from enum import IntEnum, StrEnum
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, StringConstraints, field_validator

from riva.agents.jobs.jd_parser_types import Company, RoleTitle
from riva.core.language import InteractionLanguage
from riva.services.types import DomainModel, RequiredText, StandardUUID


class InterviewDomainModel(DomainModel):
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
    QUESTION = "question"
    FOLLOW_UP = "followUp"
    CANDIDATE_QUESTIONS = "candidateQuestions"
    COMPLETED = "completed"


InterviewSetupBlockedReason = Literal[
    "noTargetRoles",
    "profileIncomplete",
    "jobDescriptionMissing",
]


class InterviewConfiguration(InterviewDomainModel):
    target_role_id: StandardUUID
    round: InterviewRound
    difficulty: InterviewDifficulty
    duration_minutes: InterviewDurationMinutes


class InterviewDefaultConfiguration(InterviewDomainModel):
    target_role_id: StandardUUID | None
    round: InterviewRound
    difficulty: InterviewDifficulty
    duration_minutes: InterviewDurationMinutes


class InterviewTargetRoleResponse(InterviewDomainModel):
    id: StandardUUID
    title: RoleTitle
    company: Company
    supported_rounds: Annotated[
        tuple[InterviewRound, ...],
        Field(min_length=1),
    ]


class InterviewSetupAvailableResponse(InterviewDomainModel):
    status: Literal["available"]


class InterviewSetupBlockedResponse(InterviewDomainModel):
    status: Literal["blocked"]
    reason: InterviewSetupBlockedReason


InterviewSetupAvailabilityResponse = Annotated[
    InterviewSetupAvailableResponse | InterviewSetupBlockedResponse,
    Field(discriminator="status"),
]


class InterviewSetupResponse(InterviewDomainModel):
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


class InterviewProgressResponse(InterviewDomainModel):
    completed_main_questions: Annotated[int, Field(strict=True, ge=0)]
    total_main_questions: Annotated[int, Field(strict=True, ge=1)] | None
    plan_revision: Annotated[int, Field(strict=True, ge=0)]


InterviewAnswerText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000),
]
InterviewFollowUpPrompt = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000),
]


class InterviewQuestionResponse(InterviewDomainModel):
    id: StandardUUID
    prompt: RequiredText
    type: InterviewQuestionType
    assessed_capabilities: list[RequiredText]
    order: Annotated[int, Field(strict=True, ge=1)]


class InterviewAnswerResponse(InterviewDomainModel):
    id: StandardUUID
    content: InterviewAnswerText
    submitted_at: datetime

    @field_validator("submitted_at")
    @classmethod
    def validate_submitted_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("submitted_at must be timezone-aware")
        return value


class InterviewFollowUpQuestionResponse(InterviewDomainModel):
    id: StandardUUID
    parent_question_id: StandardUUID
    prompt: InterviewFollowUpPrompt
    order: Annotated[int, Field(strict=True, ge=1)]
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def validate_created_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("created_at must be timezone-aware")
        return value


class InterviewAnsweredFollowUpResponse(InterviewDomainModel):
    status: Literal["answered"]
    question: InterviewFollowUpQuestionResponse
    answer: InterviewAnswerResponse


class InterviewCompletedQuestionResponse(InterviewDomainModel):
    question: InterviewQuestionResponse
    answer: InterviewAnswerResponse
    follow_ups: list[InterviewAnsweredFollowUpResponse] = Field(default_factory=list)
    completed_at: datetime

    @field_validator("completed_at")
    @classmethod
    def validate_completed_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("completed_at must be timezone-aware")
        return value


class InterviewAwaitingQuestionResponse(InterviewDomainModel):
    status: Literal["awaitingAnswer"]
    question: InterviewQuestionResponse
    answer: None = None


class InterviewOpeningSessionResponse(InterviewDomainModel):
    status: Literal["opening"]
    session_id: StandardUUID
    language: InteractionLanguage
    version: Annotated[int, Field(strict=True, ge=1)]
    configuration: InterviewConfiguration
    started_at: datetime
    progress: InterviewProgressResponse
    completed_questions: list[InterviewCompletedQuestionResponse] = Field(
        default_factory=list
    )
    opening_message: RequiredText

    @field_validator("started_at")
    @classmethod
    def validate_started_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("started_at must be timezone-aware")
        return value


class InterviewQuestionSessionResponse(InterviewDomainModel):
    status: Literal["question"]
    session_id: StandardUUID
    language: InteractionLanguage
    version: Annotated[int, Field(strict=True, ge=1)]
    configuration: InterviewConfiguration
    started_at: datetime
    progress: InterviewProgressResponse
    completed_questions: list[InterviewCompletedQuestionResponse] = Field(
        default_factory=list
    )
    current_question: InterviewAwaitingQuestionResponse

    @field_validator("started_at")
    @classmethod
    def validate_started_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("started_at must be timezone-aware")
        return value


class InterviewAnsweredQuestionResponse(InterviewDomainModel):
    question: InterviewQuestionResponse
    answer: InterviewAnswerResponse
    answered_follow_ups: list[InterviewAnsweredFollowUpResponse] = Field(
        default_factory=list
    )


class InterviewAwaitingFollowUpResponse(InterviewDomainModel):
    status: Literal["awaitingAnswer"]
    question: InterviewFollowUpQuestionResponse
    answer: None = None


class InterviewFollowUpSessionResponse(InterviewDomainModel):
    status: Literal["followUp"]
    session_id: StandardUUID
    language: InteractionLanguage
    version: Annotated[int, Field(strict=True, ge=1)]
    configuration: InterviewConfiguration
    started_at: datetime
    progress: InterviewProgressResponse
    completed_questions: list[InterviewCompletedQuestionResponse] = Field(
        default_factory=list
    )
    current_question: InterviewAnsweredQuestionResponse
    current_follow_up: InterviewAwaitingFollowUpResponse

    @field_validator("started_at")
    @classmethod
    def validate_started_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("started_at must be timezone-aware")
        return value


InterviewCandidateQuestionText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000),
]
InterviewCandidateQuestionAnswerText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000),
]
InterviewCandidateQuestionFeedbackText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000),
]


class InterviewCandidateQuestionResponse(InterviewDomainModel):
    id: StandardUUID
    content: InterviewCandidateQuestionText
    submitted_at: datetime

    @field_validator("submitted_at")
    @classmethod
    def validate_submitted_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("submitted_at must be timezone-aware")
        return value


class InterviewCandidateQuestionFeedbackResponse(InterviewDomainModel):
    summary: InterviewCandidateQuestionFeedbackText
    strengths: list[InterviewCandidateQuestionFeedbackText] = Field(
        default_factory=list
    )
    improvement_suggestions: list[InterviewCandidateQuestionFeedbackText] = Field(
        default_factory=list
    )
    suggested_alternatives: list[InterviewCandidateQuestionFeedbackText] = Field(
        default_factory=list
    )


class InterviewCandidateQuestionExchangeResponse(InterviewDomainModel):
    question: InterviewCandidateQuestionResponse
    interviewer_answer: InterviewCandidateQuestionAnswerText
    feedback: InterviewCandidateQuestionFeedbackResponse


class InterviewCandidateQuestionsSessionResponse(InterviewDomainModel):
    status: Literal["candidateQuestions"]
    session_id: StandardUUID
    language: InteractionLanguage
    version: Annotated[int, Field(strict=True, ge=1)]
    configuration: InterviewConfiguration
    started_at: datetime
    progress: InterviewProgressResponse
    completed_questions: list[InterviewCompletedQuestionResponse] = Field(
        default_factory=list
    )
    prompt: RequiredText
    exchanges: list[InterviewCandidateQuestionExchangeResponse] = Field(
        default_factory=list
    )

    @field_validator("started_at")
    @classmethod
    def validate_started_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("started_at must be timezone-aware")
        return value


InterviewCompletionReason = Literal["formalQuestionsCompleted", "userEndedEarly"]
InterviewReviewText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000),
]
InterviewScoreDimension = Literal[
    "relevance",
    "structure",
    "specificity",
    "personalContribution",
    "resultsAndEvidence",
    "roleAlignment",
    "communication",
    "riskControl",
]


class InterviewDimensionScoreResponse(InterviewDomainModel):
    dimension: InterviewScoreDimension
    score: Annotated[int, Field(strict=True, ge=0, le=100)]
    explanation: InterviewReviewText


class InterviewQuestionReviewResponse(InterviewDomainModel):
    question_id: StandardUUID
    score: Annotated[int, Field(strict=True, ge=0, le=100)]
    summary: InterviewReviewText
    strengths: list[InterviewReviewText] = Field(default_factory=list)
    issues: list[InterviewReviewText] = Field(default_factory=list)


class InterviewFollowUpReviewResponse(InterviewDomainModel):
    follow_up_question_id: StandardUUID
    score: Annotated[int, Field(strict=True, ge=0, le=100)]
    summary: InterviewReviewText
    strengths: list[InterviewReviewText] = Field(default_factory=list)
    issues: list[InterviewReviewText] = Field(default_factory=list)


class InterviewReferenceAnswerContentResponse(InterviewDomainModel):
    recommended_structure: list[InterviewReviewText]
    key_points: list[InterviewReviewText]
    example_answer: InterviewReviewText
    usage_guidance: InterviewReviewText
    generated_at: datetime

    @field_validator("generated_at")
    @classmethod
    def validate_generated_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("generated_at must be timezone-aware")
        return value


class InterviewReadyReferenceAnswerResponse(InterviewDomainModel):
    status: Literal["ready"]
    content: InterviewReferenceAnswerContentResponse


class InterviewUnavailableReferenceAnswerResponse(InterviewDomainModel):
    status: Literal["unavailable"]
    reason: Literal["generationFailed"]


InterviewReferenceAnswerResponse = Annotated[
    InterviewReadyReferenceAnswerResponse | InterviewUnavailableReferenceAnswerResponse,
    Field(discriminator="status"),
]


class InterviewQuestionRecordResponse(InterviewDomainModel):
    status: Literal["answered", "unanswered"]
    question: InterviewQuestionResponse
    answer: InterviewAnswerResponse | None
    follow_ups: list["InterviewFollowUpRecordResponse"] = Field(default_factory=list)


class InterviewFollowUpRecordResponse(InterviewDomainModel):
    status: Literal["answered", "unanswered"]
    question: InterviewFollowUpQuestionResponse
    answer: InterviewAnswerResponse | None


class InterviewReferenceAnswerStateResponse(InterviewDomainModel):
    status: Literal["ready", "unavailable"]
    content: InterviewReferenceAnswerContentResponse | None = None
    reason: Literal["generationFailed"] | None = None


class InterviewFollowUpLearningDetailResponse(InterviewDomainModel):
    record: InterviewFollowUpRecordResponse
    performance: InterviewFollowUpReviewResponse | None
    reference_answer: InterviewReferenceAnswerStateResponse


class InterviewQuestionLearningDetailResponse(InterviewDomainModel):
    record: InterviewQuestionRecordResponse
    performance: InterviewQuestionReviewResponse | None
    reference_answer: InterviewReferenceAnswerStateResponse
    follow_ups: list[InterviewFollowUpLearningDetailResponse] = Field(
        default_factory=list
    )


class InterviewTrainingTargetedPracticeResponse(InterviewDomainModel):
    action: Literal["targetedPractice"]
    reason: InterviewReviewText
    focus_areas: list[InterviewReviewText]
    question_type: InterviewQuestionType
    difficulty: InterviewDifficulty


class InterviewTrainingMockInterviewResponse(InterviewDomainModel):
    action: Literal["mockInterview"]
    reason: InterviewReviewText
    focus_areas: list[InterviewReviewText]
    round: InterviewRound
    difficulty: InterviewDifficulty


InterviewTrainingSuggestionResponse = Annotated[
    InterviewTrainingTargetedPracticeResponse | InterviewTrainingMockInterviewResponse,
    Field(discriminator="action"),
]


class InterviewReviewNarrativeResponse(InterviewDomainModel):
    overall_performance: InterviewReviewText
    question_reviews: list[InterviewQuestionReviewResponse]
    main_strengths: list[InterviewReviewText]
    frequent_issues: list[InterviewReviewText]
    exposed_weaknesses: list[InterviewReviewText]
    risk_points: list[InterviewReviewText]
    communication_suggestions: list[InterviewReviewText]
    preparation_suggestions: list[InterviewReviewText]
    generated_at: datetime

    @field_validator("generated_at")
    @classmethod
    def validate_generated_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("generated_at must be timezone-aware")
        return value


class InterviewPartialReviewResponse(InterviewReviewNarrativeResponse):
    pass


class InterviewCompleteReviewResponse(InterviewReviewNarrativeResponse):
    overall_score: Annotated[int, Field(strict=True, ge=0, le=100)]
    dimension_scores: list[InterviewDimensionScoreResponse]
    next_training: InterviewTrainingSuggestionResponse


class InterviewUnavailableReviewResponse(InterviewDomainModel):
    status: Literal["unavailable"]
    reason: Literal["insufficientAnswers"]


class InterviewPartialReviewStateResponse(InterviewDomainModel):
    status: Literal["partial"]
    review: InterviewPartialReviewResponse


class InterviewCompleteReviewStateResponse(InterviewDomainModel):
    status: Literal["complete"]
    review: InterviewCompleteReviewResponse


InterviewSessionReviewResponse = Annotated[
    InterviewUnavailableReviewResponse
    | InterviewPartialReviewStateResponse
    | InterviewCompleteReviewStateResponse,
    Field(discriminator="status"),
]


class InterviewCompletedSessionResponse(InterviewDomainModel):
    status: Literal["completed"]
    session_id: StandardUUID
    language: InteractionLanguage
    version: Annotated[int, Field(strict=True, ge=1)]
    configuration: InterviewConfiguration
    started_at: datetime
    progress: InterviewProgressResponse
    completed_questions: list[InterviewCompletedQuestionResponse] = Field(
        default_factory=list
    )
    completion_reason: InterviewCompletionReason
    completed_at: datetime
    candidate_question_exchanges: list[InterviewCandidateQuestionExchangeResponse] = (
        Field(default_factory=list)
    )
    review: InterviewSessionReviewResponse
    question_details: list[InterviewQuestionLearningDetailResponse] = Field(
        default_factory=list
    )

    @field_validator("started_at", "completed_at")
    @classmethod
    def validate_timestamps(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must be timezone-aware")
        return value


class InterviewPageResponse(InterviewDomainModel):
    setup: InterviewSetupResponse
    session: (
        InterviewOpeningSessionResponse
        | InterviewQuestionSessionResponse
        | InterviewFollowUpSessionResponse
        | InterviewCandidateQuestionsSessionResponse
        | InterviewCompletedSessionResponse
        | None
    )


class StartInterviewRequest(InterviewConfiguration):
    """Client-selected interview configuration for a new session."""


class BeginInterviewQuestionsRequest(InterviewDomainModel):
    version: Annotated[int, Field(strict=True, ge=1)]


class SubmitMainInterviewAnswerRequest(InterviewDomainModel):
    version: Annotated[int, Field(strict=True, ge=1)]
    target: Literal["question"]
    question_id: StandardUUID
    content: InterviewAnswerText


class SubmitFollowUpInterviewAnswerRequest(InterviewDomainModel):
    version: Annotated[int, Field(strict=True, ge=1)]
    target: Literal["followUp"]
    question_id: StandardUUID
    follow_up_question_id: StandardUUID
    content: InterviewAnswerText


SubmitInterviewAnswerRequest = Annotated[
    SubmitMainInterviewAnswerRequest | SubmitFollowUpInterviewAnswerRequest,
    Field(discriminator="target"),
]


class SubmitCandidateQuestionRequest(InterviewDomainModel):
    version: Annotated[int, Field(strict=True, ge=1)]
    content: InterviewCandidateQuestionText


class FinishInterviewRequest(InterviewDomainModel):
    version: Annotated[int, Field(strict=True, ge=1)]


class EndInterviewRequest(InterviewDomainModel):
    version: Annotated[int, Field(strict=True, ge=1)]


class GetInterviewReviewBaseResponse(InterviewDomainModel):
    session_id: StandardUUID
    completion_reason: InterviewCompletionReason
    question_details: list[InterviewQuestionLearningDetailResponse] = Field(
        default_factory=list
    )


class GetInterviewUnavailableReviewResponse(GetInterviewReviewBaseResponse):
    status: Literal["unavailable"]
    reason: Literal["insufficientAnswers"]


class GetInterviewPartialReviewResponse(GetInterviewReviewBaseResponse):
    status: Literal["partial"]
    review: InterviewPartialReviewResponse


class GetInterviewCompleteReviewResponse(GetInterviewReviewBaseResponse):
    status: Literal["complete"]
    review: InterviewCompleteReviewResponse


GetInterviewReviewResponse = Annotated[
    GetInterviewUnavailableReviewResponse
    | GetInterviewPartialReviewResponse
    | GetInterviewCompleteReviewResponse,
    Field(discriminator="status"),
]


InterviewCandidateQuestionsSessionResponse.model_rebuild()
InterviewQuestionRecordResponse.model_rebuild()
InterviewFollowUpLearningDetailResponse.model_rebuild()
InterviewQuestionLearningDetailResponse.model_rebuild()
InterviewCompletedSessionResponse.model_rebuild()
InterviewPageResponse.model_rebuild()
GetInterviewReviewBaseResponse.model_rebuild()
GetInterviewUnavailableReviewResponse.model_rebuild()
GetInterviewPartialReviewResponse.model_rebuild()
GetInterviewCompleteReviewResponse.model_rebuild()
