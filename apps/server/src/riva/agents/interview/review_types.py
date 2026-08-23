from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, StringConstraints, model_validator

from riva.agents.base import AgentModel
from riva.agents.interview.candidate_types import (
    InterviewCandidateQuestionExchangeSnapshot,
)
from riva.agents.interview.planning_types import InterviewPlanningInput
from riva.agents.training.memory_types import TrainingMemoryContext
from riva.agents.types import (
    InterviewConfiguration,
    InterviewDifficulty,
    InterviewQuestionType,
    InterviewRound,
    InterviewSessionStatus,
    RequiredText,
    StandardUUID,
)
from riva.core.language import InteractionLanguage


class InterviewReviewModel(AgentModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )


ReviewText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000),
]
ReviewAnswerText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000),
]
ReviewList = Annotated[
    list[ReviewText],
    Field(max_length=30),
]
ReferenceList = Annotated[
    list[ReviewText],
    Field(min_length=1, max_length=20),
]


class InterviewReviewMode(StrEnum):
    UNAVAILABLE = "unavailable"
    PARTIAL = "partial"
    COMPLETE = "complete"


class InterviewReviewCompletionReason(StrEnum):
    FORMAL_QUESTIONS_COMPLETED = "formalQuestionsCompleted"
    USER_ENDED_EARLY = "userEndedEarly"


class InterviewReviewDimension(StrEnum):
    RELEVANCE = "relevance"
    STRUCTURE = "structure"
    SPECIFICITY = "specificity"
    PERSONAL_CONTRIBUTION = "personalContribution"
    RESULTS_AND_EVIDENCE = "resultsAndEvidence"
    ROLE_ALIGNMENT = "roleAlignment"
    COMMUNICATION = "communication"
    RISK_CONTROL = "riskControl"


class InterviewReviewSessionSnapshot(InterviewReviewModel):
    id: StandardUUID
    version: Annotated[int, Field(strict=True, ge=1)]
    status: InterviewSessionStatus
    language: InteractionLanguage
    configuration: InterviewConfiguration


class InterviewReviewAnswerSnapshot(InterviewReviewModel):
    id: StandardUUID
    content: ReviewAnswerText
    submitted_at: datetime

    @model_validator(mode="after")
    def validate_submitted_at(self) -> Self:
        if self.submitted_at.tzinfo is None or self.submitted_at.utcoffset() is None:
            raise ValueError("review answer submitted_at must be timezone-aware")
        return self


class InterviewReviewFollowUpSnapshot(InterviewReviewModel):
    id: StandardUUID
    parent_question_id: StandardUUID
    order: Annotated[int, Field(strict=True, ge=1)]
    prompt: ReviewText
    answer: InterviewReviewAnswerSnapshot | None = None


class InterviewReviewTurnAssessmentSnapshot(InterviewReviewModel):
    id: StandardUUID
    question_id: StandardUUID
    main_answer_id: StandardUUID | None = None
    follow_up_answer_id: StandardUUID | None = None
    score: Annotated[int, Field(strict=True, ge=0, le=100)]
    summary: ReviewText
    strengths: ReviewList = Field(default_factory=list)
    issues: ReviewList = Field(default_factory=list)
    decision: Literal["followUp", "completeQuestion"]
    created_at: datetime

    @model_validator(mode="after")
    def validate_answer_lineage(self) -> Self:
        if (self.main_answer_id is None) == (self.follow_up_answer_id is None):
            raise ValueError("turn assessment must target exactly one answer")
        if self.created_at.tzinfo is None or self.created_at.utcoffset() is None:
            raise ValueError("turn assessment created_at must be timezone-aware")
        return self


class InterviewReviewQuestionSnapshot(InterviewReviewModel):
    id: StandardUUID
    order: Annotated[int, Field(strict=True, ge=1)]
    prompt: ReviewText
    question_type: InterviewQuestionType
    assessed_capabilities: list[RequiredText]
    objective: ReviewText
    follow_up_directions: ReferenceList
    scoring_focus: ReferenceList
    answer: InterviewReviewAnswerSnapshot | None = None
    follow_ups: list[InterviewReviewFollowUpSnapshot] = Field(default_factory=list)
    turn_assessments: list[InterviewReviewTurnAssessmentSnapshot] = Field(
        default_factory=list
    )


