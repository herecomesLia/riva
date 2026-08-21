from __future__ import annotations

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, cast
from uuid import UUID, uuid4

from pydantic import BaseModel, TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.base import Agent, AgentResult
from riva.agents.runtime.runs import AgentRunService
from riva.core.language import INTERACTION_LANGUAGES, InteractionLanguage
from riva.integrations import (
    GenerationParameters,
    InvalidStructuredOutputError,
    LLMProvider,
    StructuredOutputDiagnostics,
    StructuredOutputValidationError,
)
from riva.models import (
    AgentRun,
    PracticeAnswer,
    PracticeAttempt,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeSession,
    QuestionCard,
)
from riva.prompts import FOLLOW_UP_PROMPT
from riva.schemas.follow_up import (
    FollowUpCompleteOutput,
    FollowUpGenerationOutput,
    FollowUpInput,
    FollowUpPreviousExchange,
    FollowUpQuestionContext,
    FollowUpQuestionOutput,
    FollowUpRunPayload,
)
from riva.schemas.practice_interactions import (
    MAX_PRACTICE_FOLLOW_UPS,
    PracticeAnswerContent,
    PracticeAnswerKind,
    PracticeAnswerSnapshot,
)
from riva.utils import utc_now


def _stable_json(value: BaseModel | Sequence[BaseModel]) -> str:
    if isinstance(value, BaseModel):
        serializable: object = value.model_dump(mode="json")
    else:
        serializable = [item.model_dump(mode="json") for item in value]
    return json.dumps(
        serializable,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _normalized_prompt(value: str) -> str:
    return " ".join(value.split()).casefold()


def _duplicate_prompt_error() -> InvalidStructuredOutputError:
    diagnostics = StructuredOutputDiagnostics(
        stage="schema_validation",
        output_schema="FollowUpGenerationOutput",
        validation_errors=(
            StructuredOutputValidationError(
                location="prompt",
                type="duplicate_follow_up_prompt",
            ),
        ),
    )
    return InvalidStructuredOutputError(diagnostics)


class FollowUpAgent(Agent[FollowUpInput, FollowUpGenerationOutput]):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=FOLLOW_UP_PROMPT,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "follow-up-generator"

    def prompt_values(self, input: FollowUpInput) -> Mapping[str, object]:
        return {
            "interaction_language": input.interaction_language,
            "question": _stable_json(input.question),
            "main_answer": _stable_json(input.main_answer),
            "previous_follow_ups": _stable_json(input.previous_follow_ups),
            "next_follow_up_order": input.next_follow_up_order,
        }

    async def run(self, input: FollowUpInput) -> AgentResult[FollowUpGenerationOutput]:
        result = await super().run(input)
        output = result.output
        if isinstance(output, FollowUpQuestionOutput):
            generated_prompt = _normalized_prompt(output.prompt)
            existing_prompts = {
                _normalized_prompt(input.question.prompt),
                *(
                    _normalized_prompt(exchange.prompt)
                    for exchange in input.previous_follow_ups
                ),
            }
            if generated_prompt in existing_prompts:
                raise _duplicate_prompt_error()
        return result


FollowUpGenerationStateErrorCode = Literal[
    "invalid_follow_up_generation_run",
    "follow_up_attempt_not_found",
    "follow_up_session_not_active",
    "follow_up_question_card_not_ready",
    "follow_up_main_answer_not_ready",
    "follow_up_previous_exchange_not_ready",
    "follow_up_generation_order_conflict",
    "follow_up_generation_context_conflict",
]

INVALID_FOLLOW_UP_GENERATION_RUN: FollowUpGenerationStateErrorCode = (
    "invalid_follow_up_generation_run"
)
FOLLOW_UP_ATTEMPT_NOT_FOUND: FollowUpGenerationStateErrorCode = (
    "follow_up_attempt_not_found"
)
FOLLOW_UP_SESSION_NOT_ACTIVE: FollowUpGenerationStateErrorCode = (
    "follow_up_session_not_active"
)
FOLLOW_UP_QUESTION_CARD_NOT_READY: FollowUpGenerationStateErrorCode = (
    "follow_up_question_card_not_ready"
)
FOLLOW_UP_MAIN_ANSWER_NOT_READY: FollowUpGenerationStateErrorCode = (
    "follow_up_main_answer_not_ready"
)
FOLLOW_UP_PREVIOUS_EXCHANGE_NOT_READY: FollowUpGenerationStateErrorCode = (
    "follow_up_previous_exchange_not_ready"
)
FOLLOW_UP_GENERATION_ORDER_CONFLICT: FollowUpGenerationStateErrorCode = (
    "follow_up_generation_order_conflict"
)
FOLLOW_UP_GENERATION_CONTEXT_CONFLICT: FollowUpGenerationStateErrorCode = (
    "follow_up_generation_context_conflict"
)


class FollowUpGenerationStateError(RuntimeError):
    safe_message = "The follow-up generation state is invalid."

    def __init__(self, code: FollowUpGenerationStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


def practice_follow_up_idempotency_key(
    attempt_id: UUID,
    order: int,
) -> str:
    if (
        isinstance(order, bool)
        or not isinstance(order, int)
        or not 1 <= order <= MAX_PRACTICE_FOLLOW_UPS
    ):
        raise ValueError("follow-up order must be a supported integer order")
    return f"practice-attempt:{attempt_id}:follow-up:{order}"


@dataclass(frozen=True)
class _FollowUpContext:
    attempt: PracticeAttempt
    session: PracticeSession
    question_card: QuestionCard
    main_answer: PracticeAnswer
    previous_question: PracticeFollowUpQuestion | None
    previous_answer: PracticeAnswer | None
    input: FollowUpInput


def validate_follow_up_generation_run(
    run: AgentRun,
) -> FollowUpRunPayload:
    """Validate the immutable contract shared by follow-up consumers."""

    prompt = FOLLOW_UP_PROMPT
    if (
        run.agent_id != "follow-up-generator"
        or run.prompt_id != prompt.prompt_id
        or run.prompt_version != prompt.version
        or run.output_schema_id != prompt.output_schema_id
    ):
        raise FollowUpGenerationStateError(INVALID_FOLLOW_UP_GENERATION_RUN)
    try:
        return FollowUpRunPayload.model_validate(run.payload)
    except TypeError, ValidationError:
        raise FollowUpGenerationStateError(INVALID_FOLLOW_UP_GENERATION_RUN) from None


def follow_up_output_from_persistence(
    decision: PracticeFollowUpDecision,
    question: PracticeFollowUpQuestion | None = None,
) -> FollowUpGenerationOutput:
    """Project the durable canonical artifact back through its output schema."""

    if decision.action == "complete":
        if decision.follow_up_question_id is not None or question is not None:
            raise ValueError("complete decision must not have a question")
        return cast(
            FollowUpGenerationOutput,
            FollowUpCompleteOutput.model_validate({"action": "complete"}),
        )

    if decision.action != "askFollowUp":
        raise ValueError("decision action is invalid")
    if decision.follow_up_question_id is None or question is None:
        raise ValueError("ask decision must have a question")
    if question.id != decision.follow_up_question_id:
        raise ValueError("decision question lineage is invalid")
    return cast(
        FollowUpGenerationOutput,
        FollowUpQuestionOutput.model_validate(
            {
                "action": "askFollowUp",
                "prompt": question.prompt,
                "focus": question.focus,
                "answer_hints": question.answer_hints,
                "answer_framework": question.answer_framework,
            }
        ),
    )


class FollowUpGenerationService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_model: str | None = None,
        agent_run_service_factory: Callable[[AsyncSession], AgentRunService] = (
            AgentRunService
        ),
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.session = session
        self.llm_model = (llm_model or "").strip()
        self.agent_run_service_factory = agent_run_service_factory
        self.clock = clock

    async def enqueue_generation(
        self,
        *,
        user_id: UUID,
        attempt_id: UUID,
        next_follow_up_order: int,
        idempotency_key: str,
        interaction_language: InteractionLanguage,
    ) -> AgentRun:
        try:
            run = await self.enqueue_generation_in_transaction(
                user_id=user_id,
                attempt_id=attempt_id,
                next_follow_up_order=next_follow_up_order,
                idempotency_key=idempotency_key,
                interaction_language=interaction_language,
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
        next_follow_up_order: int,
        idempotency_key: str,
        interaction_language: InteractionLanguage,
    ) -> AgentRun:
        self._require_configuration()
        context = await self._load_context(
            user_id=user_id,
            attempt_id=attempt_id,
            next_follow_up_order=next_follow_up_order,
            interaction_language=interaction_language,
            for_update=True,
        )
        payload = _payload_from_context(context)
        return await self.agent_run_service_factory(
            self.session
        ).enqueue_in_transaction(
            user_id=user_id,
            agent_id="follow-up-generator",
            prompt_id=FOLLOW_UP_PROMPT.prompt_id,
            prompt_version=FOLLOW_UP_PROMPT.version,
            output_schema_id=FOLLOW_UP_PROMPT.output_schema_id,
            model=self.llm_model,
            payload=payload.model_dump(mode="json", by_alias=True),
            idempotency_key=idempotency_key,
            max_attempts=3,
        )

    async def load_generation_input(
        self,
        run: AgentRun,
    ) -> FollowUpInput:
        try:
            payload = validate_follow_up_generation_run(run)
            context = await self._load_context(
                user_id=run.user_id,
                attempt_id=payload.attempt_id,
                next_follow_up_order=payload.next_follow_up_order,
                interaction_language=payload.interaction_language,
                for_update=False,
            )
            _validate_frozen_context(context, payload)
            await self.session.commit()
            return context.input
        except Exception:
            await self.session.rollback()
            raise

    async def persist_success(
        self,
        run: AgentRun,
        output: FollowUpGenerationOutput,
    ) -> FollowUpGenerationOutput:
        try:
            payload = validate_follow_up_generation_run(run)
            context = await self._load_context(
                user_id=run.user_id,
                attempt_id=payload.attempt_id,
                next_follow_up_order=payload.next_follow_up_order,
                interaction_language=payload.interaction_language,
                for_update=True,
            )
            _validate_frozen_context(context, payload)
            validated_output = _validate_output(output)

            decision = await self.session.scalar(
                select(PracticeFollowUpDecision)
                .where(PracticeFollowUpDecision.source_agent_run_id == run.id)
                .with_for_update()
            )
            if decision is not None:
                question = await self._canonical_question_for_decision(
                    decision,
                    run=run,
                    payload=payload,
                )
                try:
                    canonical = follow_up_output_from_persistence(
                        decision,
                        question,
                    )
                except TypeError, ValueError, ValidationError:
                    raise FollowUpGenerationStateError(
                        INVALID_FOLLOW_UP_GENERATION_RUN
                    ) from None
                await self.session.commit()
                return canonical

            now = self.clock()
            _require_aware_datetime(now)
            if isinstance(validated_output, FollowUpCompleteOutput):
                decision = PracticeFollowUpDecision(
                    id=uuid4(),
                    attempt_id=payload.attempt_id,
                    source_agent_run_id=run.id,
                    order=payload.next_follow_up_order,
                    action="complete",
                    follow_up_question_id=None,
                    created_at=now,
                )
                self.session.add(decision)
                await self.session.commit()
                try:
                    return follow_up_output_from_persistence(decision)
                except TypeError, ValueError, ValidationError:
                    raise FollowUpGenerationStateError(
                        INVALID_FOLLOW_UP_GENERATION_RUN
                    ) from None

            question = PracticeFollowUpQuestion(
                id=uuid4(),
                attempt_id=payload.attempt_id,
                source_agent_run_id=run.id,
                order=payload.next_follow_up_order,
                prompt=validated_output.prompt,
                focus=validated_output.focus,
                answer_hints=validated_output.answer_hints,
                answer_framework=validated_output.answer_framework,
                answer_hints_revealed=False,
                answer_framework_revealed=False,
                created_at=now,
            )
            decision = PracticeFollowUpDecision(
                id=uuid4(),
                attempt_id=payload.attempt_id,
                source_agent_run_id=run.id,
                order=payload.next_follow_up_order,
                action="askFollowUp",
                follow_up_question_id=question.id,
                created_at=now,
            )
            self.session.add(question)
            self.session.add(decision)
            await self.session.commit()
            try:
                return follow_up_output_from_persistence(decision, question)
            except TypeError, ValueError, ValidationError:
                raise FollowUpGenerationStateError(
                    INVALID_FOLLOW_UP_GENERATION_RUN
                ) from None
        except Exception:
            await self.session.rollback()
            raise

    async def _load_context(
        self,
        *,
        user_id: UUID,
        attempt_id: UUID,
        next_follow_up_order: int,
        interaction_language: InteractionLanguage,
        for_update: bool,
    ) -> _FollowUpContext:
        if (
            isinstance(next_follow_up_order, bool)
            or not isinstance(next_follow_up_order, int)
            or not 1 <= next_follow_up_order <= MAX_PRACTICE_FOLLOW_UPS
        ):
            raise FollowUpGenerationStateError(FOLLOW_UP_GENERATION_ORDER_CONFLICT)
        if interaction_language not in INTERACTION_LANGUAGES:
            raise FollowUpGenerationStateError(FOLLOW_UP_GENERATION_CONTEXT_CONFLICT)

        attempt_statement = select(PracticeAttempt).where(
            PracticeAttempt.id == attempt_id,
            PracticeAttempt.user_id == user_id,
        )
        attempt = await self.session.scalar(attempt_statement)
        if attempt is None:
            raise FollowUpGenerationStateError(FOLLOW_UP_ATTEMPT_NOT_FOUND)

        session_statement = select(PracticeSession).where(
            PracticeSession.id == attempt.session_id,
            PracticeSession.user_id == user_id,
        )
        if for_update:
            session_statement = session_statement.with_for_update()
        practice_session = await self.session.scalar(session_statement)
        if practice_session is None or practice_session.status != "active":
            raise FollowUpGenerationStateError(FOLLOW_UP_SESSION_NOT_ACTIVE)
        if practice_session.language != interaction_language:
            raise FollowUpGenerationStateError(FOLLOW_UP_GENERATION_CONTEXT_CONFLICT)

        if for_update:
            attempt_statement = (
                select(PracticeAttempt)
                .where(
                    PracticeAttempt.id == attempt.id,
                    PracticeAttempt.user_id == user_id,
                )
                .with_for_update()
            )
            attempt = await self.session.scalar(attempt_statement)
            if attempt is None:
                raise FollowUpGenerationStateError(FOLLOW_UP_ATTEMPT_NOT_FOUND)

        if attempt.question_card_id is None:
            raise FollowUpGenerationStateError(FOLLOW_UP_QUESTION_CARD_NOT_READY)
        card_statement = select(QuestionCard).where(
            QuestionCard.id == attempt.question_card_id,
        )
        if for_update:
            card_statement = card_statement.with_for_update()
        question_card = await self.session.scalar(card_statement)
        if question_card is None or not _question_card_matches(
            question_card,
            attempt=attempt,
            practice_session=practice_session,
        ):
            raise FollowUpGenerationStateError(FOLLOW_UP_QUESTION_CARD_NOT_READY)
        question_context = _question_context_from_card(question_card)

        main_answer_statement = select(PracticeAnswer).where(
            PracticeAnswer.attempt_id == attempt.id,
            PracticeAnswer.kind == PracticeAnswerKind.MAIN.value,
            PracticeAnswer.order == 1,
            PracticeAnswer.follow_up_question_id.is_(None),
        )
        if for_update:
            main_answer_statement = main_answer_statement.with_for_update()
        main_answer = await self.session.scalar(main_answer_statement)
        if main_answer is None:
            raise FollowUpGenerationStateError(FOLLOW_UP_MAIN_ANSWER_NOT_READY)
        main_snapshot = _main_answer_snapshot(main_answer)

        previous_question: PracticeFollowUpQuestion | None = None
        previous_answer: PracticeAnswer | None = None
        previous_exchanges: list[FollowUpPreviousExchange] = []
        if next_follow_up_order == 1:
            previous_question_statement = select(PracticeFollowUpQuestion).where(
                PracticeFollowUpQuestion.attempt_id == attempt.id,
                PracticeFollowUpQuestion.order == 1,
            )
            if for_update:
                previous_question_statement = (
                    previous_question_statement.with_for_update()
                )
            previous_question = await self.session.scalar(previous_question_statement)
            if previous_question is not None:
                answer_statement = select(PracticeAnswer).where(
                    PracticeAnswer.follow_up_question_id == previous_question.id
                )
                if for_update:
                    answer_statement = answer_statement.with_for_update()
                answered_question = await self.session.scalar(answer_statement)
                if answered_question is not None:
                    raise FollowUpGenerationStateError(
                        FOLLOW_UP_PREVIOUS_EXCHANGE_NOT_READY
                    )
                previous_question = None
        else:
            previous_question_statement = select(PracticeFollowUpQuestion).where(
                PracticeFollowUpQuestion.attempt_id == attempt.id,
                PracticeFollowUpQuestion.order == 1,
            )
            if for_update:
                previous_question_statement = (
                    previous_question_statement.with_for_update()
                )
            previous_question = await self.session.scalar(previous_question_statement)
            if previous_question is None:
                raise FollowUpGenerationStateError(
                    FOLLOW_UP_PREVIOUS_EXCHANGE_NOT_READY
                )
            answer_statement = select(PracticeAnswer).where(
                PracticeAnswer.attempt_id == attempt.id,
                PracticeAnswer.kind == PracticeAnswerKind.FOLLOW_UP.value,
                PracticeAnswer.order == 2,
                PracticeAnswer.follow_up_question_id == previous_question.id,
            )
            if for_update:
                answer_statement = answer_statement.with_for_update()
            previous_answer = await self.session.scalar(answer_statement)
            if previous_answer is None:
                raise FollowUpGenerationStateError(
                    FOLLOW_UP_PREVIOUS_EXCHANGE_NOT_READY
                )
            previous_content = _answer_content(
                previous_answer,
                FOLLOW_UP_PREVIOUS_EXCHANGE_NOT_READY,
            )
            try:
                previous_exchanges.append(
                    FollowUpPreviousExchange(
                        order=1,
                        prompt=previous_question.prompt,
                        answer=previous_content,
                    )
                )
            except TypeError, ValueError, ValidationError:
                raise FollowUpGenerationStateError(
                    FOLLOW_UP_PREVIOUS_EXCHANGE_NOT_READY
                ) from None

        try:
            follow_up_input = FollowUpInput(
                interaction_language=interaction_language,
                question=question_context,
                main_answer=main_snapshot,
                previous_follow_ups=previous_exchanges,
                next_follow_up_order=next_follow_up_order,
            )
        except TypeError, ValueError, ValidationError:
            raise FollowUpGenerationStateError(
                FOLLOW_UP_GENERATION_CONTEXT_CONFLICT
            ) from None
        return _FollowUpContext(
            attempt=attempt,
            session=practice_session,
            question_card=question_card,
            main_answer=main_answer,
            previous_question=previous_question,
            previous_answer=previous_answer,
            input=follow_up_input,
        )

    async def _canonical_question_for_decision(
        self,
        decision: PracticeFollowUpDecision,
        *,
        run: AgentRun,
        payload: FollowUpRunPayload,
    ) -> PracticeFollowUpQuestion | None:
        if (
            decision.attempt_id != payload.attempt_id
            or decision.order != payload.next_follow_up_order
            or decision.source_agent_run_id != run.id
        ):
            raise FollowUpGenerationStateError(INVALID_FOLLOW_UP_GENERATION_RUN)
        if decision.action == "complete":
            if decision.follow_up_question_id is not None:
                raise FollowUpGenerationStateError(INVALID_FOLLOW_UP_GENERATION_RUN)
            return None
        if decision.action != "askFollowUp" or decision.follow_up_question_id is None:
            raise FollowUpGenerationStateError(INVALID_FOLLOW_UP_GENERATION_RUN)
        question = await self.session.scalar(
            select(PracticeFollowUpQuestion)
            .where(PracticeFollowUpQuestion.id == decision.follow_up_question_id)
            .with_for_update()
        )
        if question is None or not (
            question.attempt_id == payload.attempt_id
            and question.source_agent_run_id == run.id
            and question.order == payload.next_follow_up_order
        ):
            raise FollowUpGenerationStateError(INVALID_FOLLOW_UP_GENERATION_RUN)
        return question

    def _require_configuration(self) -> None:
        if not self.llm_model:
            raise ValueError("llm_model must not be empty")


def _payload_from_context(context: _FollowUpContext) -> FollowUpRunPayload:
    return FollowUpRunPayload(
        attempt_id=context.attempt.id,
        question_card_id=context.question_card.id,
        main_answer_id=context.main_answer.id,
        interaction_language=context.session.language,
        next_follow_up_order=context.input.next_follow_up_order,
        previous_follow_up_question_id=(
            context.previous_question.id
            if context.previous_question is not None
            else None
        ),
        previous_follow_up_answer_id=(
            context.previous_answer.id if context.previous_answer is not None else None
        ),
    )


def _validate_frozen_context(
    context: _FollowUpContext,
    payload: FollowUpRunPayload,
) -> None:
    if context.attempt.id != payload.attempt_id:
        raise FollowUpGenerationStateError(FOLLOW_UP_GENERATION_CONTEXT_CONFLICT)
    if context.question_card.id != payload.question_card_id:
        raise FollowUpGenerationStateError(FOLLOW_UP_QUESTION_CARD_NOT_READY)
    if context.main_answer.id != payload.main_answer_id:
        raise FollowUpGenerationStateError(FOLLOW_UP_MAIN_ANSWER_NOT_READY)
    actual_question_id = (
        context.previous_question.id if context.previous_question is not None else None
    )
    actual_answer_id = (
        context.previous_answer.id if context.previous_answer is not None else None
    )
    if (
        actual_question_id != payload.previous_follow_up_question_id
        or actual_answer_id != payload.previous_follow_up_answer_id
    ):
        raise FollowUpGenerationStateError(FOLLOW_UP_PREVIOUS_EXCHANGE_NOT_READY)


def _question_card_matches(
    question_card: QuestionCard,
    *,
    attempt: PracticeAttempt,
    practice_session: PracticeSession,
) -> bool:
    return (
        question_card.user_id == attempt.user_id
        and question_card.target_role_id == practice_session.target_role_id
        and question_card.language == practice_session.language
        and question_card.question_type == attempt.question_type
        and question_card.difficulty == attempt.difficulty
    )


def _question_context_from_card(
    question_card: QuestionCard,
) -> FollowUpQuestionContext:
    try:
        return FollowUpQuestionContext.model_validate(
            {
                "prompt": question_card.prompt,
                "question_type": question_card.question_type,
                "difficulty": question_card.difficulty,
                "assessed_capabilities": question_card.assessed_capabilities,
                "follow_up_directions": question_card.follow_up_directions,
                "scoring_focus": question_card.scoring_focus,
            }
        )
    except TypeError, ValueError, ValidationError:
        raise FollowUpGenerationStateError(FOLLOW_UP_QUESTION_CARD_NOT_READY) from None


def _main_answer_snapshot(answer: PracticeAnswer) -> PracticeAnswerSnapshot:
    content = _answer_content(answer, FOLLOW_UP_MAIN_ANSWER_NOT_READY)
    try:
        return PracticeAnswerSnapshot(content=content, order=1)
    except TypeError, ValueError, ValidationError:
        raise FollowUpGenerationStateError(FOLLOW_UP_MAIN_ANSWER_NOT_READY) from None


def _answer_content(
    answer: PracticeAnswer,
    error_code: FollowUpGenerationStateErrorCode,
) -> str:
    try:
        return cast(
            str,
            TypeAdapter(PracticeAnswerContent).validate_python(answer.content),
        )
    except TypeError, ValueError, ValidationError:
        raise FollowUpGenerationStateError(error_code) from None


def _validate_output(
    output: object,
) -> FollowUpCompleteOutput | FollowUpQuestionOutput:
    try:
        validated = TypeAdapter(FollowUpGenerationOutput).validate_python(output)
    except TypeError, ValueError, ValidationError:
        raise FollowUpGenerationStateError(INVALID_FOLLOW_UP_GENERATION_RUN) from None
    if isinstance(validated, (FollowUpCompleteOutput, FollowUpQuestionOutput)):
        return validated
    raise FollowUpGenerationStateError(INVALID_FOLLOW_UP_GENERATION_RUN)


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")


__all__ = [
    "FOLLOW_UP_ATTEMPT_NOT_FOUND",
    "FOLLOW_UP_GENERATION_CONTEXT_CONFLICT",
    "FOLLOW_UP_GENERATION_ORDER_CONFLICT",
    "FOLLOW_UP_MAIN_ANSWER_NOT_READY",
    "FOLLOW_UP_PREVIOUS_EXCHANGE_NOT_READY",
    "FOLLOW_UP_QUESTION_CARD_NOT_READY",
    "FOLLOW_UP_SESSION_NOT_ACTIVE",
    "INVALID_FOLLOW_UP_GENERATION_RUN",
    "FollowUpAgent",
    "FollowUpGenerationService",
    "FollowUpGenerationStateError",
    "FollowUpGenerationStateErrorCode",
    "follow_up_output_from_persistence",
    "practice_follow_up_idempotency_key",
    "validate_follow_up_generation_run",
]
