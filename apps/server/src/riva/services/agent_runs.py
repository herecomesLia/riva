from collections.abc import Callable, Mapping
from datetime import datetime, timedelta
import re
from typing import TypeVar, cast
from uuid import UUID, uuid4

from pydantic import BaseModel, TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents import AgentResult
from riva.core.language import INTERACTION_LANGUAGES
from riva.models import AgentRun, AgentRunStatus
from riva.models.agent_runs import AgentRunPayload, AgentRunResult, JSONValue
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.schemas.practice_interactions import MAX_PRACTICE_FOLLOW_UPS
from riva.schemas.evaluation import (
    PracticeEvaluationFollowUpCompletionReason,
    PracticeEvaluationOutput,
)
from riva.schemas.practice_reference_answer import (
    PracticeReferenceFrozenContext,
    PracticeReferencePreviousFollowUpRunPayload,
)
from riva.schemas.question_generation import (
    MAX_QUESTION_GENERATION_WEAKNESS_FOCUS_ITEMS,
    QuestionGenerationWeaknessEvidence,
)
from riva.schemas.interview_planning import InterviewPlanningInput
from riva.schemas.interview_turn import InterviewTurnInput
from riva.utils import utc_now


AgentOutputT = TypeVar("AgentOutputT", bound=BaseModel)
PayloadValue = UUID | JSONValue
_ERROR_CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
_QUESTION_TYPES = frozenset(item.value for item in QuestionCardQuestionType)
_DIFFICULTIES = frozenset(item.value for item in QuestionCardDifficulty)
_PRACTICE_EVALUATION_COMPLETION_REASONS = frozenset(
    item.value for item in PracticeEvaluationFollowUpCompletionReason
)


class AgentRunLeaseError(RuntimeError):
    code = "agent_run_lease_invalid"

    def __init__(self) -> None:
        super().__init__("The agent run lease is invalid or expired.")


class AgentRunResultMismatchError(RuntimeError):
    code = "agent_run_result_mismatch"

    def __init__(self) -> None:
        super().__init__("The agent result does not match the claimed run.")


