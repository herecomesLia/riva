from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, StringConstraints, model_validator

from riva.agents.base import AgentModel
from riva.agents.interview.planning_types import (
    InterviewCareerProfileSnapshot,
    InterviewJobDescriptionAnalysisSnapshot,
    InterviewMatchingAnalysisSnapshot,
    InterviewTargetRoleSnapshot,
)
from riva.agents.types import (
    InterviewConfiguration,
    InterviewQuestionType,
    InterviewSessionStatus,
    StandardUUID,
)
from riva.core.language import InteractionLanguage

MAX_INTERVIEW_FOLLOW_UPS_BASIC = 1
MAX_INTERVIEW_FOLLOW_UPS_PRESSURE = 2
MAX_INTERVIEW_FOLLOW_UPS = MAX_INTERVIEW_FOLLOW_UPS_PRESSURE


class InterviewTurnModel(AgentModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )


TurnText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000),
]
TurnAnswerContent = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000),
]
TurnPrompt = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000),
]
TurnTextList = Annotated[
    list[TurnText],
    Field(max_length=50),
]


class InterviewTurnSessionSnapshot(InterviewTurnModel):
    id: StandardUUID
    version: Annotated[int, Field(strict=True, ge=1)]
    status: InterviewSessionStatus
    language: InteractionLanguage
    configuration: InterviewConfiguration


class InterviewTurnQuestionContext(InterviewTurnModel):
    prompt: TurnPrompt
    question_type: InterviewQuestionType
    assessed_capabilities: Annotated[
        list[TurnText],
        Field(min_length=1, max_length=20),
    ]
    objective: TurnText
    follow_up_directions: Annotated[
        list[TurnText],
        Field(min_length=1, max_length=50),
    ]
    scoring_focus: Annotated[
        list[TurnText],
        Field(min_length=1, max_length=50),
    ]


class InterviewTurnAnswerSnapshot(InterviewTurnModel):
    id: StandardUUID
    content: TurnAnswerContent
    submitted_at: datetime

    @model_validator(mode="after")
    def validate_submitted_at(self) -> Self:
        if self.submitted_at.tzinfo is None or self.submitted_at.utcoffset() is None:
            raise ValueError("submitted_at must be timezone-aware")
        return self


class InterviewTurnFollowUpExchange(InterviewTurnModel):
    order: Annotated[int, Field(strict=True, ge=1, le=MAX_INTERVIEW_FOLLOW_UPS)]
    question_id: StandardUUID
    prompt: TurnPrompt
    answer: InterviewTurnAnswerSnapshot


class InterviewTurnInput(InterviewTurnModel):
    session: InterviewTurnSessionSnapshot
    plan_id: StandardUUID
    plan_revision: Annotated[int, Field(strict=True, ge=1)]
    question_id: StandardUUID
    planned_question: InterviewTurnQuestionContext
    main_answer: InterviewTurnAnswerSnapshot
    answered_follow_ups: list[InterviewTurnFollowUpExchange] = Field(
        default_factory=list,
        max_length=MAX_INTERVIEW_FOLLOW_UPS,
    )
    remaining_follow_up_slots: Annotated[
        int,
        Field(strict=True, ge=0, le=MAX_INTERVIEW_FOLLOW_UPS),
    ]
    career_profile: InterviewCareerProfileSnapshot
    target_role: InterviewTargetRoleSnapshot
    job_description_analysis: InterviewJobDescriptionAnalysisSnapshot
    matching_analysis: InterviewMatchingAnalysisSnapshot | None = None

    @model_validator(mode="after")
    def validate_lineage(self) -> Self:
        if self.session.configuration.target_role_id != self.target_role.id:
            raise ValueError("turn target role does not match session configuration")
        if self.target_role.job_description_version != (
            self.job_description_analysis.job_description_version
        ):
            raise ValueError("turn job description snapshot is stale")
        if self.session.status not in {"question", "followUp"}:
            raise ValueError("turn session status is not answerable")
        if [exchange.order for exchange in self.answered_follow_ups] != list(
            range(1, len(self.answered_follow_ups) + 1)
        ):
            raise ValueError("answered follow-ups must be contiguous")
        max_slots = (
            MAX_INTERVIEW_FOLLOW_UPS_PRESSURE
            if self.session.configuration.difficulty.value == "pressure"
            else MAX_INTERVIEW_FOLLOW_UPS_BASIC
        )
        if self.remaining_follow_up_slots != max_slots - len(self.answered_follow_ups):
            raise ValueError("remaining follow-up slots do not match difficulty")
        matching = self.matching_analysis
        if matching is not None:
            if matching.role_id != self.target_role.id:
                raise ValueError("turn matching role does not match target role")
            if matching.profile_id != self.career_profile.profile_id:
                raise ValueError("turn matching profile does not match profile")
            if matching.profile_version != self.career_profile.version:
                raise ValueError("turn matching profile snapshot is stale")
            if matching.job_description_version != (
                self.job_description_analysis.job_description_version
            ):
                raise ValueError("turn matching JD snapshot is stale")
            if matching.job_description_analysis_version != (
                self.job_description_analysis.analysis_version
            ):
                raise ValueError("turn matching analysis snapshot is stale")
        return self


class InterviewTurnAssessmentOutput(InterviewTurnModel):
    score: Annotated[int, Field(strict=True, ge=0, le=100)]
    summary: TurnText
    strengths: TurnTextList = Field(default_factory=list)
    issues: TurnTextList = Field(default_factory=list)


class InterviewTurnFollowUpAction(InterviewTurnModel):
    type: Literal["followUp"]
    prompt: TurnPrompt


class InterviewTurnCompleteQuestionAction(InterviewTurnModel):
    type: Literal["completeQuestion"]


InterviewTurnNextAction = Annotated[
    InterviewTurnFollowUpAction | InterviewTurnCompleteQuestionAction,
    Field(discriminator="type"),
]


class InterviewTurnOutput(InterviewTurnModel):
    assessment: InterviewTurnAssessmentOutput
    next_action: InterviewTurnNextAction


# Domain aliases make the persisted "turn" vocabulary discoverable to callers
# without introducing a second wire contract.
InterviewTurnAssessment = InterviewTurnAssessmentOutput
