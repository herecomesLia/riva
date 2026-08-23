from collections.abc import Callable
from datetime import datetime
from typing import Literal, cast
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.agents.interview_planning import InterviewPlanningAgent
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    InterviewPlan,
    InterviewQuestion,
    InterviewSession,
    TargetRole,
    User,
)
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
from riva.services.agent_runs import AgentRunService
from riva.services.matching_analyses import (
    _career_profile_loader_options,
    build_matching_career_profile,
    build_matching_job_context,
)
from riva.services.profile_completion import career_profile_completed
from riva.services.training_memory import TrainingMemoryService
from riva.utils import utc_now

InterviewPlanningStateErrorCode = Literal[
    "interview_session_not_found",
    "interview_session_version_conflict",
    "interview_planning_state_invalid",
    "interview_planning_run_invalid",
    "interview_planning_snapshot_invalid",
    "interview_planning_profile_incomplete",
    "interview_planning_profile_not_found",
    "interview_planning_target_role_not_found",
    "interview_planning_job_description_not_ready",
    "interview_planner_model_not_configured",
]

INTERVIEW_PLANNING_SESSION_NOT_FOUND: InterviewPlanningStateErrorCode = (
    "interview_session_not_found"
)
INTERVIEW_PLANNING_VERSION_CONFLICT: InterviewPlanningStateErrorCode = (
    "interview_session_version_conflict"
)
INTERVIEW_PLANNING_STATE_INVALID: InterviewPlanningStateErrorCode = (
    "interview_planning_state_invalid"
)
INTERVIEW_PLANNING_RUN_INVALID: InterviewPlanningStateErrorCode = (
    "interview_planning_run_invalid"
)
INTERVIEW_PLANNING_SNAPSHOT_INVALID: InterviewPlanningStateErrorCode = (
    "interview_planning_snapshot_invalid"
)
INTERVIEW_PLANNING_PROFILE_INCOMPLETE: InterviewPlanningStateErrorCode = (
    "interview_planning_profile_incomplete"
)
INTERVIEW_PLANNING_PROFILE_NOT_FOUND: InterviewPlanningStateErrorCode = (
    "interview_planning_profile_not_found"
)
INTERVIEW_PLANNING_TARGET_ROLE_NOT_FOUND: InterviewPlanningStateErrorCode = (
    "interview_planning_target_role_not_found"
)
INTERVIEW_PLANNING_JOB_DESCRIPTION_NOT_READY: InterviewPlanningStateErrorCode = (
    "interview_planning_job_description_not_ready"
)
INTERVIEW_PLANNER_MODEL_NOT_CONFIGURED: InterviewPlanningStateErrorCode = (
    "interview_planner_model_not_configured"
)


