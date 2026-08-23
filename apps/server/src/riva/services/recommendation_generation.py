from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.practice_recommendation import PracticeRecommendationAgent
from riva.core.language import INTERACTION_LANGUAGES, InteractionLanguage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeRecommendation,
    PracticeReview,
    PracticeSession,
)
from riva.schemas.practice_recommendation import (
    PracticeNextQuestionRecommendation,
    PracticeRecommendationInput,
    PracticeRecommendationOutput,
    PracticeRecommendationQuestionContext,
    PracticeRetryCurrentRecommendation,
    RecommendationRunPayload,
)
from riva.schemas.practice_review import PracticeReviewInput
from riva.schemas.training_memory import TrainingMemoryContext
from riva.services.agent_runs import AgentRunService
from riva.services.review_generation import (
    ReviewGenerationService,
    ReviewGenerationStateError,
    practice_review_idempotency_key,
    practice_review_output_from_artifact,
    validate_review_generation_run,
)
from riva.services.training_memory import TrainingMemoryService
from riva.utils import utc_now

RecommendationGenerationStateErrorCode = Literal[
    "invalid_practice_recommendation_run",
    "practice_recommendation_attempt_not_found",
    "practice_recommendation_session_not_active",
    "practice_recommendation_review_not_ready",
    "practice_recommendation_review_context_invalid",
    "practice_recommendation_context_conflict",
    "practice_recommendation_artifact_conflict",
]

INVALID_PRACTICE_RECOMMENDATION_RUN: RecommendationGenerationStateErrorCode = (
    "invalid_practice_recommendation_run"
)
PRACTICE_RECOMMENDATION_ATTEMPT_NOT_FOUND: RecommendationGenerationStateErrorCode = (
    "practice_recommendation_attempt_not_found"
)
PRACTICE_RECOMMENDATION_SESSION_NOT_ACTIVE: RecommendationGenerationStateErrorCode = (
    "practice_recommendation_session_not_active"
)
PRACTICE_RECOMMENDATION_REVIEW_NOT_READY: RecommendationGenerationStateErrorCode = (
    "practice_recommendation_review_not_ready"
)
PRACTICE_RECOMMENDATION_REVIEW_CONTEXT_INVALID: RecommendationGenerationStateErrorCode = "practice_recommendation_review_context_invalid"
PRACTICE_RECOMMENDATION_CONTEXT_CONFLICT: RecommendationGenerationStateErrorCode = (
    "practice_recommendation_context_conflict"
)
PRACTICE_RECOMMENDATION_ARTIFACT_CONFLICT: RecommendationGenerationStateErrorCode = (
    "practice_recommendation_artifact_conflict"
)


