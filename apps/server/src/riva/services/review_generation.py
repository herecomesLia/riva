from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.language import INTERACTION_LANGUAGES, InteractionLanguage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeReview,
    PracticeSession,
)
from riva.prompts import PRACTICE_REVIEW_PROMPT
from riva.schemas.evaluation import EvaluationInput
from riva.schemas.practice_review import (
    PracticeReviewInput,
    PracticeReviewOutput,
    ReviewRunPayload,
)
from riva.services.agent_runs import AgentRunService
from riva.services.competency_ingestion import CompetencyIngestionService
from riva.services.evaluation_generation import (
    EvaluationGenerationService,
    EvaluationGenerationStateError,
    practice_evaluation_idempotency_key,
    practice_evaluation_output_from_artifact,
    validate_evaluation_generation_run,
)
from riva.utils import utc_now


ReviewGenerationStateErrorCode = Literal[
    "invalid_practice_review_run",
    "practice_review_attempt_not_found",
    "practice_review_session_not_active",
    "practice_review_evaluation_not_ready",
    "practice_review_evaluation_context_invalid",
    "practice_review_context_conflict",
    "practice_review_artifact_conflict",
]

INVALID_PRACTICE_REVIEW_RUN: ReviewGenerationStateErrorCode = (
    "invalid_practice_review_run"
)
PRACTICE_REVIEW_ATTEMPT_NOT_FOUND: ReviewGenerationStateErrorCode = (
    "practice_review_attempt_not_found"
)
PRACTICE_REVIEW_SESSION_NOT_ACTIVE: ReviewGenerationStateErrorCode = (
    "practice_review_session_not_active"
)
PRACTICE_REVIEW_EVALUATION_NOT_READY: ReviewGenerationStateErrorCode = (
    "practice_review_evaluation_not_ready"
)
PRACTICE_REVIEW_EVALUATION_CONTEXT_INVALID: ReviewGenerationStateErrorCode = (
    "practice_review_evaluation_context_invalid"
)
PRACTICE_REVIEW_CONTEXT_CONFLICT: ReviewGenerationStateErrorCode = (
    "practice_review_context_conflict"
)
PRACTICE_REVIEW_ARTIFACT_CONFLICT: ReviewGenerationStateErrorCode = (
    "practice_review_artifact_conflict"
)