class AgentRunService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        clock: Callable[[], datetime] = utc_now,
        lease_token_factory: Callable[[], UUID] = uuid4,
    ) -> None:
        self.session = session
        self.clock = clock
        self.lease_token_factory = lease_token_factory

    async def enqueue(
        self,
        *,
        user_id: UUID,
        agent_id: str,
        prompt_id: str,
        prompt_version: str,
        output_schema_id: str,
        model: str,
        payload: Mapping[str, PayloadValue],
        idempotency_key: str,
        max_attempts: int,
        available_at: datetime | None = None,
    ) -> AgentRun:
        try:
            run = await self.enqueue_in_transaction(
                user_id=user_id,
                agent_id=agent_id,
                prompt_id=prompt_id,
                prompt_version=prompt_version,
                output_schema_id=output_schema_id,
                model=model,
                payload=payload,
                idempotency_key=idempotency_key,
                max_attempts=max_attempts,
                available_at=available_at,
            )
            await self.session.commit()
            return run
        except Exception:
            await self.session.rollback()
            raise

    async def enqueue_in_transaction(
        self,
        *,
        user_id: UUID,
        agent_id: str,
        prompt_id: str,
        prompt_version: str,
        output_schema_id: str,
        model: str,
        payload: Mapping[str, PayloadValue],
        idempotency_key: str,
        max_attempts: int,
        available_at: datetime | None = None,
    ) -> AgentRun:
        agent_id = _required_text("agent_id", agent_id, 128)
        prompt_id = _required_text("prompt_id", prompt_id, 128)
        prompt_version = _required_text("prompt_version", prompt_version, 64)
        output_schema_id = _required_text(
            "output_schema_id", output_schema_id, 128
        )
        model = _required_text("model", model, 255)
        idempotency_key = _required_text(
            "idempotency_key", idempotency_key, 255
        )
        if max_attempts < 1:
            raise ValueError("max_attempts must be at least 1")
        serialized_payload = _serialize_payload(payload)
        scheduled_at = available_at or self.clock()
        _require_aware_datetime("available_at", scheduled_at)

        run = AgentRun(
            user_id=user_id,
            agent_id=agent_id,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            output_schema_id=output_schema_id,
            status=AgentRunStatus.QUEUED,
            payload=serialized_payload,
            idempotency_key=idempotency_key,
            attempt_count=0,
            max_attempts=max_attempts,
            available_at=scheduled_at,
            model=model,
        )
        try:
            async with self.session.begin_nested():
                self.session.add(run)
                await self.session.flush()
        except IntegrityError:
            existing = await self._idempotent_run(
                user_id=user_id,
                agent_id=agent_id,
                prompt_id=prompt_id,
                prompt_version=prompt_version,
                idempotency_key=idempotency_key,
            )
            if existing is None:
                raise
            return existing
        return run

    async def claim_next(
        self,
        *,
        lease_owner: str,
        lease_duration: timedelta,
    ) -> AgentRun | None:
        try:
            lease_owner = _required_text("lease_owner", lease_owner, 255)
            if lease_duration <= timedelta(0):
                raise ValueError("lease_duration must be positive")
            now = self.clock()
            _require_aware_datetime("clock", now)
            run = await self.session.scalar(
                select(AgentRun)
                .where(
                    AgentRun.status == AgentRunStatus.QUEUED,
                    AgentRun.available_at <= now,
                    AgentRun.attempt_count < AgentRun.max_attempts,
                )
                .order_by(
                    AgentRun.available_at.asc(),
                    AgentRun.created_at.asc(),
                    AgentRun.id.asc(),
                )
                .with_for_update(skip_locked=True)
                .limit(1)
            )
            if run is None:
                await self.session.commit()
                return None

            run.status = AgentRunStatus.RUNNING
            run.attempt_count += 1
            run.lease_owner = lease_owner
            run.lease_token = self.lease_token_factory()
            run.lease_expires_at = now + lease_duration
            if run.started_at is None:
                run.started_at = now

            await self.session.commit()
            return run
        except Exception:
            await self.session.rollback()
            raise

    async def mark_succeeded(
        self,
        *,
        run_id: UUID,
        lease_token: UUID,
        result: AgentResult[AgentOutputT],
    ) -> AgentRun:
        try:
            now = self.clock()
            run = await self._leased_run(run_id, lease_token, now)
            if (
                result.agent_id != run.agent_id
                or result.prompt_id != run.prompt_id
                or result.prompt_version != run.prompt_version
            ):
                raise AgentRunResultMismatchError
            provider = _required_text("provider", result.provider, 128)
            model = _required_text("model", result.model, 255)

            run.status = AgentRunStatus.SUCCEEDED
            run.result = cast(
                AgentRunResult,
                result.output.model_dump(
                    mode="json",
                    by_alias=isinstance(result.output, PracticeEvaluationOutput),
                ),
            )
            run.provider = provider
            run.model = model
            run.input_tokens = result.usage.input_tokens
            run.output_tokens = result.usage.output_tokens
            run.finished_at = now
            run.error_code = None
            _clear_lease(run)

            await self.session.commit()
            return run
        except Exception:
            await self.session.rollback()
            raise

    async def mark_failed(
        self,
        *,
        run_id: UUID,
        lease_token: UUID,
        error_code: str,
        retryable: bool,
        retry_delay: timedelta,
    ) -> AgentRun:
        try:
            error_code = _safe_error_code(error_code)
            if retry_delay < timedelta(0):
                raise ValueError("retry_delay must not be negative")
            now = self.clock()
            run = await self._leased_run(run_id, lease_token, now)

            run.error_code = error_code
            _clear_lease(run)
            if retryable and run.attempt_count < run.max_attempts:
                run.status = AgentRunStatus.QUEUED
                run.available_at = now + retry_delay
                run.finished_at = None
            else:
                run.status = AgentRunStatus.FAILED
                run.finished_at = now

            await self.session.commit()
            return run
        except Exception:
            await self.session.rollback()
            raise

    async def renew_lease(
        self,
        *,
        run_id: UUID,
        lease_token: UUID,
        lease_duration: timedelta,
    ) -> AgentRun:
        try:
            if lease_duration <= timedelta(0):
                raise ValueError("lease_duration must be positive")
            now = self.clock()
            run = await self._leased_run(run_id, lease_token, now)
            run.lease_expires_at = now + lease_duration
            await self.session.commit()
            return run
        except Exception:
            await self.session.rollback()
            raise

    async def requeue_expired(self, *, batch_size: int = 100) -> int:
        try:
            if batch_size <= 0:
                raise ValueError("batch_size must be positive")
            now = self.clock()
            _require_aware_datetime("clock", now)
            runs = list(
                (
                    await self.session.scalars(
                        select(AgentRun)
                        .where(
                            AgentRun.status == AgentRunStatus.RUNNING,
                            AgentRun.lease_expires_at <= now,
                        )
                        .order_by(
                            AgentRun.lease_expires_at.asc(),
                            AgentRun.id.asc(),
                        )
                        .with_for_update(skip_locked=True)
                        .limit(batch_size)
                    )
                ).all()
            )
            for run in runs:
                run.error_code = "lease_expired"
                _clear_lease(run)
                if run.attempt_count < run.max_attempts:
                    run.status = AgentRunStatus.QUEUED
                    run.available_at = now
                    run.finished_at = None
                else:
                    run.status = AgentRunStatus.FAILED
                    run.finished_at = now

            await self.session.commit()
            return len(runs)
        except Exception:
            await self.session.rollback()
            raise

    async def _idempotent_run(
        self,
        *,
        user_id: UUID,
        agent_id: str,
        prompt_id: str,
        prompt_version: str,
        idempotency_key: str,
    ) -> AgentRun | None:
        return await self.session.scalar(
            select(AgentRun)
            .where(
                AgentRun.user_id == user_id,
                AgentRun.agent_id == agent_id,
                AgentRun.prompt_id == prompt_id,
                AgentRun.prompt_version == prompt_version,
                AgentRun.idempotency_key == idempotency_key,
            )
            .execution_options(populate_existing=True)
        )

    async def _leased_run(
        self,
        run_id: UUID,
        lease_token: UUID,
        now: datetime,
    ) -> AgentRun:
        _require_aware_datetime("clock", now)
        run = await self.session.scalar(
            select(AgentRun)
            .where(
                AgentRun.id == run_id,
                AgentRun.status == AgentRunStatus.RUNNING,
                AgentRun.lease_token == lease_token,
                AgentRun.lease_expires_at > now,
            )
            .with_for_update()
        )
        if run is None:
            raise AgentRunLeaseError
        return run


