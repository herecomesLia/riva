from collections.abc import Callable
from typing import Literal, cast
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.agents.runtime.runs import AgentRunService
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    InterviewSession,
    TargetRole,
)
from riva.prompts import INTERVIEW_PLANNING_PROMPT
from riva.prompts.base import PromptDefinition
from riva.schemas.interview import (
    InterviewConfiguration,
    InterviewDifficulty,
    InterviewDurationMinutes,
    InterviewRound,
)
from riva.schemas.interview_planning import (
    InterviewCareerProfileSnapshot,
    InterviewJobDescriptionAnalysisSnapshot,
    InterviewMatchingAnalysisSnapshot,
    InterviewPlanningInput,
    InterviewPlanningOutput,
    InterviewPlanningRunPayload,
    InterviewPlanningSessionSnapshot,
    InterviewTargetRoleSnapshot,
    validate_interview_plan_for_duration,
)
from riva.schemas.matching_analysis import MatchingAnalysisOutput
from riva.schemas.training_memory import TrainingMemoryContext
from riva.services.interview_planning_prompt_versions import (
    get_interview_planning_prompt,
)
from riva.services.matching_analyses import (
    _career_profile_loader_options,
    build_matching_career_profile,
    build_matching_job_context,
)
from riva.services.profile_completion import career_profile_completed
from riva.services.training_memory import TrainingMemoryService

InterviewPlanningWorkflowErrorCode = Literal[
    "interview_planning_state_invalid",
    "interview_planning_run_invalid",
    "interview_planning_snapshot_invalid",
    "interview_planning_profile_incomplete",
    "interview_planning_profile_not_found",
    "interview_planning_target_role_not_found",
    "interview_planning_job_description_not_ready",
    "interview_planner_model_not_configured",
]

INTERVIEW_PLANNING_STATE_INVALID: InterviewPlanningWorkflowErrorCode = (
    "interview_planning_state_invalid"
)
INTERVIEW_PLANNING_RUN_INVALID: InterviewPlanningWorkflowErrorCode = (
    "interview_planning_run_invalid"
)
INTERVIEW_PLANNING_SNAPSHOT_INVALID: InterviewPlanningWorkflowErrorCode = (
    "interview_planning_snapshot_invalid"
)
INTERVIEW_PLANNING_PROFILE_INCOMPLETE: InterviewPlanningWorkflowErrorCode = (
    "interview_planning_profile_incomplete"
)
INTERVIEW_PLANNING_PROFILE_NOT_FOUND: InterviewPlanningWorkflowErrorCode = (
    "interview_planning_profile_not_found"
)
INTERVIEW_PLANNING_TARGET_ROLE_NOT_FOUND: InterviewPlanningWorkflowErrorCode = (
    "interview_planning_target_role_not_found"
)
INTERVIEW_PLANNING_JOB_DESCRIPTION_NOT_READY: InterviewPlanningWorkflowErrorCode = (
    "interview_planning_job_description_not_ready"
)
INTERVIEW_PLANNER_MODEL_NOT_CONFIGURED: InterviewPlanningWorkflowErrorCode = (
    "interview_planner_model_not_configured"
)

AgentRunServiceFactory = Callable[[AsyncSession], AgentRunService]
TrainingMemoryServiceFactory = Callable[[AsyncSession], TrainingMemoryService]