class ReviewGenerationStateError(RuntimeError):
    safe_message = "The practice review generation state is invalid."

    def __init__(self, code: ReviewGenerationStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


@dataclass(frozen=True)
class _ReviewContext:
    attempt: PracticeAttempt
    session: PracticeSession
    evaluation: PracticeEvaluation
    evaluation_run: AgentRun
    evaluation_input: EvaluationInput
    input: PracticeReviewInput


def practice_review_idempotency_key(attempt_id: UUID) -> str:
    return f"practice-attempt:{attempt_id}:review"


def validate_review_generation_run(
    run: AgentRun,
) -> ReviewRunPayload:
    """Validate the immutable contract shared by review consumers."""

    prompt = PRACTICE_REVIEW_PROMPT
    if (
        run.agent_id != "practice-reviewer"
        or run.prompt_id != prompt.prompt_id
        or run.prompt_version != prompt.version
        or run.output_schema_id != prompt.output_schema_id
    ):
        raise ReviewGenerationStateError(INVALID_PRACTICE_REVIEW_RUN)
    try:
        return ReviewRunPayload.model_validate(run.payload)
    except (TypeError, ValidationError):
        raise ReviewGenerationStateError(INVALID_PRACTICE_REVIEW_RUN) from None


def practice_review_output_from_artifact(
    review: PracticeReview,
) -> PracticeReviewOutput:
    """Project the durable canonical review back through its output schema."""

    try:
        return PracticeReviewOutput.model_validate(
            {
                "overall_performance": review.overall_performance,
                "highlights": review.highlights,
                "main_issues": review.main_issues,
                "improvement_suggestions": review.improvement_suggestions,
                "reusable_answer_structure": review.reusable_answer_structure,
                "exposed_weaknesses": review.exposed_weaknesses,
            }
        )
    except (TypeError, ValueError, ValidationError):
        raise ValueError("persisted practice review is malformed") from None


class ReviewGenerationService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_model: str | None = None,
        agent_run_service_factory: Callable[[AsyncSession], AgentRunService] = (
            AgentRunService
        ),
        competency_ingestion_service_factory: Callable[
            [AsyncSession], CompetencyIngestionService
        ] = CompetencyIngestionService,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.llm_model = (llm_model or "").strip()
        self.agent_run_service_factory = agent_run_service_factory
        self.competency_ingestion_service_factory = (
            competency_ingestion_service_factory
        )
        self.clock = clock

    async def enqueue_generation(
        self,
        *,
        user_id: UUID,
        attempt_id: UUID,
        interaction_language: InteractionLanguage,
        idempotency_key: str,
    ) -> AgentRun:
        try:
            run = await self.enqueue_generation_in_transaction(
                user_id=user_id,
                attempt_id=attempt_id,
                interaction_language=interaction_language,
                idempotency_key=idempotency_key,
            )
            await self.session.commit()
            return run
        except Exception:
            await self.session.rollback()
            raise

    async def enqueue_generation_in_transaction(
        self,
        *,
        user_id: UUID,
        attempt_id: UUID,
        interaction_language: InteractionLanguage,
        idempotency_key: str,
    ) -> AgentRun:
        self._require_configuration()
        if idempotency_key != practice_review_idempotency_key(attempt_id):
            raise ReviewGenerationStateError(PRACTICE_REVIEW_CONTEXT_CONFLICT)

        context = await self._load_context(
            user_id=user_id,
            attempt_id=attempt_id,
            interaction_language=interaction_language,
            payload=None,
            for_update=True,
        )
        payload = ReviewRunPayload(
            attempt_id=context.attempt.id,
            evaluation_id=context.evaluation.id,
            interaction_language=context.session.language,
        )
        return await self.agent_run_service_factory(
            self.session
        ).enqueue_in_transaction(
            user_id=user_id,
            agent_id="practice-reviewer",
            prompt_id=PRACTICE_REVIEW_PROMPT.prompt_id,
            prompt_version=PRACTICE_REVIEW_PROMPT.version,
            output_schema_id=PRACTICE_REVIEW_PROMPT.output_schema_id,
            model=self.llm_model,
            payload=payload.model_dump(mode="json", by_alias=True),
            idempotency_key=idempotency_key,
            max_attempts=3,
        )

    async def load_generation_input(
        self,
        run: AgentRun,
    ) -> PracticeReviewInput:
        try:
            review_input = await self.load_generation_input_in_transaction(run)
            await self.session.commit()
            return review_input
        except Exception:
            await self.session.rollback()
            raise

    async def load_generation_input_in_transaction(
        self,
        run: AgentRun,
    ) -> PracticeReviewInput:
        payload = validate_review_generation_run(run)
        if run.idempotency_key != practice_review_idempotency_key(
            payload.attempt_id
        ):
            raise ReviewGenerationStateError(PRACTICE_REVIEW_CONTEXT_CONFLICT)
        context = await self._load_context(
            user_id=run.user_id,
            attempt_id=payload.attempt_id,
            interaction_language=payload.interaction_language,
            payload=payload,
            for_update=False,
        )
        return context.input

    async def persist_success(
        self,
        run: AgentRun,
        output: PracticeReviewOutput,
    ) -> PracticeReviewOutput:
        try:
            payload = validate_review_generation_run(run)
            if run.idempotency_key != practice_review_idempotency_key(
                payload.attempt_id
            ):
                raise ReviewGenerationStateError(
                    PRACTICE_REVIEW_CONTEXT_CONFLICT
                )
            context = await self._load_context(
                user_id=run.user_id,
                attempt_id=payload.attempt_id,
                interaction_language=payload.interaction_language,
                payload=payload,
                for_update=True,
            )

            existing = await self.session.scalar(
                select(PracticeReview)
                .where(PracticeReview.source_agent_run_id == run.id)
                .with_for_update()
            )
            if existing is None:
                existing = await self.session.scalar(
                    select(PracticeReview)
                    .where(PracticeReview.attempt_id == payload.attempt_id)
                    .with_for_update()
                )
            if existing is not None:
                if (
                    existing.attempt_id != payload.attempt_id
                    or existing.source_agent_run_id != run.id
                ):
                    raise ReviewGenerationStateError(
                        PRACTICE_REVIEW_ARTIFACT_CONFLICT
                    )
                try:
                    canonical = practice_review_output_from_artifact(existing)
                except ValueError:
                    raise ReviewGenerationStateError(
                        PRACTICE_REVIEW_ARTIFACT_CONFLICT
                    ) from None
                await self.competency_ingestion_service_factory(
                    self.session
                ).ingest_practice_review(
                    user_id=run.user_id,
                    practice_session=context.session,
                    attempt=context.attempt,
                    review=existing,
                )
                await self.session.commit()
                return canonical

            validated_output = _validate_output(output)
            now = self.clock()
            _require_aware_datetime(now)
            review = PracticeReview(
                id=uuid4(),
                attempt_id=payload.attempt_id,
                source_agent_run_id=run.id,
                overall_performance=validated_output.overall_performance,
                highlights=list(validated_output.highlights),
                main_issues=list(validated_output.main_issues),
                improvement_suggestions=list(
                    validated_output.improvement_suggestions
                ),
                reusable_answer_structure=list(
                    validated_output.reusable_answer_structure
                ),
                exposed_weaknesses=list(validated_output.exposed_weaknesses),
                reviewed_at=now,
            )
            self.session.add(review)
            await self.session.flush()
            await self.competency_ingestion_service_factory(
                self.session
            ).ingest_practice_review(
                user_id=run.user_id,
                practice_session=context.session,
                attempt=context.attempt,
                review=review,
            )
            await self.session.commit()
            try:
                return practice_review_output_from_artifact(review)
            except ValueError:
                raise ReviewGenerationStateError(
                    PRACTICE_REVIEW_ARTIFACT_CONFLICT
                ) from None
        except Exception:
            await self.session.rollback()
            raise

    async def _load_context(
        self,
        *,
        user_id: UUID,
        attempt_id: UUID,
        interaction_language: InteractionLanguage,
        payload: ReviewRunPayload | None,
        for_update: bool,
    ) -> _ReviewContext:
        if interaction_language not in INTERACTION_LANGUAGES:
            raise ReviewGenerationStateError(
                PRACTICE_REVIEW_EVALUATION_CONTEXT_INVALID
            )
        if payload is not None and payload.attempt_id != attempt_id:
            raise ReviewGenerationStateError(PRACTICE_REVIEW_CONTEXT_CONFLICT)

        attempt_statement = select(PracticeAttempt).where(
            PracticeAttempt.id == attempt_id,
            PracticeAttempt.user_id == user_id,
        )
        attempt = await self._scalar(attempt_statement, for_update=False)
        if attempt is None:
            raise ReviewGenerationStateError(PRACTICE_REVIEW_ATTEMPT_NOT_FOUND)

        session_statement = select(PracticeSession).where(
            PracticeSession.id == attempt.session_id,
            PracticeSession.user_id == user_id,
        )
        practice_session = await self._scalar(
            session_statement,
            for_update=for_update,
        )
        if (
            practice_session is None
            or practice_session.status != "active"
        ):
            raise ReviewGenerationStateError(PRACTICE_REVIEW_SESSION_NOT_ACTIVE)
        if practice_session.language != interaction_language:
            raise ReviewGenerationStateError(
                PRACTICE_REVIEW_EVALUATION_CONTEXT_INVALID
            )

        if for_update:
            attempt = await self._scalar(attempt_statement, for_update=True)
            if attempt is None:
                raise ReviewGenerationStateError(
                    PRACTICE_REVIEW_ATTEMPT_NOT_FOUND
                )
        if attempt.status != "evaluating":
            raise ReviewGenerationStateError(PRACTICE_REVIEW_CONTEXT_CONFLICT)

        if payload is None:
            evaluation_statement = select(PracticeEvaluation).where(
                PracticeEvaluation.attempt_id == attempt.id
            )
        else:
            evaluation_statement = select(PracticeEvaluation).where(
                PracticeEvaluation.id == payload.evaluation_id
            )
        evaluation = await self._scalar(
            evaluation_statement,
            for_update=for_update,
        )
        if evaluation is None:
            if payload is None:
                raise ReviewGenerationStateError(
                    PRACTICE_REVIEW_EVALUATION_NOT_READY
                )
            raise ReviewGenerationStateError(PRACTICE_REVIEW_CONTEXT_CONFLICT)
        if evaluation.attempt_id != attempt.id:
            raise ReviewGenerationStateError(PRACTICE_REVIEW_CONTEXT_CONFLICT)

        evaluation_run_statement = select(AgentRun).where(
            AgentRun.id == evaluation.source_agent_run_id
        )
        evaluation_run = await self._scalar(
            evaluation_run_statement,
            for_update=for_update,
        )
        if (
            evaluation_run is None
            or evaluation_run.status is not AgentRunStatus.SUCCEEDED
        ):
            raise ReviewGenerationStateError(
                PRACTICE_REVIEW_EVALUATION_NOT_READY
            )

        try:
            evaluation_payload = validate_evaluation_generation_run(
                evaluation_run
            )
        except EvaluationGenerationStateError:
            raise ReviewGenerationStateError(
                PRACTICE_REVIEW_EVALUATION_CONTEXT_INVALID
            ) from None

        if (
            evaluation_run.user_id != user_id
            or evaluation_run.idempotency_key
            != practice_evaluation_idempotency_key(attempt.id)
            or evaluation_payload.attempt_id != attempt.id
            or evaluation_payload.interaction_language != practice_session.language
            or evaluation.source_agent_run_id != evaluation_run.id
        ):
            raise ReviewGenerationStateError(
                PRACTICE_REVIEW_EVALUATION_CONTEXT_INVALID
            )

        try:
            evaluation_input = await EvaluationGenerationService(
                self.session
            ).load_generation_input_in_transaction(evaluation_run)
        except (
            EvaluationGenerationStateError,
            TypeError,
            ValueError,
            ValidationError,
        ):
            raise ReviewGenerationStateError(
                PRACTICE_REVIEW_EVALUATION_CONTEXT_INVALID
            ) from None

        if evaluation_input.interaction_language != practice_session.language:
            raise ReviewGenerationStateError(
                PRACTICE_REVIEW_EVALUATION_CONTEXT_INVALID
            )

        try:
            canonical_evaluation = practice_evaluation_output_from_artifact(
                evaluation,
                scoring_focus_count=len(evaluation_input.question.scoring_focus),
            )
            review_input = PracticeReviewInput(
                interaction_language=evaluation_input.interaction_language,
                question=evaluation_input.question,
                main_answer=evaluation_input.main_answer,
                follow_up_exchanges=evaluation_input.follow_up_exchanges,
                follow_up_completion_reason=(
                    evaluation_input.follow_up_completion_reason
                ),
                evaluation=canonical_evaluation,
            )
        except (TypeError, ValueError, ValidationError):
            raise ReviewGenerationStateError(
                PRACTICE_REVIEW_EVALUATION_CONTEXT_INVALID
            ) from None

        return _ReviewContext(
            attempt=attempt,
            session=practice_session,
            evaluation=evaluation,
            evaluation_run=evaluation_run,
            evaluation_input=evaluation_input,
            input=review_input,
        )

    async def _scalar(self, statement, *, for_update: bool):
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    def _require_configuration(self) -> None:
        if not self.llm_model:
            raise ValueError("llm_model must not be empty")


def _validate_output(output: object) -> PracticeReviewOutput:
    try:
        return PracticeReviewOutput.model_validate(output)
    except (TypeError, ValueError, ValidationError):
        raise ReviewGenerationStateError(
            PRACTICE_REVIEW_ARTIFACT_CONFLICT
        ) from None


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")


__all__ = [
    "INVALID_PRACTICE_REVIEW_RUN",
    "PRACTICE_REVIEW_ARTIFACT_CONFLICT",
    "PRACTICE_REVIEW_ATTEMPT_NOT_FOUND",
    "PRACTICE_REVIEW_CONTEXT_CONFLICT",
    "PRACTICE_REVIEW_EVALUATION_CONTEXT_INVALID",
    "PRACTICE_REVIEW_EVALUATION_NOT_READY",
    "PRACTICE_REVIEW_SESSION_NOT_ACTIVE",
    "ReviewGenerationService",
    "ReviewGenerationStateError",
    "ReviewGenerationStateErrorCode",
    "practice_review_idempotency_key",
    "practice_review_output_from_artifact",
    "validate_review_generation_run",
]
