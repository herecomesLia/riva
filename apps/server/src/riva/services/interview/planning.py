from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.agents.interview.planning import InterviewPlanningAgent
from riva.agents.interview.planning_types import (
    InterviewCareerProfileSnapshot,
    InterviewJobDescriptionAnalysisSnapshot,
    InterviewMatchingAnalysisSnapshot,
    InterviewPlanningInput,
    InterviewPlanningSessionSnapshot,
    InterviewTargetRoleSnapshot,
    validate_interview_plan_for_duration,
)
from riva.agents.jobs.matcher_types import MatchingAnalysisOutput
from riva.agents.training.memory_types import TrainingMemoryContext
from riva.integrations.llm import LLMProvider
from riva.models import (
    CareerProfile,
    InterviewPlan,
    InterviewQuestion,
    InterviewSession,
    TargetRole,
)
from riva.services.errors import ServiceError, service_error_for_code
from riva.services.interview.types import (
    InterviewConfiguration,
    InterviewDifficulty,
    InterviewDurationMinutes,
    InterviewRound,
)
from riva.services.jobs.matching import (
    _career_profile_loader_options,
    build_matching_career_profile,
    build_matching_job_context,
)
from riva.services.profile.completion import career_profile_completed
from riva.services.training.memory import TrainingMemoryService
from riva.utils import utc_now

INTERVIEW_PLANNING_SESSION_NOT_FOUND: str = "interview_session_not_found"
INTERVIEW_PLANNING_VERSION_CONFLICT: str = "interview_session_version_conflict"
INTERVIEW_PLANNING_STATE_INVALID: str = "interview_planning_state_invalid"
INTERVIEW_PLANNING_SNAPSHOT_INVALID: str = "interview_planning_snapshot_invalid"
INTERVIEW_PLANNING_PROFILE_INCOMPLETE: str = "interview_planning_profile_incomplete"
INTERVIEW_PLANNING_PROFILE_NOT_FOUND: str = "interview_planning_profile_not_found"
INTERVIEW_PLANNING_TARGET_ROLE_NOT_FOUND: str = (
    "interview_planning_target_role_not_found"
)
INTERVIEW_PLANNING_JOB_DESCRIPTION_NOT_READY: str = (
    "interview_planning_job_description_not_ready"
)
INTERVIEW_PLANNER_MODEL_NOT_CONFIGURED: str = "interview_planner_model_not_configured"


