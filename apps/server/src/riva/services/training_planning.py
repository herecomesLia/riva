from collections.abc import Callable
import re
from typing import Literal, cast
from uuid import UUID

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from riva.core.language import InteractionLanguage
from riva.core.training_planning import (
    TrainingPlanningOutputContractError,
    training_planning_context_fingerprint,
    validate_training_planning_output_contract,
)
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    TargetRole,
    User,
)
from riva.prompts import TRAINING_PLANNING_PROMPT
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
    StartTrainingPlanningRequest,
    TrainingPlanningConstraints,
    TrainingPlanningInput,
    TrainingPlanningMatchingAnalysis,
    TrainingPlanningMockInterviewConstraints,
    TrainingPlanningMockInterviewRecord,
    TrainingPlanningOutput,
    TrainingPlanningRunPayload,
    TrainingPlanningStatusResponse,
    TrainingPlanningTargetRole,
    TrainingPlanningTargetedPracticeConstraints,
    TrainingPlanningTargetedPracticeRecord,
)
from riva.schemas.training_records import (
    MockInterviewTrainingRecordSummaryResponse,
    TargetedPracticeTrainingRecordSummaryResponse,
    TrainingRecordSummaryResponse,
)
from riva.services.agent_runs import AgentRunService
from riva.services.interview_sessions import InterviewSessionService
from riva.services.matching_analyses import _career_profile_loader_options
from riva.services.practice_weaknesses import PracticeWeaknessService
from riva.services.profile_completion import career_profile_fully_complete
from riva.services.training_memory import TrainingMemoryService
from riva.services.training_records import TrainingRecordService


TrainingPlanningStateErrorCode = Literal[
    "training_planning_target_not_found",
    "training_planning_not_found",
    "training_planning_target_unavailable",
    "training_planning_snapshot_invalid",
    "training_planning_run_invalid",
    "training_planning_state_conflict",
    "training_planning_unavailable",
    "training_planning_request_conflict",
]

TRAINING_PLANNING_TARGET_NOT_FOUND: TrainingPlanningStateErrorCode = (
    "training_planning_target_not_found"
)
TRAINING_PLANNING_NOT_FOUND: TrainingPlanningStateErrorCode = (
    "training_planning_not_found"
)
TRAINING_PLANNING_TARGET_UNAVAILABLE: TrainingPlanningStateErrorCode = (
    "training_planning_target_unavailable"
)
TRAINING_PLANNING_SNAPSHOT_INVALID: TrainingPlanningStateErrorCode = (
    "training_planning_snapshot_invalid"
)
TRAINING_PLANNING_RUN_INVALID: TrainingPlanningStateErrorCode = (
    "training_planning_run_invalid"
)
TRAINING_PLANNING_STATE_CONFLICT: TrainingPlanningStateErrorCode = (
    "training_planning_state_conflict"
)
TRAINING_PLANNING_UNAVAILABLE: TrainingPlanningStateErrorCode = (
    "training_planning_unavailable"
)
TRAINING_PLANNING_REQUEST_CONFLICT: TrainingPlanningStateErrorCode = (
    "training_planning_request_conflict"
)

TRAINING_PLANNING_FAILURE_REASON = (
    "The training plan could not be generated right now. Please try again."
)

