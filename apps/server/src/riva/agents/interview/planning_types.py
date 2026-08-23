from typing import Annotated, Self

from pydantic import ConfigDict, Field, StringConstraints, model_validator

from riva.agents.base import AgentModel
from riva.agents.jobs.jd_parser_types import (
    Company,
    JobDescriptionParsingOutput,
    RoleTitle,
)
from riva.agents.jobs.matcher_types import (
    MatchingAnalysisOutput,
    MatchingCareerProfile,
)
from riva.agents.training.memory_types import TrainingMemoryContext
from riva.agents.types import (
    InterviewConfiguration,
    InterviewQuestionType,
    InterviewSessionStatus,
    OptionalText,
    RequiredText,
    StandardUUID,
)
from riva.core.language import InteractionLanguage


class InterviewPlanningModel(AgentModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )


PlanningText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000),
]
PlanningTextList = Annotated[
    list[PlanningText],
    Field(min_length=1, max_length=50),
]
QuestionPrompt = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
]


class InterviewPlanningQuestion(InterviewPlanningModel):
    order: Annotated[int, Field(strict=True, ge=1, le=7)]
    question_type: InterviewQuestionType
    prompt: QuestionPrompt
    assessed_capabilities: Annotated[
        list[RequiredText],
        Field(min_length=1, max_length=20),
    ]
    objective: PlanningText
    follow_up_directions: PlanningTextList
    scoring_focus: PlanningTextList


class InterviewPlanningOutput(InterviewPlanningModel):
    total_main_questions: Annotated[
        int,
        Field(strict=True, ge=2, le=7),
    ]
    questions: Annotated[
        list[InterviewPlanningQuestion],
        Field(min_length=2, max_length=7),
    ]

    @model_validator(mode="after")
    def validate_question_sequence(self) -> Self:
        if self.total_main_questions != len(self.questions):
            raise ValueError("totalMainQuestions must equal the number of questions")
        expected_orders = list(range(1, len(self.questions) + 1))
        if [question.order for question in self.questions] != expected_orders:
            raise ValueError("questions must have continuous order starting at 1")
        return self


class InterviewPlanningSessionSnapshot(InterviewPlanningModel):
    id: StandardUUID
    version: Annotated[int, Field(strict=True, ge=1)]
    status: InterviewSessionStatus
    language: InteractionLanguage
    configuration: InterviewConfiguration


class InterviewCareerProfileSnapshot(
    MatchingCareerProfile,
    InterviewPlanningModel,
):
    profile_id: StandardUUID
    version: Annotated[int, Field(strict=True, ge=1)]


class InterviewTargetRoleSnapshot(InterviewPlanningModel):
    id: StandardUUID
    title: RoleTitle
    company: Company
    recruitment_type: OptionalText
    location: OptionalText
    version: Annotated[int, Field(strict=True, ge=1)]
    job_description_version: Annotated[int, Field(strict=True, ge=1)]


class InterviewJobDescriptionAnalysisSnapshot(
    JobDescriptionParsingOutput,
    InterviewPlanningModel,
):
    job_description_version: Annotated[int, Field(strict=True, ge=1)]
    analysis_version: Annotated[int, Field(strict=True, ge=1)]


class InterviewMatchingAnalysisSnapshot(
    MatchingAnalysisOutput,
    InterviewPlanningModel,
):
    role_id: StandardUUID
    profile_id: StandardUUID
    profile_version: Annotated[int, Field(strict=True, ge=1)]
    job_description_version: Annotated[int, Field(strict=True, ge=1)]
    job_description_analysis_version: Annotated[
        int,
        Field(strict=True, ge=1),
    ]


class InterviewPlanningInput(InterviewPlanningModel):
    session: InterviewPlanningSessionSnapshot
    configuration: InterviewConfiguration
    interaction_language: InteractionLanguage
    career_profile: InterviewCareerProfileSnapshot
    target_role: InterviewTargetRoleSnapshot
    job_description_analysis: InterviewJobDescriptionAnalysisSnapshot
    matching_analysis: InterviewMatchingAnalysisSnapshot | None = None
    training_memory: TrainingMemoryContext = Field(
        default_factory=TrainingMemoryContext,
    )

    @model_validator(mode="after")
    def validate_lineage(self) -> Self:
        if self.session.configuration != self.configuration:
            raise ValueError("session configuration does not match configuration")
        if self.session.language != self.interaction_language:
            raise ValueError("session language does not match interaction language")
        if self.configuration.target_role_id != self.target_role.id:
            raise ValueError("configuration target role does not match target role")
        if self.target_role.job_description_version != (
            self.job_description_analysis.job_description_version
        ):
            raise ValueError(
                "target role and job description analysis versions do not match"
            )
        matching = self.matching_analysis
        if matching is not None:
            if matching.role_id != self.target_role.id:
                raise ValueError("matching analysis role does not match target role")
            if matching.profile_id != self.career_profile.profile_id:
                raise ValueError(
                    "matching analysis profile does not match career profile"
                )
            if matching.profile_version != self.career_profile.version:
                raise ValueError("matching analysis profile version is stale")
            if matching.job_description_version != (
                self.job_description_analysis.job_description_version
            ):
                raise ValueError("matching analysis job description is stale")
            if matching.job_description_analysis_version != (
                self.job_description_analysis.analysis_version
            ):
                raise ValueError("matching analysis analysis version is stale")
        return self


QUESTION_COUNT_RANGES: dict[int, tuple[int, int]] = {
    15: (2, 3),
    30: (3, 5),
    45: (5, 7),
}


def validate_interview_plan_for_duration(
    output: InterviewPlanningOutput,
    duration_minutes: int,
) -> InterviewPlanningOutput:
    try:
        minimum, maximum = QUESTION_COUNT_RANGES[duration_minutes]
    except KeyError:
        raise ValueError("duration_minutes must be one of 15, 30, or 45") from None
    if not minimum <= output.total_main_questions <= maximum:
        raise ValueError("totalMainQuestions does not match the interview duration")
    return output


# These aliases keep the domain vocabulary discoverable for callers that use
# the persisted plan name rather than the agent name.
InterviewPlanOutput = InterviewPlanningOutput
InterviewPlanQuestion = InterviewPlanningQuestion
InterviewPlanInput = InterviewPlanningInput