class InterviewPlanningService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: LLMProvider | None = None,
        llm_model: str | None = None,
        training_memory_service_factory: Callable[
            [AsyncSession], TrainingMemoryService
        ] = TrainingMemoryService,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()
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
            interview_session = await self.session.scalar(
                select(InterviewSession)
                .where(
                    InterviewSession.id == session_id,
                    InterviewSession.user_id == user_id,
                )
                .with_for_update()
            )
            if interview_session is None:
                raise service_error_for_code(INTERVIEW_PLANNING_SESSION_NOT_FOUND)
            if interview_session.version != version:
                raise service_error_for_code(INTERVIEW_PLANNING_VERSION_CONFLICT)
            if interview_session.status == "question":
                await self.session.commit()
                return interview_session
            if interview_session.status != "opening":
                raise service_error_for_code(INTERVIEW_PLANNING_STATE_INVALID)
            if self.llm_provider is None or not self.llm_model:
                raise service_error_for_code(INTERVIEW_PLANNER_MODEL_NOT_CONFIGURED)
            planning_input = await self._build_planning_input(
                interview_session, user_id=user_id
            )
            output = (
                await InterviewPlanningAgent(self.llm_provider, self.llm_model).run(
                    planning_input
                )
            ).output
            validate_interview_plan_for_duration(
                output, interview_session.duration_minutes
            )
            now = self._now()
            plan = InterviewPlan(
                id=uuid4(),
                session_id=interview_session.id,
                revision=1,
                total_main_questions=output.total_main_questions,
                questions=[
                    question.model_dump(mode="json", by_alias=True)
                    for question in output.questions
                ],
                created_at=now,
            )
            self.session.add(plan)
            await self.session.flush()
            self.session.add_all(
                [
                    InterviewQuestion(
                        id=uuid4(),
                        session_id=interview_session.id,
                        source_plan_id=plan.id,
                        plan_revision=1,
                        order=question.order,
                        prompt=question.prompt,
                        question_type=question.question_type.value,
                        assessed_capabilities=list(question.assessed_capabilities),
                        created_at=now,
                    )
                    for question in output.questions
                ]
            )
            interview_session.plan_revision = 1
            interview_session.total_main_questions = output.total_main_questions
            interview_session.status = "question"
            interview_session.version += 1
            interview_session.updated_at = now
            await self.session.commit()
            return interview_session
        except ServiceError:
            await self.session.rollback()
            raise
        except ValidationError, TypeError, ValueError:
            await self.session.rollback()
            raise service_error_for_code(INTERVIEW_PLANNING_SNAPSHOT_INVALID) from None
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
            .where(CareerProfile.user_id == user_id)
        )
        if profile is None:
            raise service_error_for_code(INTERVIEW_PLANNING_PROFILE_NOT_FOUND)
        if not career_profile_completed(profile):
            raise service_error_for_code(INTERVIEW_PLANNING_PROFILE_INCOMPLETE)
        role = await self.session.scalar(
            select(TargetRole)
            .options(
                selectinload(TargetRole.job_description_analysis),
                selectinload(TargetRole.matching_analysis),
            )
            .where(
                TargetRole.id == interview_session.target_role_id,
                TargetRole.user_id == user_id,
            )
        )
        if role is None or role.preparation_status == "archived":
            raise service_error_for_code(INTERVIEW_PLANNING_TARGET_ROLE_NOT_FOUND)
        analysis = role.job_description_analysis
        if (
            role.job_description_status != "saved"
            or not role.raw_job_description
            or role.job_description_version is None
            or analysis is None
            or analysis.job_description_version != role.job_description_version
        ):
            raise service_error_for_code(INTERVIEW_PLANNING_JOB_DESCRIPTION_NOT_READY)
        try:
            career_profile = build_matching_career_profile(profile)
            job_context = build_matching_job_context(role, analysis)
            configuration = _session_configuration(interview_session)
            return InterviewPlanningInput(
                session=InterviewPlanningSessionSnapshot(
                    id=interview_session.id,
                    version=interview_session.version,
                    status=interview_session.status,
                    language=interview_session.language,
                    configuration=configuration,
                ),
                configuration=configuration,
                interaction_language=interview_session.language,
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
                matching_analysis=_matching_snapshot(role, profile),
                training_memory=(
                    training_memory
                    or await self.training_memory_service_factory(
                        self.session
                    ).get_context(user_id)
                ),
            )
        except ServiceError:
            raise
        except ValidationError, TypeError, ValueError, AttributeError:
            raise service_error_for_code(INTERVIEW_PLANNING_SNAPSHOT_INVALID) from None

    def _now(self) -> datetime:
        value = self.clock()
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("clock must return a timezone-aware datetime")
        return value


def _session_configuration(session: InterviewSession) -> InterviewConfiguration:
    try:
        return InterviewConfiguration(
            target_role_id=session.target_role_id,
            round=InterviewRound(session.round),
            difficulty=InterviewDifficulty(session.difficulty),
            duration_minutes=InterviewDurationMinutes(session.duration_minutes),
        )
    except TypeError, ValueError:
        raise service_error_for_code(INTERVIEW_PLANNING_STATE_INVALID) from None


def _matching_snapshot(
    role: TargetRole,
    profile: CareerProfile,
) -> InterviewMatchingAnalysisSnapshot | None:
    matching = role.matching_analysis
    analysis = role.job_description_analysis
    if matching is None or analysis is None:
        return None
    if (
        matching.role_id != role.id
        or matching.user_id != role.user_id
        or matching.profile_id != profile.profile_id
        or matching.profile_version != profile.version
        or matching.job_description_version != role.job_description_version
        or matching.job_description_analysis_version != analysis.analysis_version
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
            role_id=matching.role_id,
            profile_id=matching.profile_id,
            profile_version=matching.profile_version,
            job_description_version=matching.job_description_version,
            job_description_analysis_version=matching.job_description_analysis_version,
            **result.model_dump(mode="python"),
        )
    except TypeError, ValueError, ValidationError:
        return None