class RecommendationGenerationStateError(RuntimeError):
    safe_message = "The practice recommendation generation state is invalid."

    def __init__(self, code: RecommendationGenerationStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


@dataclass(frozen=True)
class _RecommendationContext:
    attempt: PracticeAttempt
    session: PracticeSession
    evaluation: PracticeEvaluation
    review: PracticeReview
    review_run: AgentRun
    review_input: PracticeReviewInput
    input: PracticeRecommendationInput


def practice_recommendation_idempotency_key(attempt_id: UUID) -> str:
    return f"practice-attempt:{attempt_id}:recommendation"


def validate_recommendation_generation_run(
    run: AgentRun,
) -> RecommendationRunPayload:
    """Validate the immutable contract shared by recommendation consumers."""

    if (
        run.agent_id != PracticeRecommendationAgent.agent_id
        or run.prompt_id != PracticeRecommendationAgent.agent_id
        or run.prompt_version != PracticeRecommendationAgent.agent_version
        or run.output_schema_id != PracticeRecommendationAgent.output_schema_id
    ):
        raise RecommendationGenerationStateError(INVALID_PRACTICE_RECOMMENDATION_RUN)
    try:
        return RecommendationRunPayload.model_validate(run.payload)
    except TypeError, ValueError, ValidationError:
        raise RecommendationGenerationStateError(
            INVALID_PRACTICE_RECOMMENDATION_RUN
        ) from None


def practice_recommendation_output_from_artifact(
    recommendation: PracticeRecommendation,
) -> PracticeRecommendationOutput:
    """Project the durable canonical recommendation through its union schema."""

    payload: dict[str, object] = {
        "action": recommendation.action,
        "reason": recommendation.reason,
    }
    if recommendation.action == "nextQuestion":
        payload["nextQuestion"] = {
            "questionType": recommendation.next_question_type,
            "difficulty": recommendation.next_difficulty,
            "focusAreas": recommendation.focus_areas,
        }
    elif recommendation.action == "retryCurrent":
        if (
            recommendation.next_question_type is not None
            or recommendation.next_difficulty is not None
            or recommendation.focus_areas != []
        ):
            raise ValueError(
                "persisted retry recommendation contains a next-question plan"
            )
    else:
        raise ValueError("persisted practice recommendation has an invalid action")

    try:
        return TypeAdapter(PracticeRecommendationOutput).validate_python(payload)
    except TypeError, ValueError, ValidationError:
        raise ValueError("persisted practice recommendation is malformed") from None


class RecommendationGenerationService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_model: str | None = None,
        agent_run_service_factory: Callable[[AsyncSession], AgentRunService] = (
            AgentRunService
        ),
        training_memory_service_factory: Callable[
            [AsyncSession], TrainingMemoryService
        ] = TrainingMemoryService,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.llm_model = (llm_model or "").strip()
        self.agent_run_service_factory = agent_run_service_factory
        self.training_memory_service_factory = training_memory_service_factory
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
        if idempotency_key != practice_recommendation_idempotency_key(attempt_id):
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_CONTEXT_CONFLICT
            )

        context = await self._load_context(
            user_id=user_id,
            attempt_id=attempt_id,
            interaction_language=interaction_language,
            payload=None,
            for_update=True,
        )
        training_memory = await self.training_memory_service_factory(
            self.session
        ).get_context(user_id)
        payload = RecommendationRunPayload(
            attempt_id=context.attempt.id,
            evaluation_id=context.evaluation.id,
            review_id=context.review.id,
            interaction_language=context.session.language,
            training_memory=training_memory,
        )
        return await self.agent_run_service_factory(
            self.session
        ).enqueue_in_transaction(
            user_id=user_id,
            agent_id=PracticeRecommendationAgent.agent_id,
            prompt_id=PracticeRecommendationAgent.agent_id,
            prompt_version=PracticeRecommendationAgent.agent_version,
            output_schema_id=PracticeRecommendationAgent.output_schema_id,
            model=self.llm_model,
            payload=payload.model_dump(mode="json", by_alias=True),
            idempotency_key=idempotency_key,
            max_attempts=3,
        )

    async def load_generation_input(
        self,
        run: AgentRun,
    ) -> PracticeRecommendationInput:
        try:
            recommendation_input = await self.load_generation_input_in_transaction(run)
            await self.session.commit()
            return recommendation_input
        except Exception:
            await self.session.rollback()
            raise

    async def load_generation_input_in_transaction(
        self,
        run: AgentRun,
    ) -> PracticeRecommendationInput:
        payload = validate_recommendation_generation_run(run)
        if run.idempotency_key != practice_recommendation_idempotency_key(
            payload.attempt_id
        ):
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_CONTEXT_CONFLICT
            )
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
        output: object,
    ) -> PracticeRecommendationOutput:
        try:
            payload = validate_recommendation_generation_run(run)
            if run.idempotency_key != practice_recommendation_idempotency_key(
                payload.attempt_id
            ):
                raise RecommendationGenerationStateError(
                    PRACTICE_RECOMMENDATION_CONTEXT_CONFLICT
                )
            context = await self._load_context(
                user_id=run.user_id,
                attempt_id=payload.attempt_id,
                interaction_language=payload.interaction_language,
                payload=payload,
                for_update=True,
            )

            existing = await self.session.scalar(
                select(PracticeRecommendation)
                .where(PracticeRecommendation.source_agent_run_id == run.id)
                .with_for_update()
            )
            if existing is None:
                existing = await self.session.scalar(
                    select(PracticeRecommendation)
                    .where(PracticeRecommendation.attempt_id == payload.attempt_id)
                    .with_for_update()
                )
            if existing is not None:
                if (
                    existing.attempt_id != payload.attempt_id
                    or existing.source_agent_run_id != run.id
                ):
                    raise RecommendationGenerationStateError(
                        PRACTICE_RECOMMENDATION_ARTIFACT_CONFLICT
                    )
                canonical = self._canonicalize_artifact(existing, context.input)
                await self.session.commit()
                return canonical

            validated_output = _validate_output(output)
            validate_recommendation_v1_contract(validated_output, context.input)
            now = self.clock()
            _require_aware_datetime(now)

            if isinstance(validated_output, PracticeRetryCurrentRecommendation):
                next_question_type = None
                next_difficulty = None
                focus_areas: list[str] = []
            elif isinstance(
                validated_output,
                PracticeNextQuestionRecommendation,
            ):
                next_question_type = validated_output.next_question.question_type.value
                next_difficulty = validated_output.next_question.difficulty.value
                focus_areas = list(validated_output.next_question.focus_areas)
            else:
                raise RecommendationGenerationStateError(
                    PRACTICE_RECOMMENDATION_ARTIFACT_CONFLICT
                )

            recommendation = PracticeRecommendation(
                id=uuid4(),
                attempt_id=payload.attempt_id,
                source_agent_run_id=run.id,
                action=validated_output.action,
                reason=validated_output.reason,
                next_question_type=next_question_type,
                next_difficulty=next_difficulty,
                focus_areas=focus_areas,
                recommended_at=now,
            )
            canonical = self._canonicalize_artifact(recommendation, context.input)
            self.session.add(recommendation)
            await self.session.commit()
            return canonical
        except Exception:
            await self.session.rollback()
            raise

    async def _load_context(
        self,
        *,
        user_id: UUID,
        attempt_id: UUID,
        interaction_language: InteractionLanguage,
        payload: RecommendationRunPayload | None,
        for_update: bool,
    ) -> _RecommendationContext:
        if interaction_language not in INTERACTION_LANGUAGES:
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_REVIEW_CONTEXT_INVALID
            )
        if payload is not None and payload.attempt_id != attempt_id:
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_CONTEXT_CONFLICT
            )

        attempt_statement = select(PracticeAttempt).where(
            PracticeAttempt.id == attempt_id,
            PracticeAttempt.user_id == user_id,
        )
        attempt = await self._scalar(attempt_statement, for_update=False)
        if attempt is None:
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_ATTEMPT_NOT_FOUND
            )

        session_statement = select(PracticeSession).where(
            PracticeSession.id == attempt.session_id,
            PracticeSession.user_id == user_id,
        )
        practice_session = await self._scalar(
            session_statement,
            for_update=for_update,
        )
        if practice_session is None or practice_session.status != "active":
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_SESSION_NOT_ACTIVE
            )
        if practice_session.language != interaction_language:
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_REVIEW_CONTEXT_INVALID
            )

        if for_update:
            attempt = await self._scalar(attempt_statement, for_update=True)
            if attempt is None:
                raise RecommendationGenerationStateError(
                    PRACTICE_RECOMMENDATION_ATTEMPT_NOT_FOUND
                )
        if attempt.status != "evaluating":
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_CONTEXT_CONFLICT
            )

        if payload is None:
            review_statement = select(PracticeReview).where(
                PracticeReview.attempt_id == attempt.id
            )
        else:
            review_statement = select(PracticeReview).where(
                PracticeReview.id == payload.review_id
            )
        review = await self._scalar(review_statement, for_update=for_update)
        if review is None:
            if payload is None:
                raise RecommendationGenerationStateError(
                    PRACTICE_RECOMMENDATION_REVIEW_NOT_READY
                )
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_CONTEXT_CONFLICT
            )
        if review.attempt_id != attempt.id:
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_CONTEXT_CONFLICT
            )

        review_run = await self._scalar(
            select(AgentRun).where(AgentRun.id == review.source_agent_run_id),
            for_update=for_update,
        )
        if review_run is None or review_run.status is not AgentRunStatus.SUCCEEDED:
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_REVIEW_NOT_READY
            )

        try:
            review_payload = validate_review_generation_run(review_run)
        except ReviewGenerationStateError:
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_REVIEW_CONTEXT_INVALID
            ) from None

        if (
            review_run.user_id != user_id
            or review_run.idempotency_key != practice_review_idempotency_key(attempt.id)
            or review_payload.attempt_id != attempt.id
            or review_payload.interaction_language != practice_session.language
            or review.source_agent_run_id != review_run.id
        ):
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_REVIEW_CONTEXT_INVALID
            )

        if payload is not None and (
            payload.review_id != review.id
            or payload.evaluation_id != review_payload.evaluation_id
            or payload.interaction_language != practice_session.language
        ):
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_REVIEW_CONTEXT_INVALID
            )

        evaluation = await self._scalar(
            select(PracticeEvaluation).where(
                PracticeEvaluation.id == review_payload.evaluation_id
            ),
            for_update=for_update,
        )
        if evaluation is None or evaluation.attempt_id != attempt.id:
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_REVIEW_CONTEXT_INVALID
            )

        try:
            review_input = await ReviewGenerationService(
                self.session
            ).load_generation_input_in_transaction(review_run)
        except (
            ReviewGenerationStateError,
            TypeError,
            ValueError,
            ValidationError,
        ):
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_REVIEW_CONTEXT_INVALID
            ) from None

        if review_input.interaction_language != practice_session.language:
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_REVIEW_CONTEXT_INVALID
            )

        try:
            canonical_review = practice_review_output_from_artifact(review)
            recommendation_input = PracticeRecommendationInput(
                interaction_language=review_input.interaction_language,
                question=PracticeRecommendationQuestionContext.model_validate(
                    review_input.question.model_dump()
                ),
                follow_up_completion_reason=(review_input.follow_up_completion_reason),
                evaluation=review_input.evaluation,
                review=canonical_review,
                training_memory=(
                    payload.training_memory
                    if payload is not None
                    else TrainingMemoryContext()
                ),
            )
        except TypeError, ValueError, ValidationError:
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_REVIEW_CONTEXT_INVALID
            ) from None

        return _RecommendationContext(
            attempt=attempt,
            session=practice_session,
            evaluation=evaluation,
            review=review,
            review_run=review_run,
            review_input=review_input,
            input=recommendation_input,
        )

    async def _scalar(self, statement, *, for_update: bool):
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    def _canonicalize_artifact(
        self,
        recommendation: PracticeRecommendation,
        input: PracticeRecommendationInput,
    ) -> PracticeRecommendationOutput:
        try:
            canonical = practice_recommendation_output_from_artifact(recommendation)
        except ValueError:
            raise RecommendationGenerationStateError(
                PRACTICE_RECOMMENDATION_ARTIFACT_CONFLICT
            ) from None
        validate_recommendation_v1_contract(canonical, input)
        return canonical

    def _require_configuration(self) -> None:
        if not self.llm_model:
            raise ValueError("llm_model must not be empty")


