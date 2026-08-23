from __future__ import annotations

from datetime import datetime
from typing import Annotated, Self

from pydantic import ConfigDict, Field, StringConstraints, model_validator

from riva.core.language import InteractionLanguage
from riva.schemas.base import APIModel
from riva.schemas.interview import (
    InterviewConfiguration,
    InterviewQuestionType,
    InterviewSessionStatus,
)
from riva.schemas.interview_planning import (
    InterviewPlanningInput,
)
from riva.schemas.profile import RequiredText, StandardUUID


class InterviewCandidateQuestionModel(APIModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )


CandidateQuestionText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000),
]
CandidateAnswerText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000),
]
CandidateQuestionFeedbackText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000),
]
CandidateQuestionFeedbackList = Annotated[
    list[CandidateQuestionFeedbackText],
    Field(max_length=20),
]


class InterviewCandidateQuestionSessionSnapshot(InterviewCandidateQuestionModel):
    id: StandardUUID
    version: Annotated[int, Field(strict=True, ge=1)]
    status: InterviewSessionStatus
    language: InteractionLanguage
    configuration: InterviewConfiguration


class InterviewCandidateQuestionSnapshot(InterviewCandidateQuestionModel):
    id: StandardUUID
    content: CandidateQuestionText
    submitted_at: datetime
    order: Annotated[int, Field(strict=True, ge=1)]

    @model_validator(mode="after")
    def validate_submitted_at(self) -> Self:
        if self.submitted_at.tzinfo is None or self.submitted_at.utcoffset() is None:
            raise ValueError("candidate question submitted_at must be timezone-aware")
        return self


class InterviewCandidateQuestionAnswerSnapshot(InterviewCandidateQuestionModel):
    id: StandardUUID
    content: CandidateAnswerText
    submitted_at: datetime

    @model_validator(mode="after")
    def validate_submitted_at(self) -> Self:
        if self.submitted_at.tzinfo is None or self.submitted_at.utcoffset() is None:
            raise ValueError("candidate answer submitted_at must be timezone-aware")
        return self


class InterviewCandidateQuestionExchangeSnapshot(InterviewCandidateQuestionModel):
    question: InterviewCandidateQuestionSnapshot
    interviewer_answer: CandidateQuestionText
    feedback_summary: CandidateQuestionFeedbackText
    strengths: CandidateQuestionFeedbackList = Field(default_factory=list)
    improvement_suggestions: CandidateQuestionFeedbackList = Field(default_factory=list)
    suggested_alternatives: CandidateQuestionFeedbackList = Field(default_factory=list)


class InterviewCandidateCompletedFollowUpSnapshot(InterviewCandidateQuestionModel):
    id: StandardUUID
    parent_question_id: StandardUUID
    prompt: CandidateQuestionText
    order: Annotated[int, Field(strict=True, ge=1)]
    answer: InterviewCandidateQuestionAnswerSnapshot | None = None


class InterviewCandidateCompletedQuestionSnapshot(InterviewCandidateQuestionModel):
    id: StandardUUID
    order: Annotated[int, Field(strict=True, ge=1)]
    prompt: CandidateQuestionText
    question_type: InterviewQuestionType
    assessed_capabilities: list[RequiredText]
    answer: InterviewCandidateQuestionAnswerSnapshot | None = None
    follow_ups: list[InterviewCandidateCompletedFollowUpSnapshot] = Field(
        default_factory=list
    )


class InterviewCandidateQuestionInput(InterviewCandidateQuestionModel):
    session: InterviewCandidateQuestionSessionSnapshot
    configuration: InterviewConfiguration
    interaction_language: InteractionLanguage
    planner_context: InterviewPlanningInput
    completed_questions: list[InterviewCandidateCompletedQuestionSnapshot] = Field(
        default_factory=list
    )
    current_candidate_question: InterviewCandidateQuestionSnapshot
    previous_exchanges: list[InterviewCandidateQuestionExchangeSnapshot] = Field(
        default_factory=list
    )

    @model_validator(mode="after")
    def validate_lineage(self) -> Self:
        if self.session.configuration != self.configuration:
            raise ValueError("candidate question session configuration mismatch")
        if self.session.language != self.interaction_language:
            raise ValueError("candidate question session language mismatch")
        if self.planner_context.configuration != self.configuration:
            raise ValueError("candidate question planner configuration mismatch")
        if self.planner_context.interaction_language != self.interaction_language:
            raise ValueError("candidate question planner language mismatch")
        if self.planner_context.target_role.id != self.configuration.target_role_id:
            raise ValueError("candidate question target role mismatch")
        if [item.question.order for item in self.previous_exchanges] != list(
            range(1, len(self.previous_exchanges) + 1)
        ):
            raise ValueError("candidate question exchanges must be contiguous")
        return self


class InterviewCandidateQuestionFeedback(InterviewCandidateQuestionModel):
    summary: CandidateQuestionFeedbackText
    strengths: CandidateQuestionFeedbackList = Field(default_factory=list)
    improvement_suggestions: CandidateQuestionFeedbackList = Field(default_factory=list)
    suggested_alternatives: CandidateQuestionFeedbackList = Field(default_factory=list)


class InterviewCandidateQuestionOutput(InterviewCandidateQuestionModel):
    interviewer_answer: CandidateQuestionText
    feedback: InterviewCandidateQuestionFeedback


# A compact alias keeps the agent/service vocabulary aligned with the prompt
# and the persisted exchange name.
InterviewCandidateQuestionOutputModel = InterviewCandidateQuestionOutput


__all__ = [
    "CandidateQuestionFeedbackList",
    "CandidateAnswerText",
    "CandidateQuestionFeedbackText",
    "CandidateQuestionText",
    "InterviewCandidateCompletedFollowUpSnapshot",
    "InterviewCandidateCompletedQuestionSnapshot",
    "InterviewCandidateQuestionAnswerSnapshot",
    "InterviewCandidateQuestionExchangeSnapshot",
    "InterviewCandidateQuestionFeedback",
    "InterviewCandidateQuestionInput",
    "InterviewCandidateQuestionModel",
    "InterviewCandidateQuestionOutput",
    "InterviewCandidateQuestionOutputModel",
    "InterviewCandidateQuestionSessionSnapshot",
    "InterviewCandidateQuestionSnapshot",
]