_SAFE_ERROR_CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
TrainingRecordServiceFactory = Callable[[AsyncSession], TrainingRecordService]
AgentRunServiceFactory = Callable[[AsyncSession], AgentRunService]


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
        llm_provider: str | None = None,
        llm_model: str | None = None,
        training_record_service_factory: TrainingRecordServiceFactory = (
            TrainingRecordService
        ),
        agent_run_service_factory: AgentRunServiceFactory = AgentRunService,
    ) -> None:
        self.session = session
        self.llm_provider = (llm_provider or "").strip().lower()
        self.llm_model = (llm_model or "").strip()
        self.training_record_service_factory = training_record_service_factory
        self.agent_run_service_factory = agent_run_service_factory

    async def start_planning(
        self,
        user: User,
        payload: StartTrainingPlanningRequest,
        *,
        interaction_language: InteractionLanguage,
    ) -> TrainingPlanningStatusResponse:
        try:
            idempotency_key = f"training-planning:{payload.request_id}"
            existing = await self._existing_run(
                user_id=user.id,
                idempotency_key=idempotency_key,
            )
            if existing is not None:
                existing_payload = self._validate_replay_payload(existing)
                self._require_replay_intent(
                    existing_payload,
                    payload,
                    interaction_language,
                )
                return await self._status_response(existing)

            self._configured_model()
            planning_input = await self._build_authoritative_input(
                user_id=user.id,
                target_role_id=payload.target_role_id,
                interaction_language=interaction_language,
            )
            run_payload = self._build_run_payload(
                request_id=payload.request_id,
                planning_input=planning_input,
            )
            run = await self.agent_run_service_factory(self.session).enqueue(
                user_id=user.id,
                agent_id=TRAINING_PLANNING_PROMPT.prompt_id,
                prompt_id=TRAINING_PLANNING_PROMPT.prompt_id,
                prompt_version=TRAINING_PLANNING_PROMPT.version,
                output_schema_id=TRAINING_PLANNING_PROMPT.output_schema_id,
                model=self._configured_model(),
                payload=cast(
                    dict[str, object],
                    run_payload.model_dump(mode="json", by_alias=True),
                ),
                idempotency_key=idempotency_key,
                max_attempts=3,
            )
            replay_payload = self._validate_replay_payload(run)
            self._require_replay_intent(
                replay_payload,
                payload,
                interaction_language,
            )
            return await self._status_response(run)
        except TrainingPlanningStateError:
            await self.session.rollback()
            raise
        except Exception:
            await self.session.rollback()
            raise

    async def get_planning_status(
        self,
        *,
        user_id: UUID,
        run_id: UUID,
    ) -> TrainingPlanningStatusResponse:
        run = await self._load_run(user_id=user_id, run_id=run_id)
        return await self._status_response(run)

    async def load_generation_input(
        self,
        run: AgentRun,
    ) -> TrainingPlanningInput:
        try:
            return validate_training_planning_run(run).training_planning_input
        except TrainingPlanningStateError:
            raise
        except Exception:
            raise TrainingPlanningStateError(
                TRAINING_PLANNING_SNAPSHOT_INVALID
            ) from None

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
                selectinload(TargetRole.matching_analysis_run),
            )
            .where(
                TargetRole.id == target_role_id,
                TargetRole.user_id == user_id,
            )
        )
        if role is None:
            raise TrainingPlanningStateError(
                TRAINING_PLANNING_TARGET_NOT_FOUND
            )
        if role.preparation_status == "archived":
            raise TrainingPlanningStateError(
                TRAINING_PLANNING_TARGET_UNAVAILABLE
            )

        setup = await InterviewSessionService(self.session).get_setup(
            user_id=user_id,
        )
        if not setup.profile_complete or not any(
            candidate.id == target_role_id for candidate in setup.target_roles
        ):
            raise TrainingPlanningStateError(
                TRAINING_PLANNING_TARGET_UNAVAILABLE
            )

        profile = await self.session.scalar(
            select(CareerProfile)
            .options(*_career_profile_loader_options())
            .where(CareerProfile.user_id == user_id)
        )
        if profile is None or not career_profile_fully_complete(profile):
            raise TrainingPlanningStateError(
                TRAINING_PLANNING_TARGET_UNAVAILABLE
            )

        try:
            matching_analysis = _current_matching_analysis(role, profile)
            training_memory = await TrainingMemoryService(
                self.session
            ).get_context(user_id)
            recent_training = await self._recent_training(
                user_id=user_id,
                target_role_id=target_role_id,
            )
            can_prioritize_weaknesses = await PracticeWeaknessService(
                self.session
            ).has_eligible_weakness(
                user_id=user_id,
                interaction_language=interaction_language,
            )
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
                    targeted_practice=TrainingPlanningTargetedPracticeConstraints(
                        question_types=list(QuestionCardQuestionType),
                        difficulties=list(QuestionCardDifficulty),
                        can_prioritize_weaknesses=can_prioritize_weaknesses,
                    ),
                    mock_interview=TrainingPlanningMockInterviewConstraints(
                        rounds=list(InterviewRound),
                        difficulties=list(InterviewDifficulty),
                        duration_minutes=list(InterviewDurationMinutes),
                    ),
                ),
            )
        except TrainingPlanningStateError:
            raise
        except Exception:
            raise TrainingPlanningStateError(
                TRAINING_PLANNING_SNAPSHOT_INVALID
            ) from None

    async def _recent_training(
        self,
        *,
        user_id: UUID,
        target_role_id: UUID,
    ) -> list[
        TrainingPlanningTargetedPracticeRecord
        | TrainingPlanningMockInterviewRecord
    ]:
        records = await self.training_record_service_factory(
            self.session
        ).list_all_summaries(user_id)
        role_records = [
            record
            for record in records
            if record.target_role.id == target_role_id
        ]
        role_records.sort(
            key=lambda record: (record.ended_at, str(record.record_id)),
            reverse=True,
        )
        return [
            _training_planning_record(record)
            for record in role_records[:5]
        ]

    async def _existing_run(
        self,
        *,
        user_id: UUID,
        idempotency_key: str,
    ) -> AgentRun | None:
        return await self.session.scalar(
            select(AgentRun)
            .where(
                AgentRun.user_id == user_id,
                AgentRun.agent_id == TRAINING_PLANNING_PROMPT.prompt_id,
                AgentRun.idempotency_key == idempotency_key,
            )
            .order_by(AgentRun.created_at.asc(), AgentRun.id.asc())
            .limit(1)
        )

    async def _load_run(self, *, user_id: UUID, run_id: UUID) -> AgentRun:
        run = await self.session.scalar(
            select(AgentRun).where(
                AgentRun.id == run_id,
                AgentRun.user_id == user_id,
            )
        )
        if run is None:
            raise TrainingPlanningStateError(TRAINING_PLANNING_NOT_FOUND)
        return run

    async def _status_response(
        self,
        run: AgentRun,
    ) -> TrainingPlanningStatusResponse:
        payload = validate_training_planning_run(run)
        status_value = _status_value(run.status)
        try:
            _validate_persisted_run_state(run, status_value)
        except TrainingPlanningStateError:
            raise
        except (AttributeError, TypeError, ValueError):
            raise TrainingPlanningStateError(
                TRAINING_PLANNING_STATE_CONFLICT
            ) from None
        plan: TrainingPlanningOutput | None = None
        if status_value == AgentRunStatus.SUCCEEDED.value:
            if run.result is None or run.finished_at is None:
                raise TrainingPlanningStateError(
                    TRAINING_PLANNING_STATE_CONFLICT
                )
            try:
                plan = validate_training_planning_output_contract(
                    payload.training_planning_input,
                    TypeAdapter(TrainingPlanningOutput).validate_python(
                        run.result
                    ),
                )
            except (
                TypeError,
                ValueError,
                ValidationError,
                TrainingPlanningOutputContractError,
            ):
                raise TrainingPlanningStateError(
                    TRAINING_PLANNING_STATE_CONFLICT
                ) from None
        elif status_value == AgentRunStatus.FAILED.value:
            if (
                run.result is not None
                or run.finished_at is None
                or not isinstance(run.error_code, str)
                or _SAFE_ERROR_CODE_PATTERN.fullmatch(run.error_code) is None
            ):
                raise TrainingPlanningStateError(
                    TRAINING_PLANNING_STATE_CONFLICT
                )
        elif status_value not in {
            AgentRunStatus.QUEUED.value,
            AgentRunStatus.RUNNING.value,
        }:
            raise TrainingPlanningStateError(
                TRAINING_PLANNING_STATE_CONFLICT
            )

        try:
            return TrainingPlanningStatusResponse(
                run_id=run.id,
                status=status_value,
                target_role_id=payload.target_role_id,
                interaction_language=payload.interaction_language,
                attempt_count=run.attempt_count,
                max_attempts=run.max_attempts,
                error_code=(
                    run.error_code if status_value == "failed" else None
                ),
                failure_reason=(
                    TRAINING_PLANNING_FAILURE_REASON
                    if status_value == "failed"
                    else None
                ),
                created_at=run.created_at,
                started_at=run.started_at,
                finished_at=run.finished_at,
                plan=plan,
            )
        except (AttributeError, TypeError, ValueError, ValidationError):
            raise TrainingPlanningStateError(
                TRAINING_PLANNING_STATE_CONFLICT
            ) from None

    def _configured_model(self) -> str:
        if self.llm_provider != "qwen" or not self.llm_model:
            raise TrainingPlanningStateError(TRAINING_PLANNING_UNAVAILABLE)
        return self.llm_model

    @staticmethod
    def _build_run_payload(
        *,
        request_id: UUID,
        planning_input: TrainingPlanningInput,
    ) -> TrainingPlanningRunPayload:
        try:
            return TrainingPlanningRunPayload(
                request_id=request_id,
                target_role_id=planning_input.target_role.id,
                interaction_language=planning_input.interaction_language,
                context_fingerprint=training_planning_context_fingerprint(
                    planning_input
                ),
                training_planning_input=planning_input,
            )
        except (TypeError, ValueError, ValidationError):
            raise TrainingPlanningStateError(
                TRAINING_PLANNING_SNAPSHOT_INVALID
            ) from None

    @staticmethod
    def _validate_replay_payload(
        run: AgentRun,
    ) -> TrainingPlanningRunPayload:
        try:
            return validate_training_planning_run(run)
        except TrainingPlanningStateError:
            raise
        except (TypeError, ValueError, ValidationError):
            raise TrainingPlanningStateError(
                TRAINING_PLANNING_STATE_CONFLICT
            ) from None

    @staticmethod
    def _require_replay_intent(
        existing_payload: TrainingPlanningRunPayload,
        request: StartTrainingPlanningRequest,
        interaction_language: InteractionLanguage,
    ) -> None:
        if (
            existing_payload.request_id != request.request_id
            or existing_payload.target_role_id != request.target_role_id
            or existing_payload.interaction_language != interaction_language
        ):
            raise TrainingPlanningStateError(
                TRAINING_PLANNING_REQUEST_CONFLICT
            )