def _serialize_payload(
    payload: Mapping[str, PayloadValue],
) -> AgentRunPayload:
    if not payload:
        raise ValueError(
            "payload must contain resource snapshot fields or approved invocation metadata"
        )

    serialized: AgentRunPayload = {}
    for key, value in payload.items():
        normalized_key = key.replace("_", "").lower()
        if not key:
            raise ValueError(
                "payload keys must identify a business resource/version or approved invocation metadata"
            )
        if key == "interactionLanguage":
            if not isinstance(value, str) or value not in INTERACTION_LANGUAGES:
                raise ValueError(
                    "payload.interactionLanguage must be a supported interaction language"
                )
            serialized[key] = value
        elif key == "questionType":
            if not isinstance(value, str) or value not in _QUESTION_TYPES:
                raise ValueError(
                    "payload.questionType must be a supported question type"
                )
            serialized[key] = value
        elif key == "difficulty":
            if not isinstance(value, str) or value not in _DIFFICULTIES:
                raise ValueError(
                    "payload.difficulty must be a supported difficulty"
                )
            serialized[key] = value
        elif key == "followUpCompletionReason":
            if (
                not isinstance(value, str)
                or value not in _PRACTICE_EVALUATION_COMPLETION_REASONS
            ):
                raise ValueError(
                    "payload.followUpCompletionReason must be a supported "
                    "practice evaluation completion reason"
                )
            serialized[key] = value
        elif key == "targetType":
            if not isinstance(value, str) or value not in {"main", "followUp"}:
                raise ValueError(
                    "payload.targetType must be a supported target type"
                )
            serialized[key] = value
        elif key == "expectedKind":
            if not isinstance(value, str) or value not in {
                "personalizedExample",
                "personalizedSupplement",
                "technicalReference",
            }:
                raise ValueError(
                    "payload.expectedKind must be a supported reference answer kind"
                )
            serialized[key] = value
        elif key == "referenceContext":
            serialized[key] = _serialize_reference_context(value)
        elif key == "previousFollowUps":
            serialized[key] = _serialize_previous_follow_ups(value)
        elif key == "weaknessFocus":
            serialized[key] = _serialize_weakness_focus(value)
        elif key == "interviewPlanningInput":
            serialized[key] = _serialize_interview_planning_input(value)
        elif key == "interviewTurnInput":
            serialized[key] = _serialize_interview_turn_input(value)
        elif key == "planRevision":
            if (
                isinstance(value, bool)
                or not isinstance(value, int)
                or value < 1
            ):
                raise ValueError(
                    "payload.planRevision must be a positive integer"
                )
            serialized[key] = value
        elif key == "remainingFollowUpSlots":
            if (
                isinstance(value, bool)
                or not isinstance(value, int)
                or not 0 <= value <= 2
            ):
                raise ValueError(
                    "payload.remainingFollowUpSlots must be between 0 and 2"
                )
            serialized[key] = value
        elif key in {
            "followUpQuestionId",
            "followUpAnswerId",
            "retryOfRunId",
        }:
            if value is None:
                serialized[key] = None
            elif isinstance(value, UUID):
                serialized[key] = str(value)
            elif isinstance(value, str):
                serialized[key] = _required_text(f"payload.{key}", value, 255)
            else:
                raise ValueError(
                    "payload values must be resource identifiers or versions"
                )
        elif key == "nextFollowUpOrder":
            if (
                isinstance(value, bool)
                or not isinstance(value, int)
                or not 1 <= value <= MAX_PRACTICE_FOLLOW_UPS
            ):
                raise ValueError(
                    "payload.nextFollowUpOrder must be an integer follow-up order"
                )
            serialized[key] = value
        elif key in {
            "previousFollowUpQuestionId",
            "previousFollowUpAnswerId",
        }:
            if value is None:
                serialized[key] = None
            elif isinstance(value, UUID):
                serialized[key] = str(value)
            elif isinstance(value, str):
                serialized[key] = _required_text(f"payload.{key}", value, 255)
            else:
                raise ValueError(
                    "payload values must be resource identifiers or versions"
                )
        elif normalized_key.endswith(("id", "version")):
            if isinstance(value, UUID):
                serialized[key] = str(value)
            elif isinstance(value, bool) or not isinstance(value, (str, int)):
                raise ValueError(
                    "payload values must be resource identifiers or versions"
                )
            elif isinstance(value, int):
                if value < 1:
                    raise ValueError("payload numeric versions must be at least 1")
                serialized[key] = value
            else:
                serialized[key] = _required_text(f"payload.{key}", value, 255)
        else:
            raise ValueError(
                "payload keys must identify a business resource/version or approved invocation metadata"
            )
    return serialized