class InterviewReviewInput(InterviewReviewModel):
    completion_reason: InterviewReviewCompletionReason
    review_mode: InterviewReviewMode
    session: InterviewReviewSessionSnapshot
    configuration: InterviewConfiguration
    interaction_language: InteractionLanguage
    planner_context: InterviewPlanningInput
    questions: list[InterviewReviewQuestionSnapshot] = Field(default_factory=list)
    candidate_question_exchanges: list[InterviewCandidateQuestionExchangeSnapshot] = (
        Field(default_factory=list)
    )
    training_memory: TrainingMemoryContext = Field(
        alias="trainingMemory",
        default_factory=TrainingMemoryContext,
    )

    @model_validator(mode="after")
    def validate_lineage(self) -> Self:
        if self.session.configuration != self.configuration:
            raise ValueError("review session configuration mismatch")
        if self.session.language != self.interaction_language:
            raise ValueError("review session language mismatch")
        if self.planner_context.configuration != self.configuration:
            raise ValueError("review planner configuration mismatch")
        if self.planner_context.interaction_language != self.interaction_language:
            raise ValueError("review planner language mismatch")
        if self.planner_context.target_role.id != self.configuration.target_role_id:
            raise ValueError("review target role mismatch")
        if [question.order for question in self.questions] != list(
            range(1, len(self.questions) + 1)
        ):
            raise ValueError("review questions must be contiguous")
        if [item.question.order for item in self.candidate_question_exchanges] != list(
            range(1, len(self.candidate_question_exchanges) + 1)
        ):
            raise ValueError("review candidate exchanges must be contiguous")
        if (
            self.completion_reason
            == (InterviewReviewCompletionReason.FORMAL_QUESTIONS_COMPLETED)
            and self.review_mode != InterviewReviewMode.COMPLETE
        ):
            raise ValueError("formal completion requires complete review mode")
        return self


class InterviewReviewQuestionAssessment(InterviewReviewModel):
    question_id: StandardUUID
    score: Annotated[int, Field(strict=True, ge=0, le=100)]
    summary: ReviewText
    strengths: ReviewList = Field(default_factory=list)
    issues: ReviewList = Field(default_factory=list)


class InterviewReviewFollowUpAssessment(InterviewReviewModel):
    follow_up_question_id: StandardUUID
    score: Annotated[int, Field(strict=True, ge=0, le=100)]
    summary: ReviewText
    strengths: ReviewList = Field(default_factory=list)
    issues: ReviewList = Field(default_factory=list)


class InterviewReviewReferenceAnswer(InterviewReviewModel):
    target_type: Literal["main", "followUp"]
    question_id: StandardUUID
    follow_up_question_id: StandardUUID | None = None
    recommended_structure: ReferenceList
    key_points: ReferenceList
    example_answer: ReviewText
    usage_guidance: ReviewText

    @model_validator(mode="after")
    def validate_target(self) -> Self:
        if self.target_type == "main" and self.follow_up_question_id is not None:
            raise ValueError("main reference answer cannot target a follow-up")
        if self.target_type == "followUp" and self.follow_up_question_id is None:
            raise ValueError("follow-up reference answer requires a follow-up id")
        return self


class InterviewReviewDimensionScore(InterviewReviewModel):
    dimension: InterviewReviewDimension
    score: Annotated[int, Field(strict=True, ge=0, le=100)]
    explanation: ReviewText


class InterviewReviewTargetedPractice(InterviewReviewModel):
    action: Literal["targetedPractice"]
    reason: ReviewText
    focus_areas: ReferenceList
    question_type: InterviewQuestionType
    difficulty: InterviewDifficulty


class InterviewReviewMockInterview(InterviewReviewModel):
    action: Literal["mockInterview"]
    reason: ReviewText
    focus_areas: ReferenceList
    round: InterviewRound
    difficulty: InterviewDifficulty


InterviewReviewTrainingSuggestion = Annotated[
    InterviewReviewTargetedPractice | InterviewReviewMockInterview,
    Field(discriminator="action"),
]


class InterviewReviewOutput(InterviewReviewModel):
    """Structured review output; the service enforces the server-selected mode."""

    overall_performance: ReviewText | None = None
    question_reviews: list[InterviewReviewQuestionAssessment] = Field(
        default_factory=list
    )
    follow_up_reviews: list[InterviewReviewFollowUpAssessment] = Field(
        default_factory=list
    )
    main_strengths: ReviewList = Field(default_factory=list)
    frequent_issues: ReviewList = Field(default_factory=list)
    exposed_weaknesses: ReviewList = Field(default_factory=list)
    risk_points: ReviewList = Field(default_factory=list)
    communication_suggestions: ReviewList = Field(default_factory=list)
    preparation_suggestions: ReviewList = Field(default_factory=list)
    overall_score: Annotated[int, Field(strict=True, ge=0, le=100)] | None = None
    dimension_scores: list[InterviewReviewDimensionScore] = Field(default_factory=list)
    next_training: InterviewReviewTrainingSuggestion | None = None
    reference_answers: list[InterviewReviewReferenceAnswer] = Field(
        default_factory=list
    )