class InterviewPlanningStateError(RuntimeError):
    safe_message = "The interview planning state is invalid."

    def __init__(self, code: InterviewPlanningStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


Clock = Callable[[], datetime]


class InterviewPlanningService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_model: str | None = None,
        training_memory_service_factory: Callable[
            [AsyncSession], TrainingMemoryService
        ] = TrainingMemoryService,
        clock: Clock = utc_now,
    ) -> None:
        self.session = session
        self.llm_model = llm_model
        self.training_memory_service_factory = training_memory_service_factory
        self.clock = clock

    async def begin_questions(
        self,
        *,
        user_id: UUID,
        session_id: UUID,
        version: int,
    ) -> InterviewSession:
        try:
            await self._lock_user(user_id)
            interview_session = await self.session.scalar(
                select(InterviewSession)
                .where(
                    InterviewSession.id == session_id,
                    InterviewSession.user_id == user_id,
                )
                .with_for_update()
            )
            if interview_session is None:
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_SESSION_NOT_FOUND)
            if interview_session.version != version:
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_VERSION_CONFLICT)

            planning_run = None
            retry_memory: TrainingMemoryContext | None = None
            if interview_session.status == "generatingQuestion":
                if interview_session.planning_run_id is None:
                    raise InterviewPlanningStateError(INTERVIEW_PLANNING_STATE_INVALID)
                planning_run = await self.session.scalar(
                    select(AgentRun)
                    .where(AgentRun.id == interview_session.planning_run_id)
                    .with_for_update()
                )
                if planning_run is None:
                    raise InterviewPlanningStateError(INTERVIEW_PLANNING_STATE_INVALID)
                if _status_value(planning_run.status) in {
                    AgentRunStatus.QUEUED.value,
                    AgentRunStatus.RUNNING.value,
                }:
                    await self.session.commit()
                    return interview_session
                if _status_value(planning_run.status) != AgentRunStatus.FAILED.value:
                    raise InterviewPlanningStateError(INTERVIEW_PLANNING_STATE_INVALID)
                if planning_run.payload:
                    retry_memory = self._validate_run_payload(
                        planning_run
                    ).interview_planning_input.training_memory
                else:
                    # AgentRunService never persists an empty payload. Keep the
                    # legacy unit/test shape deterministic if a manually-created
                    # failed run has no snapshot at all.
                    retry_memory = TrainingMemoryContext()
            elif interview_session.status != "opening":
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_STATE_INVALID)

            planning_input = await self._build_planning_input(
                interview_session,
                user_id=user_id,
                training_memory=retry_memory,
            )
            payload = self._build_run_payload(
                interview_session,
                planning_input,
            )
            model = (self.llm_model or "").strip()
            if not model:
                raise InterviewPlanningStateError(
                    INTERVIEW_PLANNER_MODEL_NOT_CONFIGURED
                )

            run = await AgentRunService(self.session).enqueue_in_transaction(
                user_id=user_id,
                agent_id=InterviewPlanningAgent.agent_id,
                prompt_id=InterviewPlanningAgent.agent_id,
                prompt_version=InterviewPlanningAgent.agent_version,
                output_schema_id=InterviewPlanningAgent.output_schema_id,
                model=model,
                payload=cast(
                    dict[str, object],
                    payload.model_dump(mode="json", by_alias=True),
                ),
                idempotency_key=(
                    f"interview-planner:{interview_session.id}:v{version}"
                ),
                max_attempts=3,
            )
            interview_session.status = "generatingQuestion"
            interview_session.planning_run_id = run.id
            interview_session.version += 1
            await self.session.commit()
            return interview_session
        except InterviewPlanningStateError:
            await self.session.rollback()
            raise
        except Exception:
            await self.session.rollback()
            raise

    async def load_planning_input(
        self,
        run: AgentRun,
    ) -> InterviewPlanningInput:
        try:
            payload = self._validate_run_payload(run)
            return payload.interview_planning_input
        except InterviewPlanningStateError:
            raise
        except Exception:
            raise InterviewPlanningStateError(
                INTERVIEW_PLANNING_SNAPSHOT_INVALID
            ) from None

    async def persist_success(
        self,
        run: AgentRun,
        output: InterviewPlanningOutput,
    ) -> InterviewPlan:
        try:
            payload = self._validate_run_payload(run)
            self._validate_run_metadata(run)
            if not isinstance(output, InterviewPlanningOutput):
                output = InterviewPlanningOutput.model_validate(output)

            await self._lock_user(run.user_id)
            persisted_run = await self.session.scalar(
                select(AgentRun).where(AgentRun.id == run.id).with_for_update()
            )
            if persisted_run is None or _status_value(persisted_run.status) != (
                AgentRunStatus.RUNNING.value
            ):
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_RUN_INVALID)
            if (
                persisted_run.user_id != run.user_id
                or persisted_run.agent_id != InterviewPlanningAgent.agent_id
                or persisted_run.prompt_id != InterviewPlanningAgent.agent_id
                or persisted_run.prompt_version != InterviewPlanningAgent.agent_version
                or persisted_run.output_schema_id
                != InterviewPlanningAgent.output_schema_id
            ):
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_RUN_INVALID)

            interview_session = await self.session.scalar(
                select(InterviewSession)
                .where(
                    InterviewSession.id == payload.session_id,
                    InterviewSession.user_id == run.user_id,
                )
                .with_for_update()
            )
            if interview_session is None:
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_SESSION_NOT_FOUND)
            if (
                interview_session.planning_run_id != run.id
                or interview_session.status != "generatingQuestion"
                or interview_session.version != payload.session_version + 1
                or interview_session.target_role_id != payload.target_role_id
                or interview_session.language != payload.interaction_language
                or _session_configuration(interview_session)
                != payload.interview_planning_input.configuration
            ):
                raise InterviewPlanningStateError(INTERVIEW_PLANNING_RUN_INVALID)

            validate_interview_plan_for_duration(
                output,
                interview_session.duration_minutes,
            )

            existing_plan = await self.session.scalar(
                select(InterviewPlan)
                .where(
                    InterviewPlan.session_id == interview_session.id,
                    InterviewPlan.revision == 1,
                )
                .with_for_update()
            )
            if existing_plan is not None:
                if existing_plan.source_agent_run_id != run.id:
                    raise InterviewPlanningStateError(INTERVIEW_PLANNING_RUN_INVALID)
                existing_question = await self.session.scalar(
                    select(InterviewQuestion).where(
                        InterviewQuestion.session_id == interview_session.id,
                        InterviewQuestion.order == 1,
                    )
                )
                if existing_question is None:
                    raise InterviewPlanningStateError(INTERVIEW_PLANNING_STATE_INVALID)
                await self.session.commit()
                return existing_plan

            now = self.clock()
            _require_aware_datetime(now)
            plan = InterviewPlan(
                id=uuid4(),
                session_id=interview_session.id,
                revision=1,
                source_agent_run_id=run.id,
                total_main_questions=output.total_main_questions,
                questions=cast(
                    list[dict[str, object]],
                    [
                        question.model_dump(mode="json", by_alias=True)
                        for question in output.questions
                    ],
                ),
                created_at=now,
            )
            self.session.add(plan)
            await self.session.flush()

            first_question = output.questions[0]
            self.session.add(
                InterviewQuestion(
                    id=uuid4(),
                    session_id=interview_session.id,
                    source_plan_id=plan.id,
                    plan_revision=1,
                    order=first_question.order,
                    prompt=first_question.prompt,
                    question_type=first_question.question_type.value,
                    assessed_capabilities=list(first_question.assessed_capabilities),
                    created_at=now,
                )
            )
            interview_session.plan_revision = 1
            interview_session.total_main_questions = output.total_main_questions
            interview_session.status = "question"
            interview_session.version += 1
            await self.session.commit()
            return plan
        except InterviewPlanningStateError:
            await self.session.rollback()
            raise
        except TypeError, ValueError, ValidationError:
            await self.session.rollback()
            raise InterviewPlanningStateError(
                INTERVIEW_PLANNING_SNAPSHOT_INVALID
            ) from None
        except Exception:
            await self.session.rollback()
            raise

    async def _build_planning_input(
        self,
        interview_session: InterviewSession,
        *,
        user_id: UUID,
        training_memory: TrainingMemoryContext | None = None,
    ) -> InterviewPlanningInput:
        profile = await self.session.scalar(
            select(CareerProfile)
            .options(*_career_profile_loader_options())
            .where(
                CareerProfile.user_id == user_id,
            )
        )
        if profile is None:
            raise InterviewPlanningStateError(INTERVIEW_PLANNING_PROFILE_NOT_FOUND)
        if not career_profile_completed(profile):
            raise InterviewPlanningStateError(INTERVIEW_PLANNING_PROFILE_INCOMPLETE)

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
            raise InterviewPlanningStateError(INTERVIEW_PLANNING_TARGET_ROLE_NOT_FOUND)
        analysis = role.job_description_analysis
        if not (
            role.job_description_status == "saved"
            and role.raw_job_description is not None
            and role.raw_job_description.strip()
            and role.job_description_version is not None
            and analysis is not None
            and analysis.job_description_version == role.job_description_version
        ):
            raise InterviewPlanningStateError(
                INTERVIEW_PLANNING_JOB_DESCRIPTION_NOT_READY
            )

        try:
            career_profile = build_matching_career_profile(profile)
            job_context = build_matching_job_context(role, analysis)
            configuration = _session_configuration(interview_session)
            matching_snapshot = _matching_snapshot(role, profile)
            if training_memory is None:
                training_memory = await self.training_memory_service_factory(
                    self.session
                ).get_context(user_id)
            planning_input = InterviewPlanningInput(
                session=InterviewPlanningSessionSnapshot(
                    id=interview_session.id,
                    version=interview_session.version,
                    status=interview_session.status,
                    language=cast(
                        str,
                        interview_session.language,
                    ),
                    configuration=configuration,
                ),
                configuration=configuration,
                interaction_language=cast(
                    str,
                    interview_session.language,
                ),
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
                job_description_analysis=(
                    InterviewJobDescriptionAnalysisSnapshot(
                        job_description_version=analysis.job_description_version,
                        analysis_version=analysis.analysis_version,
                        **job_context.job_description_analysis.model_dump(
                            mode="python"
                        ),
                    )
                ),
                matching_analysis=matching_snapshot,
                training_memory=training_memory,
            )
            return planning_input
        except AttributeError, TypeError, ValueError, ValidationError:
            raise InterviewPlanningStateError(
                INTERVIEW_PLANNING_SNAPSHOT_INVALID
            ) from None

    @staticmethod
    def _build_run_payload(
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
            raise InterviewPlanningStateError(
                INTERVIEW_PLANNING_SNAPSHOT_INVALID
            ) from None

    @staticmethod
    def _validate_run_payload(run: AgentRun) -> InterviewPlanningRunPayload:
        InterviewPlanningService._validate_run_metadata(run)
        try:
            return InterviewPlanningRunPayload.model_validate(run.payload)
        except TypeError, ValueError, ValidationError:
            raise InterviewPlanningStateError(
                INTERVIEW_PLANNING_SNAPSHOT_INVALID
            ) from None

    @staticmethod
    def _validate_run_metadata(run: AgentRun) -> None:
        if (
            run.agent_id != InterviewPlanningAgent.agent_id
            or run.prompt_id != InterviewPlanningAgent.agent_id
            or run.prompt_version != InterviewPlanningAgent.agent_version
            or run.output_schema_id != InterviewPlanningAgent.output_schema_id
        ):
            raise InterviewPlanningStateError(INTERVIEW_PLANNING_RUN_INVALID)

    async def _lock_user(self, user_id: UUID) -> None:
        exists = await self.session.scalar(
            select(User.id).where(User.id == user_id).with_for_update()
        )
        if exists is None:
            raise InterviewPlanningStateError(INTERVIEW_PLANNING_SESSION_NOT_FOUND)


def _session_configuration(session: InterviewSession) -> InterviewConfiguration:
    try:
        return InterviewConfiguration(
            target_role_id=session.target_role_id,
            round=InterviewRound(session.round),
            difficulty=InterviewDifficulty(session.difficulty),
            duration_minutes=InterviewDurationMinutes(session.duration_minutes),
        )
    except TypeError, ValueError:
        raise InterviewPlanningStateError(INTERVIEW_PLANNING_STATE_INVALID) from None


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


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")


__all__ = [
    "INTERVIEW_PLANNER_MODEL_NOT_CONFIGURED",
    "INTERVIEW_PLANNING_JOB_DESCRIPTION_NOT_READY",
    "INTERVIEW_PLANNING_PROFILE_INCOMPLETE",
    "INTERVIEW_PLANNING_PROFILE_NOT_FOUND",
    "INTERVIEW_PLANNING_RUN_INVALID",
    "INTERVIEW_PLANNING_SESSION_NOT_FOUND",
    "INTERVIEW_PLANNING_SNAPSHOT_INVALID",
    "INTERVIEW_PLANNING_STATE_INVALID",
    "INTERVIEW_PLANNING_TARGET_ROLE_NOT_FOUND",
    "INTERVIEW_PLANNING_VERSION_CONFLICT",
    "InterviewPlanningService",
    "InterviewPlanningStateError",
]
