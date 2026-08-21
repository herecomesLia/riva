from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, StringConstraints, model_validator

from riva.core.language import InteractionLanguage
from riva.schemas.base import APIModel
from riva.schemas.interview import (
    InterviewConfiguration,
    InterviewQuestionType,
    InterviewSessionStatus,
)
from riva.schemas.interview_planning import (
    InterviewCareerProfileSnapshot,
    InterviewJobDescriptionAnalysisSnapshot,
    InterviewMatchingAnalysisSnapshot,
    InterviewTargetRoleSnapshot,
)
from riva.schemas.profile import StandardUUID

MAX_INTERVIEW_FOLLOW_UPS_BASIC = 1
MAX_INTERVIEW_FOLLOW_UPS_PRESSURE = 2
MAX_INTERVIEW_FOLLOW_UPS = MAX_INTERVIEW_FOLLOW_UPS_PRESSURE


class InterviewTurnModel(APIModel):
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


class InterviewTurnRunPayload(InterviewTurnModel):
    session_id: StandardUUID
    session_version: Annotated[int, Field(strict=True, ge=1)]
    session_state_version: Annotated[int, Field(strict=True, ge=1)]
    plan_id: StandardUUID
    plan_revision: Annotated[int, Field(strict=True, ge=1)]
    question_id: StandardUUID
    target_type: Literal["main", "followUp"]
    submitted_answer_id: StandardUUID
    main_answer_id: StandardUUID
    follow_up_question_id: StandardUUID | None = None
    follow_up_answer_id: StandardUUID | None = None
    interaction_language: InteractionLanguage
    remaining_follow_up_slots: Annotated[
        int,
        Field(strict=True, ge=0, le=MAX_INTERVIEW_FOLLOW_UPS),
    ]
    interview_turn_input: InterviewTurnInput
    retry_of_run_id: StandardUUID | None = None

    @model_validator(mode="after")
    def validate_payload_lineage(self) -> Self:
        turn_input = self.interview_turn_input
        if self.session_state_version <= self.session_version:
            raise ValueError("session state version must advance the snapshot")
        if turn_input.session.id != self.session_id:
            raise ValueError("payload session id does not match turn input")
        if turn_input.session.version != self.session_version:
            raise ValueError("payload session version does not match turn input")
        if turn_input.session.language != self.interaction_language:
            raise ValueError("payload language does not match turn input")
        if turn_input.plan_id != self.plan_id:
            raise ValueError("payload plan id does not match turn input")
        if turn_input.plan_revision != self.plan_revision:
            raise ValueError("payload plan revision does not match turn input")
        if turn_input.question_id != self.question_id:
            raise ValueError("payload question id does not match turn input")
        if turn_input.main_answer.id != self.main_answer_id:
            raise ValueError("payload main answer id does not match turn input")
        if turn_input.remaining_follow_up_slots != self.remaining_follow_up_slots:
            raise ValueError("payload follow-up slots do not match turn input")
        if self.target_type == "main":
            if self.submitted_answer_id != self.main_answer_id:
                raise ValueError("main turn answer lineage is invalid")
            if (
                self.follow_up_question_id is not None
                or self.follow_up_answer_id is not None
            ):
                raise ValueError("main turn must not contain follow-up lineage")
        else:
            if self.follow_up_question_id is None or self.follow_up_answer_id is None:
                raise ValueError("follow-up turn requires follow-up lineage")
            if self.submitted_answer_id != self.follow_up_answer_id:
                raise ValueError("follow-up turn answer lineage is invalid")
            if not turn_input.answered_follow_ups or (
                turn_input.answered_follow_ups[-1].answer.id != self.follow_up_answer_id
            ):
                raise ValueError("turn input does not contain the submitted follow-up")
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


__all__ = [
    "InterviewTurnAnswerSnapshot",
    "InterviewTurnAssessment",
    "InterviewTurnAssessmentOutput",
    "InterviewTurnCompleteQuestionAction",
    "InterviewTurnFollowUpAction",
    "InterviewTurnFollowUpExchange",
    "InterviewTurnInput",
    "InterviewTurnModel",
    "InterviewTurnNextAction",
    "InterviewTurnOutput",
    "InterviewTurnQuestionContext",
    "InterviewTurnRunPayload",
    "InterviewTurnSessionSnapshot",
    "MAX_INTERVIEW_FOLLOW_UPS",
    "MAX_INTERVIEW_FOLLOW_UPS_BASIC",
    "MAX_INTERVIEW_FOLLOW_UPS_PRESSURE",
]