class InterviewPlanningWorkflowError(RuntimeError):
    safe_message = "The interview planning workflow is invalid."

    def __init__(self, code: InterviewPlanningWorkflowErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


class InterviewPlanningWorkflow:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_model: str | None = None,
        agent_run_service_factory: AgentRunServiceFactory | None = None,
        training_memory_service_factory: TrainingMemoryServiceFactory = (
            TrainingMemoryService
        ),
    ) -> None:
        self.session = session
        self.llm_model = llm_model
        self.agent_run_service_factory = agent_run_service_factory or AgentRunService
        self.training_memory_service_factory = training_memory_service_factory

    async def enqueue_planning_run(
        self,
        interview_session: InterviewSession,
        *,
        user_id: UUID,
        session_version: int,
        training_memory: TrainingMemoryContext | None = None,
    ) -> AgentRun:
        planning_input = await self.build_planning_input(
            interview_session,
            user_id=user_id,
            training_memory=training_memory,
        )
        payload = self.build_run_payload(interview_session, planning_input)
        model = (self.llm_model or "").strip()
        if not model:
            raise InterviewPlanningWorkflowError(INTERVIEW_PLANNER_MODEL_NOT_CONFIGURED)

        prompt = INTERVIEW_PLANNING_PROMPT
        return await self.agent_run_service_factory(
            self.session
        ).enqueue_in_transaction(
            user_id=user_id,
            agent_id=prompt.prompt_id,
            prompt_id=prompt.prompt_id,
            prompt_version=prompt.version,
            output_schema_id=prompt.output_schema_id,
            model=model,
            payload=cast(
                dict[str, object],
                payload.model_dump(mode="json", by_alias=True),
            ),
            idempotency_key=(
                f"interview-planner:{interview_session.id}:v{session_version}"
            ),
            max_attempts=3,
        )

    async def build_planning_input(
        self,
        interview_session: InterviewSession,
        *,
        user_id: UUID,
        training_memory: TrainingMemoryContext | None = None,
    ) -> InterviewPlanningInput:
        profile = await self.session.scalar(
            select(CareerProfile)
            .options(*_career_profile_loader_options())
            .where(CareerProfile.user_id == user_id)
        )
        if profile is None:
            raise InterviewPlanningWorkflowError(INTERVIEW_PLANNING_PROFILE_NOT_FOUND)
        if not career_profile_completed(profile):
            raise InterviewPlanningWorkflowError(INTERVIEW_PLANNING_PROFILE_INCOMPLETE)

        role = await self.session.scalar(
            select(TargetRole)
            .options(
                selectinload(TargetRole.job_description_analysis),
                selectinload(TargetRole.matching_analysis),
                selectinload(TargetRole.matching_analysis_run),
            )
            .where(
                TargetRole.id == interview_session.target_role_id,
                TargetRole.user_id == user_id,
            )
        )
        if role is None or role.preparation_status == "archived":
            raise InterviewPlanningWorkflowError(
                INTERVIEW_PLANNING_TARGET_ROLE_NOT_FOUND
            )
        analysis = role.job_description_analysis
        if not (
            role.job_description_status == "saved"
            and role.raw_job_description is not None
            and role.raw_job_description.strip()
            and role.job_description_version is not None
            and analysis is not None
            and analysis.job_description_version == role.job_description_version
        ):
            raise InterviewPlanningWorkflowError(
                INTERVIEW_PLANNING_JOB_DESCRIPTION_NOT_READY
            )

        try:
            career_profile = build_matching_career_profile(profile)
            job_context = build_matching_job_context(role, analysis)
            configuration = self.session_configuration(interview_session)
            matching_snapshot = _matching_snapshot(role, profile)
            if training_memory is None:
                training_memory = await self.training_memory_service_factory(
                    self.session
                ).get_context(user_id)
            return InterviewPlanningInput(
                session=InterviewPlanningSessionSnapshot(
                    id=interview_session.id,
                    version=interview_session.version,
                    status=interview_session.status,
                    language=cast(str, interview_session.language),
                    configuration=configuration,
                ),
                configuration=configuration,
                interaction_language=cast(str, interview_session.language),
                career_profile=InterviewCareerProfileSnapshot(
                    profile_id=profile.profile_id,
                    version=profile.version,
                    **career_profile.model_dump(mode="python"),
                ),
                target_role=InterviewTargetRoleSnapshot(
                    id=role.id,
                    title=role.title,
                    company=role.company,
                    recruitment_type=role.recruitment_type,
                    location=role.location,
                    version=role.version,
                    job_description_version=role.job_description_version,
                ),
                job_description_analysis=InterviewJobDescriptionAnalysisSnapshot(
                    job_description_version=analysis.job_description_version,
                    analysis_version=analysis.analysis_version,
                    **job_context.job_description_analysis.model_dump(mode="python"),
                ),
                matching_analysis=matching_snapshot,
                training_memory=training_memory,
            )
        except InterviewPlanningWorkflowError:
            raise
        except AttributeError, TypeError, ValueError, ValidationError:
            raise InterviewPlanningWorkflowError(
                INTERVIEW_PLANNING_SNAPSHOT_INVALID
            ) from None

    @staticmethod
    def build_run_payload(
        interview_session: InterviewSession,
        planning_input: InterviewPlanningInput,
    ) -> InterviewPlanningRunPayload:
        try:
            return InterviewPlanningRunPayload(
                session_id=interview_session.id,
                session_version=interview_session.version,
                profile_id=planning_input.career_profile.profile_id,
                profile_version=planning_input.career_profile.version,
                target_role_id=planning_input.target_role.id,
                target_role_version=planning_input.target_role.version,
                job_description_version=(
                    planning_input.job_description_analysis.job_description_version
                ),
                job_description_analysis_version=(
                    planning_input.job_description_analysis.analysis_version
                ),
                interaction_language=planning_input.interaction_language,
                interview_planning_input=planning_input,
            )
        except TypeError, ValueError, ValidationError:
            raise InterviewPlanningWorkflowError(
                INTERVIEW_PLANNING_SNAPSHOT_INVALID
            ) from None

    def load_planning_input(self, run: AgentRun) -> InterviewPlanningInput:
        return self.validate_run_payload(run).interview_planning_input

    def retry_training_memory(self, run: AgentRun) -> TrainingMemoryContext:
        if run.payload:
            return self.load_planning_input(run).training_memory
        return TrainingMemoryContext()

    @staticmethod
    def validate_run_payload(run: AgentRun) -> InterviewPlanningRunPayload:
        InterviewPlanningWorkflow.prompt_for_run(run)
        try:
            return InterviewPlanningRunPayload.model_validate(run.payload)
        except TypeError, ValueError, ValidationError:
            raise InterviewPlanningWorkflowError(
                INTERVIEW_PLANNING_SNAPSHOT_INVALID
            ) from None

    @staticmethod
    def prompt_for_run(
        run: AgentRun,
    ) -> PromptDefinition[InterviewPlanningOutput]:
        try:
            prompt = get_interview_planning_prompt(run.prompt_version)
        except ValueError:
            raise InterviewPlanningWorkflowError(
                INTERVIEW_PLANNING_RUN_INVALID
            ) from None
        if (
            run.agent_id != prompt.prompt_id
            or run.prompt_id != prompt.prompt_id
            or run.output_schema_id != prompt.output_schema_id
        ):
            raise InterviewPlanningWorkflowError(INTERVIEW_PLANNING_RUN_INVALID)
        return prompt

    @staticmethod
    def validate_persisted_run_identity(
        persisted_run: AgentRun,
        run: AgentRun,
    ) -> None:
        prompt = InterviewPlanningWorkflow.prompt_for_run(run)
        if (
            persisted_run.user_id != run.user_id
            or persisted_run.agent_id != prompt.prompt_id
            or persisted_run.prompt_id != prompt.prompt_id
            or persisted_run.prompt_version != prompt.version
            or persisted_run.output_schema_id != prompt.output_schema_id
        ):
            raise InterviewPlanningWorkflowError(INTERVIEW_PLANNING_RUN_INVALID)

    @staticmethod
    def validate_output(output: object) -> InterviewPlanningOutput:
        try:
            if isinstance(output, InterviewPlanningOutput):
                return output
            return InterviewPlanningOutput.model_validate(output)
        except TypeError, ValueError, ValidationError:
            raise InterviewPlanningWorkflowError(
                INTERVIEW_PLANNING_SNAPSHOT_INVALID
            ) from None

    @staticmethod
    def validate_output_for_duration(
        output: InterviewPlanningOutput,
        duration_minutes: int,
    ) -> None:
        try:
            validate_interview_plan_for_duration(output, duration_minutes)
        except TypeError, ValueError, ValidationError:
            raise InterviewPlanningWorkflowError(
                INTERVIEW_PLANNING_SNAPSHOT_INVALID
            ) from None

    @staticmethod
    def session_configuration(session: InterviewSession) -> InterviewConfiguration:
        try:
            return InterviewConfiguration(
                target_role_id=session.target_role_id,
                round=InterviewRound(session.round),
                difficulty=InterviewDifficulty(session.difficulty),
                duration_minutes=InterviewDurationMinutes(session.duration_minutes),
            )
        except TypeError, ValueError:
            raise InterviewPlanningWorkflowError(
                INTERVIEW_PLANNING_STATE_INVALID
            ) from None