def validate_training_planning_run(
    run: AgentRun,
) -> TrainingPlanningRunPayload:
    if (
        run.agent_id != TRAINING_PLANNING_PROMPT.prompt_id
        or run.prompt_id != TRAINING_PLANNING_PROMPT.prompt_id
        or run.prompt_version != TRAINING_PLANNING_PROMPT.version
        or run.output_schema_id != TRAINING_PLANNING_PROMPT.output_schema_id
    ):
        raise TrainingPlanningStateError(TRAINING_PLANNING_RUN_INVALID)
    try:
        payload = TrainingPlanningRunPayload.model_validate(run.payload)
    except (TypeError, ValueError, ValidationError):
        raise TrainingPlanningStateError(
            TRAINING_PLANNING_SNAPSHOT_INVALID
        ) from None
    if run.idempotency_key != f"training-planning:{payload.request_id}":
        raise TrainingPlanningStateError(TRAINING_PLANNING_RUN_INVALID)
    if (
        payload.context_fingerprint
        != training_planning_context_fingerprint(
            payload.training_planning_input
        )
    ):
        raise TrainingPlanningStateError(TRAINING_PLANNING_SNAPSHOT_INVALID)
    return payload


def _current_matching_analysis(
    role: TargetRole,
    profile: CareerProfile,
) -> TrainingPlanningMatchingAnalysis | None:
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
        return TrainingPlanningMatchingAnalysis(
            overall_match_score=matching.overall_match_score,
            matched_capabilities=matching.matched_capabilities,
            missing_capabilities=matching.missing_capabilities,
            underrepresented_capabilities=matching.underrepresented_capabilities,
            resume_gaps=matching.resume_gaps,
            high_risk_questions=matching.high_risk_questions,
            preparation_recommendations=matching.preparation_recommendations,
        )
    except (AttributeError, TypeError, ValueError, ValidationError):
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
    except (AttributeError, TypeError, ValueError, ValidationError):
        raise TrainingPlanningStateError(
            TRAINING_PLANNING_SNAPSHOT_INVALID
        ) from None
    raise TrainingPlanningStateError(TRAINING_PLANNING_SNAPSHOT_INVALID)