def _validate_output(
    output: object,
) -> PracticeRetryCurrentRecommendation | PracticeNextQuestionRecommendation:
    try:
        validated = TypeAdapter(PracticeRecommendationOutput).validate_python(output)
    except TypeError, ValueError, ValidationError:
        raise RecommendationGenerationStateError(
            PRACTICE_RECOMMENDATION_ARTIFACT_CONFLICT
        ) from None
    if not isinstance(
        validated,
        (PracticeRetryCurrentRecommendation, PracticeNextQuestionRecommendation),
    ):
        raise RecommendationGenerationStateError(
            PRACTICE_RECOMMENDATION_ARTIFACT_CONFLICT
        )
    return validated


def validate_recommendation_v1_contract(
    output: PracticeRetryCurrentRecommendation | PracticeNextQuestionRecommendation,
    input: PracticeRecommendationInput,
) -> None:
    """Validate the frozen V1 recommendation contract without database access."""

    if isinstance(output, PracticeRetryCurrentRecommendation):
        return
    if not isinstance(output, PracticeNextQuestionRecommendation):
        raise RecommendationGenerationStateError(
            PRACTICE_RECOMMENDATION_ARTIFACT_CONFLICT
        )

    plan = output.next_question
    if (
        plan.question_type != input.question.question_type
        or plan.difficulty != input.question.difficulty
        or not set(plan.focus_areas).issubset(set(input.review.exposed_weaknesses))
    ):
        raise RecommendationGenerationStateError(
            PRACTICE_RECOMMENDATION_ARTIFACT_CONFLICT
        )


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")


__all__ = [
    "INVALID_PRACTICE_RECOMMENDATION_RUN",
    "PRACTICE_RECOMMENDATION_ARTIFACT_CONFLICT",
    "PRACTICE_RECOMMENDATION_ATTEMPT_NOT_FOUND",
    "PRACTICE_RECOMMENDATION_CONTEXT_CONFLICT",
    "PRACTICE_RECOMMENDATION_REVIEW_CONTEXT_INVALID",
    "PRACTICE_RECOMMENDATION_REVIEW_NOT_READY",
    "PRACTICE_RECOMMENDATION_SESSION_NOT_ACTIVE",
    "RecommendationGenerationService",
    "RecommendationGenerationStateError",
    "RecommendationGenerationStateErrorCode",
    "practice_recommendation_idempotency_key",
    "practice_recommendation_output_from_artifact",
    "validate_recommendation_v1_contract",
    "validate_recommendation_generation_run",
]