def _matching_snapshot(
    role: TargetRole,
    profile: CareerProfile,
) -> InterviewMatchingAnalysisSnapshot | None:
    matching = role.matching_analysis
    matching_run = role.matching_analysis_run
    if matching is None or matching_run is None:
        return None
    if _status_value(matching_run.status) != AgentRunStatus.SUCCEEDED.value:
        return None
    if (
        role.matching_analysis_run_id != matching.source_agent_run_id
        or matching.role_id != role.id
        or matching.user_id != role.user_id
        or matching.profile_id != profile.profile_id
        or matching.profile_version != profile.version
        or matching.job_description_version != role.job_description_version
        or role.job_description_analysis is None
        or matching.job_description_analysis_version
        != role.job_description_analysis.analysis_version
    ):
        return None
    try:
        result = MatchingAnalysisOutput(
            overall_match_score=matching.overall_match_score,
            core_requirements_summary=matching.core_requirements_summary,
            matched_capabilities=matching.matched_capabilities,
            missing_capabilities=matching.missing_capabilities,
            underrepresented_capabilities=matching.underrepresented_capabilities,
            resume_highlights=matching.resume_highlights,
            resume_gaps=matching.resume_gaps,
            high_risk_questions=matching.high_risk_questions,
            preparation_recommendations=matching.preparation_recommendations,
        )
        return InterviewMatchingAnalysisSnapshot(
            source_agent_run_id=matching.source_agent_run_id,
            role_id=matching.role_id,
            profile_id=matching.profile_id,
            profile_version=matching.profile_version,
            job_description_version=matching.job_description_version,
            job_description_analysis_version=(
                matching.job_description_analysis_version
            ),
            **result.model_dump(mode="python"),
        )
    except TypeError, ValueError, ValidationError:
        return None


def _status_value(status: object) -> str:
    return str(getattr(status, "value", status))


__all__ = [
    "INTERVIEW_PLANNER_MODEL_NOT_CONFIGURED",
    "INTERVIEW_PLANNING_JOB_DESCRIPTION_NOT_READY",
    "INTERVIEW_PLANNING_PROFILE_INCOMPLETE",
    "INTERVIEW_PLANNING_PROFILE_NOT_FOUND",
    "INTERVIEW_PLANNING_RUN_INVALID",
    "INTERVIEW_PLANNING_SNAPSHOT_INVALID",
    "INTERVIEW_PLANNING_STATE_INVALID",
    "INTERVIEW_PLANNING_TARGET_ROLE_NOT_FOUND",
    "InterviewPlanningWorkflow",
    "InterviewPlanningWorkflowError",
    "InterviewPlanningWorkflowErrorCode",
]