def _status_value(status: object) -> str:
    value = getattr(status, "value", status)
    return str(value)


def _validate_persisted_run_state(run: AgentRun, status: str) -> None:
    common_terminal = (
        run.lease_owner is None
        and run.lease_token is None
        and run.lease_expires_at is None
    )
    if status == AgentRunStatus.QUEUED.value:
        valid = (
            run.attempt_count < run.max_attempts
            and run.result is None
            and run.provider is None
            and run.input_tokens is None
            and run.output_tokens is None
            and run.error_code is None
            and run.finished_at is None
            and common_terminal
            and (
                (run.attempt_count == 0 and run.started_at is None)
                or (run.attempt_count > 0 and run.started_at is not None)
            )
        )
    elif status == AgentRunStatus.RUNNING.value:
        valid = (
            run.attempt_count >= 1
            and run.attempt_count <= run.max_attempts
            and run.result is None
            and run.provider is None
            and run.input_tokens is None
            and run.output_tokens is None
            and run.error_code is None
            and run.started_at is not None
            and run.finished_at is None
            and run.lease_owner is not None
            and run.lease_token is not None
            and run.lease_expires_at is not None
        )
    elif status == AgentRunStatus.SUCCEEDED.value:
        valid = (
            run.attempt_count >= 1
            and run.attempt_count <= run.max_attempts
            and run.result is not None
            and run.provider is not None
            and run.input_tokens is not None
            and run.output_tokens is not None
            and run.error_code is None
            and run.started_at is not None
            and run.finished_at is not None
            and common_terminal
        )
    elif status == AgentRunStatus.FAILED.value:
        valid = (
            run.attempt_count >= 1
            and run.attempt_count <= run.max_attempts
            and run.result is None
            and run.provider is None
            and run.input_tokens is None
            and run.output_tokens is None
            and run.error_code is not None
            and run.started_at is not None
            and run.finished_at is not None
            and common_terminal
        )
    else:
        valid = False
    if not valid:
        raise TrainingPlanningStateError(TRAINING_PLANNING_STATE_CONFLICT)


__all__ = [
    "TRAINING_PLANNING_FAILURE_REASON",
    "TRAINING_PLANNING_NOT_FOUND",
    "TRAINING_PLANNING_REQUEST_CONFLICT",
    "TRAINING_PLANNING_RUN_INVALID",
    "TRAINING_PLANNING_SNAPSHOT_INVALID",
    "TRAINING_PLANNING_STATE_CONFLICT",
    "TRAINING_PLANNING_TARGET_NOT_FOUND",
    "TRAINING_PLANNING_TARGET_UNAVAILABLE",
    "TRAINING_PLANNING_UNAVAILABLE",
    "TrainingPlanningService",
    "TrainingPlanningStateError",
    "TrainingPlanningStateErrorCode",
    "validate_training_planning_run",
]
