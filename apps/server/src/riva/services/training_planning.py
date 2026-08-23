from collections.abc import Callable
from typing import Literal
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.agents.training_planning import TrainingPlanningAgent
from riva.core.language import InteractionLanguage
from riva.core.training_planning import (
    TrainingPlanningOutputContractError,
    validate_training_planning_output_contract,
)
from riva.integrations import LLMProvider
from riva.models import CareerProfile, TargetRole, User
from riva.schemas.interview import (
    InterviewDifficulty,
    InterviewDurationMinutes,
    InterviewRound,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.schemas.training_planning import (
    EnsureCurrentTrainingPlanningRequest,
    StartTrainingPlanningRequest,
    TrainingPlanningConstraints,
    TrainingPlanningInput,
    TrainingPlanningMatchingAnalysis,
    TrainingPlanningMockInterviewConstraints,
    TrainingPlanningMockInterviewRecord,
    TrainingPlanningResponse,
    TrainingPlanningTargetedPracticeConstraints,
    TrainingPlanningTargetedPracticeRecord,
    TrainingPlanningTargetRole,
)
from riva.schemas.training_records import (
    MockInterviewTrainingRecordSummaryResponse,
    TargetedPracticeTrainingRecordSummaryResponse,
    TrainingRecordSummaryResponse,
)
from riva.services.interview_sessions import InterviewSessionService
from riva.services.matching_analyses import _career_profile_loader_options
from riva.services.practice_sessions import PracticeSessionService
from riva.services.profile_completion import career_profile_completed
from riva.services.training_memory import TrainingMemoryService
from riva.services.training_records import TrainingRecordService

TrainingPlanningStateErrorCode = Literal[
    "training_planning_target_not_found",
    "training_planning_target_unavailable",
    "training_planning_snapshot_invalid",
    "training_planning_unavailable",
    "training_planning_state_conflict",
]

TRAINING_PLANNING_TARGET_NOT_FOUND: TrainingPlanningStateErrorCode = (
    "training_planning_target_not_found"
)
TRAINING_PLANNING_TARGET_UNAVAILABLE: TrainingPlanningStateErrorCode = (
    "training_planning_target_unavailable"
)
TRAINING_PLANNING_SNAPSHOT_INVALID: TrainingPlanningStateErrorCode = (
    "training_planning_snapshot_invalid"
)
TRAINING_PLANNING_STATE_CONFLICT: TrainingPlanningStateErrorCode = (
    "training_planning_state_conflict"
)
TRAINING_PLANNING_UNAVAILABLE: TrainingPlanningStateErrorCode = (
    "training_planning_unavailable"
)

TRAINING_PLANNING_FAILURE_REASON = (
    "The training plan could not be generated right now. Please try again."
)
TrainingRecordServiceFactory = Callable[[AsyncSession], TrainingRecordService]


class TrainingPlanningStateError(RuntimeError):
    safe_message = "The training planning state is invalid."

    def __init__(self, code: TrainingPlanningStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


class TrainingPlanningService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: LLMProvider | None = None,
        llm_model: str | None = None,
        training_record_service_factory: TrainingRecordServiceFactory = (
            TrainingRecordService
        ),
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()
        self.training_record_service_factory = training_record_service_factory

    async def start_planning(
        self,
        user: User,
        payload: StartTrainingPlanningRequest,
        *,
        interaction_language: InteractionLanguage,
    ) -> TrainingPlanningResponse:
        return await self._generate(
            user_id=user.id,
            target_role_id=payload.target_role_id,
            interaction_language=interaction_language,
        )

    async def ensure_current_planning(
        self,
        user: User,
        payload: EnsureCurrentTrainingPlanningRequest,
        *,
        interaction_language: InteractionLanguage,
    ) -> TrainingPlanningResponse:
        return await self._generate(
            user_id=user.id,
            target_role_id=payload.target_role_id,
            interaction_language=interaction_language,
        )

    async def _generate(
        self,
        *,
        user_id: UUID,
        target_role_id: UUID,
        interaction_language: InteractionLanguage,
    ) -> TrainingPlanningResponse:
        try:
            planning_input = await self._build_authoritative_input(
                user_id=user_id,
                target_role_id=target_role_id,
                interaction_language=interaction_language,
            )
            if self.llm_provider is None or not self.llm_model:
                raise TrainingPlanningStateError(TRAINING_PLANNING_UNAVAILABLE)
            result = await TrainingPlanningAgent(
                self.llm_provider,
                self.llm_model,
            ).run(planning_input)
            plan = validate_training_planning_output_contract(
                planning_input,
                result.output,
            )
            await self.session.commit()
            return TrainingPlanningResponse(
                target_role_id=target_role_id,
                interaction_language=interaction_language,
                plan=plan,
            )
        except TrainingPlanningStateError:
            await self.session.rollback()
            raise
        except (
            TrainingPlanningOutputContractError,
            ValidationError,
            TypeError,
            ValueError,
        ):
            await self.session.rollback()
            raise TrainingPlanningStateError(TRAINING_PLANNING_STATE_CONFLICT) from None
        except Exception:
            await self.session.rollback()
            raise

    async def _build_authoritative_input(
        self,
        *,
        user_id: UUID,
        target_role_id: UUID,
        interaction_language: InteractionLanguage,
    ) -> TrainingPlanningInput:
        role = await self.session.scalar(
            select(TargetRole)
            .options(
                selectinload(TargetRole.job_description_analysis),
                selectinload(TargetRole.matching_analysis),
            )
            .where(TargetRole.id == target_role_id, TargetRole.user_id == user_id)
        )
        if role is None:
            raise TrainingPlanningStateError(TRAINING_PLANNING_TARGET_NOT_FOUND)
        if role.preparation_status == "archived":
            raise TrainingPlanningStateError(TRAINING_PLANNING_TARGET_UNAVAILABLE)

        setup = await InterviewSessionService(self.session).get_setup(user_id=user_id)
        if not setup.profile_complete or not any(
            candidate.id == target_role_id for candidate in setup.target_roles
        ):
            raise TrainingPlanningStateError(TRAINING_PLANNING_TARGET_UNAVAILABLE)

        profile = await self.session.scalar(
            select(CareerProfile)
            .options(*_career_profile_loader_options())
            .where(CareerProfile.user_id == user_id)
        )
        if profile is None or not career_profile_completed(profile):
            raise TrainingPlanningStateError(TRAINING_PLANNING_TARGET_UNAVAILABLE)

        matching_analysis = _current_matching_analysis(role, profile)
        training_memory = await TrainingMemoryService(self.session).get_context(user_id)
        recent_training = await self._recent_training(
            user_id=user_id,
            target_role_id=target_role_id,
        )
        targeted_practice = None
        if matching_analysis is not None:
            capabilities = await PracticeSessionService(
                self.session,
                llm_provider=self.llm_provider,
                llm_model=self.llm_model,
            ).get_setup_capabilities(
                user_id=user_id,
                interaction_language=interaction_language,
            )
            targeted_practice = TrainingPlanningTargetedPracticeConstraints(
                question_types=list(QuestionCardQuestionType),
                difficulties=list(QuestionCardDifficulty),
                can_prioritize_weaknesses=capabilities.can_prioritize_weaknesses,
            )

        mock_interview = TrainingPlanningMockInterviewConstraints(
            rounds=list(InterviewRound),
            difficulties=list(InterviewDifficulty),
            duration_minutes=list(InterviewDurationMinutes),
        )
        try:
            return TrainingPlanningInput(
                interaction_language=interaction_language,
                target_role=TrainingPlanningTargetRole(
                    id=role.id,
                    title=role.title,
                    company=role.company,
                    recruitment_type=role.recruitment_type,
                    location=role.location,
                ),
                matching_analysis=matching_analysis,
                training_memory=training_memory,
                recent_training=recent_training,
                constraints=TrainingPlanningConstraints(
                    targeted_practice=targeted_practice,
                    mock_interview=mock_interview,
                ),
            )
        except ValidationError, TypeError, ValueError:
            raise TrainingPlanningStateError(
                TRAINING_PLANNING_SNAPSHOT_INVALID
            ) from None

    async def _recent_training(
        self,
        *,
        user_id: UUID,
        target_role_id: UUID,
    ) -> list[
        TrainingPlanningTargetedPracticeRecord | TrainingPlanningMockInterviewRecord
    ]:
        records = await self.training_record_service_factory(
            self.session
        ).list_all_summaries(user_id)
        role_records = [
            record for record in records if record.target_role.id == target_role_id
        ]
        role_records.sort(
            key=lambda record: (record.ended_at, str(record.record_id)),
            reverse=True,
        )
        return [_training_planning_record(record) for record in role_records[:5]]


def _current_matching_analysis(
    role: TargetRole,
    profile: CareerProfile,
) -> TrainingPlanningMatchingAnalysis | None:
    matching = role.matching_analysis
    analysis = role.job_description_analysis
    if matching is None or analysis is None:
        return None
    if (
        role.job_description_status != "saved"
        or not role.raw_job_description
        or role.job_description_version is None
        or matching.role_id != role.id
        or matching.user_id != role.user_id
        or matching.profile_id != profile.profile_id
        or matching.profile_version != profile.version
        or matching.job_description_version != role.job_description_version
        or matching.job_description_analysis_version != analysis.analysis_version
    ):
        return None
    try:
        return TrainingPlanningMatchingAnalysis(
            overall_match_score=matching.overall_match_score,
            matched_capabilities=matching.matched_capabilities,
            missing_capabilities=matching.missing_capabilities,
            underrepresented_capabilities=matching.underrepresented_capabilities,
            resume_gaps=matching.resume_gaps,
            high_risk_questions=matching.high_risk_questions,
            preparation_recommendations=matching.preparation_recommendations,
        )
    except ValidationError, TypeError, ValueError:
        return None


def _training_planning_record(
    record: TrainingRecordSummaryResponse,
) -> TrainingPlanningTargetedPracticeRecord | TrainingPlanningMockInterviewRecord:
    try:
        if isinstance(record, TargetedPracticeTrainingRecordSummaryResponse):
            return TrainingPlanningTargetedPracticeRecord(
                record_id=record.record_id,
                kind=record.kind,
                status=record.status,
                overall_score=record.overall_score,
                ended_at=record.ended_at,
                question_type=record.question_type,
                difficulty=record.difficulty,
            )
        if isinstance(record, MockInterviewTrainingRecordSummaryResponse):
            return TrainingPlanningMockInterviewRecord(
                record_id=record.record_id,
                kind=record.kind,
                status=record.status,
                overall_score=record.overall_score,
                ended_at=record.ended_at,
                round=record.round,
                difficulty=record.difficulty,
            )
    except ValidationError, TypeError, ValueError:
        raise TrainingPlanningStateError(TRAINING_PLANNING_SNAPSHOT_INVALID) from None
    raise TrainingPlanningStateError(TRAINING_PLANNING_SNAPSHOT_INVALID)


__all__ = [
    "TRAINING_PLANNING_FAILURE_REASON",
    "TRAINING_PLANNING_SNAPSHOT_INVALID",
    "TRAINING_PLANNING_STATE_CONFLICT",
    "TRAINING_PLANNING_TARGET_NOT_FOUND",
    "TRAINING_PLANNING_TARGET_UNAVAILABLE",
    "TRAINING_PLANNING_UNAVAILABLE",
    "TrainingPlanningService",
    "TrainingPlanningStateError",
    "TrainingPlanningStateErrorCode",
]