def _serialize_reference_context(value: object) -> dict[str, JSONValue]:
    try:
        context = PracticeReferenceFrozenContext.model_validate(value)
        return cast(
            dict[str, JSONValue],
            context.model_dump(mode="json", by_alias=True),
        )
    except (TypeError, ValueError, ValidationError):
        raise ValueError(
            "payload.referenceContext must be a valid frozen reference context"
        ) from None


def _serialize_interview_planning_input(value: object) -> dict[str, JSONValue]:
    try:
        planning_input = InterviewPlanningInput.model_validate(value)
        return cast(
            dict[str, JSONValue],
            planning_input.model_dump(mode="json", by_alias=True),
        )
    except (TypeError, ValueError, ValidationError):
        raise ValueError(
            "payload.interviewPlanningInput must be a valid planning snapshot"
        ) from None


def _serialize_interview_turn_input(value: object) -> dict[str, JSONValue]:
    try:
        turn_input = InterviewTurnInput.model_validate(value)
        return cast(
            dict[str, JSONValue],
            turn_input.model_dump(mode="json", by_alias=True),
        )
    except (TypeError, ValueError, ValidationError):
        raise ValueError(
            "payload.interviewTurnInput must be a valid frozen turn snapshot"
        ) from None


def _serialize_previous_follow_ups(value: object) -> list[JSONValue]:
    try:
        previous = TypeAdapter(
            list[PracticeReferencePreviousFollowUpRunPayload]
        ).validate_python(value)
        return cast(
            list[JSONValue],
            [item.model_dump(mode="json", by_alias=True) for item in previous],
        )
    except (TypeError, ValueError, ValidationError):
        raise ValueError(
            "payload.previousFollowUps must contain valid follow-up lineage"
        ) from None


def _serialize_weakness_focus(value: object) -> list[JSONValue]:
    try:
        evidence = TypeAdapter(
            list[QuestionGenerationWeaknessEvidence]
        ).validate_python(value)
        if len(evidence) > MAX_QUESTION_GENERATION_WEAKNESS_FOCUS_ITEMS:
            raise ValueError
        return cast(
            list[JSONValue],
            [item.model_dump(mode="json", by_alias=True) for item in evidence],
        )
    except (TypeError, ValueError, ValidationError):
        raise ValueError(
            "payload.weaknessFocus must contain valid weakness evidence"
        ) from None


def _safe_error_code(error_code: str) -> str:
    if not _ERROR_CODE_PATTERN.fullmatch(error_code):
        raise ValueError("error_code must be a safe stable identifier")
    return error_code


def _required_text(name: str, value: str, max_length: int) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{name} must not be empty")
    if len(normalized) > max_length:
        raise ValueError(f"{name} must not exceed {max_length} characters")
    return normalized


def _require_aware_datetime(name: str, value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be timezone-aware")


def _clear_lease(run: AgentRun) -> None:
    run.lease_owner = None
    run.lease_token = None
    run.lease_expires_at = None
