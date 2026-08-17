from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, cast
from uuid import UUID, uuid4

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from riva.core.language import INTERACTION_LANGUAGES, InteractionLanguage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAnswer,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeSession,
    QuestionCard,
)
from riva.prompts import PRACTICE_EVALUATION_PROMPT
from riva.schemas.evaluation import (
    EvaluationFollowUpExchange,
    EvaluationInput,
    EvaluationMainAnswer,
    EvaluationQuestionContext,
    EvaluationRunPayload,
    PracticeEvaluationFollowUpCompletionReason,
    PracticeEvaluationOutput,
)
from riva.schemas.follow_up import FollowUpRunPayload
from riva.schemas.practice_interactions import (
    MAX_PRACTICE_FOLLOW_UPS,
    PracticeAnswerContent,
    PracticeAnswerKind,
)
from riva.services.agent_runs import AgentRunService
from riva.services.competency_ingestion import CompetencyIngestionService
from riva.services.follow_up_generation import (
    FollowUpGenerationStateError,
    practice_follow_up_idempotency_key,
    validate_follow_up_generation_run,
)
from riva.utils import utc_now


EvaluationGenerationStateErrorCode = Literal[
    "invalid_practice_evaluation_run",
    "practice_evaluation_attempt_not_found",
    "practice_evaluation_session_not_active",
    "practice_evaluation_question_not_ready",
    "practice_evaluation_main_answer_not_ready",
    "practice_evaluation_follow_up_context_invalid",
    "practice_evaluation_completion_conflict",
    "practice_evaluation_context_conflict",
    "practice_evaluation_artifact_conflict",
]

INVALID_PRACTICE_EVALUATION_RUN: EvaluationGenerationStateErrorCode = (
    "invalid_practice_evaluation_run"
)
PRACTICE_EVALUATION_ATTEMPT_NOT_FOUND: EvaluationGenerationStateErrorCode = (
    "practice_evaluation_attempt_not_found"
)
PRACTICE_EVALUATION_SESSION_NOT_ACTIVE: EvaluationGenerationStateErrorCode = (
    "practice_evaluation_session_not_active"
)
PRACTICE_EVALUATION_QUESTION_NOT_READY: EvaluationGenerationStateErrorCode = (
    "practice_evaluation_question_not_ready"
)
PRACTICE_EVALUATION_MAIN_ANSWER_NOT_READY: EvaluationGenerationStateErrorCode = (
    "practice_evaluation_main_answer_not_ready"
)
PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID: EvaluationGenerationStateErrorCode = (
    "practice_evaluation_follow_up_context_invalid"
)
PRACTICE_EVALUATION_COMPLETION_CONFLICT: EvaluationGenerationStateErrorCode = (
    "practice_evaluation_completion_conflict"
)
PRACTICE_EVALUATION_CONTEXT_CONFLICT: EvaluationGenerationStateErrorCode = (
    "practice_evaluation_context_conflict"
)
PRACTICE_EVALUATION_ARTIFACT_CONFLICT: EvaluationGenerationStateErrorCode = (
    "practice_evaluation_artifact_conflict"
)


class EvaluationGenerationStateError(RuntimeError):
    safe_message = "The practice evaluation generation state is invalid."

    def __init__(self, code: EvaluationGenerationStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


@dataclass(frozen=True)
class _EvaluationContext:
    attempt: PracticeAttempt
    session: PracticeSession
    question_card: QuestionCard
    main_answer: PracticeAnswer
    terminal_decision: PracticeFollowUpDecision
    follow_up_exchanges: tuple[
        tuple[PracticeFollowUpQuestion, PracticeAnswer], ...
    ]
    unanswered_follow_up_question: PracticeFollowUpQuestion | None
    input: EvaluationInput


@dataclass(frozen=True)
class _ValidatedFollowUpSource:
    run: AgentRun
    payload: FollowUpRunPayload


@dataclass(frozen=True)
class _ValidatedEvaluationFollowUpSnapshot:
    terminal_decision: PracticeFollowUpDecision
    completed_exchanges: tuple[
        tuple[PracticeFollowUpQuestion, PracticeAnswer], ...
    ]
    unanswered_question: PracticeFollowUpQuestion | None
    completion_reason: PracticeEvaluationFollowUpCompletionReason


def practice_evaluation_idempotency_key(attempt_id: UUID) -> str:
    return f"practice-attempt:{attempt_id}:evaluation"


def validate_evaluation_generation_run(
    run: AgentRun,
) -> EvaluationRunPayload:
    """Validate the immutable contract shared by evaluation consumers."""

    prompt = PRACTICE_EVALUATION_PROMPT
    if (
        run.agent_id != "practice-evaluator"
        or run.prompt_id != prompt.prompt_id
        or run.prompt_version != prompt.version
        or run.output_schema_id != prompt.output_schema_id
    ):
        raise EvaluationGenerationStateError(INVALID_PRACTICE_EVALUATION_RUN)
    try:
        return EvaluationRunPayload.model_validate(run.payload)
    except (TypeError, ValidationError):
        raise EvaluationGenerationStateError(
            INVALID_PRACTICE_EVALUATION_RUN
        ) from None


def practice_evaluation_output_from_artifact(
    evaluation: PracticeEvaluation,
    *,
    scoring_focus_count: int | None = None,
) -> PracticeEvaluationOutput:
    """Project a persisted evaluation back through its output schema."""

    try:
        output = PracticeEvaluationOutput.model_validate(
            {
                "overall_score": evaluation.overall_score,
                "dimension_scores": evaluation.dimension_scores,
                "focus_assessments": evaluation.focus_assessments,
            }
        )
    except (TypeError, ValueError, ValidationError):
        raise ValueError("persisted practice evaluation is malformed") from None

    if scoring_focus_count is not None:
        if (
            isinstance(scoring_focus_count, bool)
            or not isinstance(scoring_focus_count, int)
            or scoring_focus_count < 0
        ):
            raise ValueError("scoring_focus_count must be a non-negative integer")
        actual_indices = [
            assessment.focus_index for assessment in output.focus_assessments
        ]
        if actual_indices != list(range(scoring_focus_count)):
            raise ValueError("persisted practice evaluation focus indices are invalid")
    return output


class EvaluationGenerationService:
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
        follow_up_completion_reason: PracticeEvaluationFollowUpCompletionReason,
        idempotency_key: str,
    ) -> AgentRun:
        try:
            run = await self.enqueue_generation_in_transaction(
                user_id=user_id,
                attempt_id=attempt_id,
                interaction_language=interaction_language,
                follow_up_completion_reason=follow_up_completion_reason,
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
        follow_up_completion_reason: PracticeEvaluationFollowUpCompletionReason,
        idempotency_key: str,
    ) -> AgentRun:
        self._require_configuration()
        context = await self._load_context(
            user_id=user_id,
            attempt_id=attempt_id,
            interaction_language=interaction_language,
            follow_up_completion_reason=follow_up_completion_reason,
            payload=None,
            for_update=True,
        )
        payload = _payload_from_context(context)
        return await self.agent_run_service_factory(
            self.session
        ).enqueue_in_transaction(
            user_id=user_id,
            agent_id="practice-evaluator",
            prompt_id=PRACTICE_EVALUATION_PROMPT.prompt_id,
            prompt_version=PRACTICE_EVALUATION_PROMPT.version,
            output_schema_id=PRACTICE_EVALUATION_PROMPT.output_schema_id,
            model=self.llm_model,
            payload=payload.model_dump(
                mode="json",
                by_alias=True,
                exclude_none=True,
            ),
            idempotency_key=idempotency_key,
            max_attempts=3,
        )

    async def load_generation_input(
        self,
        run: AgentRun,
    ) -> EvaluationInput:
        try:
            evaluation_input = await self.load_generation_input_in_transaction(
                run
            )
            await self.session.commit()
            return evaluation_input
        except Exception:
            await self.session.rollback()
            raise

    async def load_generation_input_in_transaction(
        self,
        run: AgentRun,
    ) -> EvaluationInput:
        """Load the frozen evaluation input without changing the transaction."""

        payload = validate_evaluation_generation_run(run)
        context = await self._load_context(
            user_id=run.user_id,
            attempt_id=payload.attempt_id,
            interaction_language=payload.interaction_language,
            follow_up_completion_reason=payload.follow_up_completion_reason,
            payload=payload,
            for_update=False,
        )
        return context.input

    async def persist_success(
        self,
        run: AgentRun,
        output: PracticeEvaluationOutput,
    ) -> PracticeEvaluationOutput:
        try:
            payload = validate_evaluation_generation_run(run)
            context = await self._load_context(
                user_id=run.user_id,
                attempt_id=payload.attempt_id,
                interaction_language=payload.interaction_language,
                follow_up_completion_reason=payload.follow_up_completion_reason,
                payload=payload,
                for_update=True,
            )
            existing = await self.session.scalar(
                select(PracticeEvaluation)
                .where(PracticeEvaluation.source_agent_run_id == run.id)
                .with_for_update()
            )
            if existing is None:
                existing = await self.session.scalar(
                    select(PracticeEvaluation)
                    .where(PracticeEvaluation.attempt_id == payload.attempt_id)
                    .with_for_update()
                )
            if existing is not None:
                if (
                    existing.attempt_id != payload.attempt_id
                    or existing.source_agent_run_id != run.id
                ):
                    raise EvaluationGenerationStateError(
                        PRACTICE_EVALUATION_ARTIFACT_CONFLICT
                    )
                try:
                    canonical = practice_evaluation_output_from_artifact(
                        existing,
                        scoring_focus_count=len(
                            context.input.question.scoring_focus
                        ),
                    )
                except ValueError:
                    raise EvaluationGenerationStateError(
                        PRACTICE_EVALUATION_ARTIFACT_CONFLICT
                    ) from None
                await self.competency_ingestion_service_factory(
                    self.session
                ).ingest_practice_evaluation(
                    user_id=run.user_id,
                    practice_session=context.session,
                    attempt=context.attempt,
                    evaluation=existing,
                )
                await self.session.commit()
                return canonical

            validated_output = _validate_output(output)
            _validate_focus_indices(
                validated_output,
                len(context.input.question.scoring_focus),
            )
            now = self.clock()
            _require_aware_datetime(now)
            evaluation = PracticeEvaluation(
                id=uuid4(),
                attempt_id=payload.attempt_id,
                source_agent_run_id=run.id,
                overall_score=validated_output.overall_score,
                dimension_scores=[
                    item.model_dump(mode="json", by_alias=True)
                    for item in validated_output.dimension_scores
                ],
                focus_assessments=[
                    item.model_dump(mode="json", by_alias=True)
                    for item in validated_output.focus_assessments
                ],
                evaluated_at=now,
            )
            self.session.add(evaluation)
            await self.session.flush()
            await self.competency_ingestion_service_factory(
                self.session
            ).ingest_practice_evaluation(
                user_id=run.user_id,
                practice_session=context.session,
                attempt=context.attempt,
                evaluation=evaluation,
            )
            await self.session.commit()
            return validated_output
        except Exception:
            await self.session.rollback()
            raise

    async def _load_context(
        self,
        *,
        user_id: UUID,
        attempt_id: UUID,
        interaction_language: InteractionLanguage,
        follow_up_completion_reason: PracticeEvaluationFollowUpCompletionReason,
        payload: EvaluationRunPayload | None,
        for_update: bool,
    ) -> _EvaluationContext:
        reason = _completion_reason(follow_up_completion_reason)
        if interaction_language not in INTERACTION_LANGUAGES:
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_CONTEXT_CONFLICT
            )

        attempt_statement = select(PracticeAttempt).where(
            PracticeAttempt.id == attempt_id,
            PracticeAttempt.user_id == user_id,
        )
        attempt = await self._scalar(attempt_statement, for_update=False)
        if attempt is None:
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_ATTEMPT_NOT_FOUND
            )

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
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_SESSION_NOT_ACTIVE
            )
        if practice_session.language != interaction_language:
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_CONTEXT_CONFLICT
            )

        if for_update:
            attempt = await self._scalar(attempt_statement, for_update=True)
            if attempt is None:
                raise EvaluationGenerationStateError(
                    PRACTICE_EVALUATION_ATTEMPT_NOT_FOUND
                )
        if attempt.status != "evaluating":
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_COMPLETION_CONFLICT
            )

        question_card_id = (
            payload.question_card_id
            if payload is not None
            else attempt.question_card_id
        )
        if question_card_id is None or attempt.question_card_id != question_card_id:
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_QUESTION_NOT_READY
            )
        card_statement = select(QuestionCard).where(
            QuestionCard.id == question_card_id,
        )
        question_card = await self._scalar(card_statement, for_update=for_update)
        if question_card is None or not _question_card_matches(
            question_card,
            attempt=attempt,
            practice_session=practice_session,
        ):
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_QUESTION_NOT_READY
            )
        question_context = _question_context_from_card(question_card)

        answers = await self._all_answers(attempt.id, for_update=for_update)
        questions = await self._all_questions(
            attempt.id,
            for_update=for_update,
        )
        decisions = await self._all_decisions(
            attempt.id,
            for_update=for_update,
        )

        main_answer_id = payload.main_answer_id if payload is not None else None
        main_answer = _main_answer_from_answers(
            answers,
            expected_id=main_answer_id,
        )
        main_content = _answer_content(main_answer)
        follow_up_sources = await self._load_follow_up_sources(
            attempt=attempt,
            practice_session=practice_session,
            question_card=question_card,
            main_answer=main_answer,
            questions=questions,
            decisions=decisions,
            for_update=for_update,
        )

        terminal_decision = _terminal_decision(
            decisions,
            payload.terminal_follow_up_decision_id
            if payload is not None
            else None,
        )
        follow_up_snapshot = _validate_completion_graph(
            reason=reason,
            questions=questions,
            answers=answers,
            decisions=decisions,
            terminal_decision=terminal_decision,
            payload=payload,
            follow_up_sources=follow_up_sources,
        )

        try:
            evaluation_input = EvaluationInput(
                interaction_language=interaction_language,
                question=question_context,
                main_answer=EvaluationMainAnswer(content=main_content),
                follow_up_exchanges=[
                    EvaluationFollowUpExchange(
                        order=question.order,
                        prompt=question.prompt,
                        focus=question.focus,
                        answer=_answer_content(answer),
                    )
                    for question, answer in follow_up_snapshot.completed_exchanges
                ],
                follow_up_completion_reason=reason,
            )
        except (TypeError, ValueError, ValidationError):
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
            ) from None

        return _EvaluationContext(
            attempt=attempt,
            session=practice_session,
            question_card=question_card,
            main_answer=main_answer,
            terminal_decision=follow_up_snapshot.terminal_decision,
            follow_up_exchanges=follow_up_snapshot.completed_exchanges,
            unanswered_follow_up_question=follow_up_snapshot.unanswered_question,
            input=evaluation_input,
        )

    async def _load_follow_up_sources(
        self,
        *,
        attempt: PracticeAttempt,
        practice_session: PracticeSession,
        question_card: QuestionCard,
        main_answer: PracticeAnswer,
        questions: list[PracticeFollowUpQuestion],
        decisions: list[PracticeFollowUpDecision],
        for_update: bool,
    ) -> dict[UUID, _ValidatedFollowUpSource]:
        source_ids = {
            decision.source_agent_run_id for decision in decisions
        }
        source_ids.update(question.source_agent_run_id for question in questions)
        source_statement = select(AgentRun).where(AgentRun.id.in_(source_ids))
        source_runs = await self._scalars(
            source_statement,
            for_update=for_update,
        )
        source_by_id = {run.id: run for run in source_runs}
        if len(source_by_id) != len(source_ids):
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
            )

        validated: dict[UUID, _ValidatedFollowUpSource] = {}
        for source_id in source_ids:
            source = source_by_id[source_id]
            validated[source_id] = _validate_follow_up_source(
                source,
                attempt=attempt,
                practice_session=practice_session,
                question_card=question_card,
                main_answer=main_answer,
            )

        for decision in decisions:
            if decision.attempt_id != attempt.id:
                raise EvaluationGenerationStateError(
                    PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
                )
            if decision.source_agent_run_id not in validated:
                raise EvaluationGenerationStateError(
                    PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
                )

        for question in questions:
            source = validated.get(question.source_agent_run_id)
            linked_decisions = [
                decision
                for decision in decisions
                if decision.follow_up_question_id == question.id
            ]
            if (
                question.attempt_id != attempt.id
                or source is None
                or source.payload.next_follow_up_order != question.order
                or len(linked_decisions) != 1
                or linked_decisions[0].action != "askFollowUp"
                or linked_decisions[0].source_agent_run_id
                != question.source_agent_run_id
            ):
                raise EvaluationGenerationStateError(
                    PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
                )
        return validated

    async def _all_answers(
        self,
        attempt_id: UUID,
        *,
        for_update: bool,
    ) -> list[PracticeAnswer]:
        statement = (
            select(PracticeAnswer)
            .where(PracticeAnswer.attempt_id == attempt_id)
            .order_by(PracticeAnswer.order.asc(), PracticeAnswer.id.asc())
        )
        result = await self._scalars(statement, for_update=for_update)
        return list(result)

    async def _all_questions(
        self,
        attempt_id: UUID,
        *,
        for_update: bool,
    ) -> list[PracticeFollowUpQuestion]:
        statement = (
            select(PracticeFollowUpQuestion)
            .where(PracticeFollowUpQuestion.attempt_id == attempt_id)
            .order_by(
                PracticeFollowUpQuestion.order.asc(),
                PracticeFollowUpQuestion.id.asc(),
            )
        )
        result = await self._scalars(statement, for_update=for_update)
        return list(result)

    async def _all_decisions(
        self,
        attempt_id: UUID,
        *,
        for_update: bool,
    ) -> list[PracticeFollowUpDecision]:
        statement = (
            select(PracticeFollowUpDecision)
            .where(PracticeFollowUpDecision.attempt_id == attempt_id)
            .order_by(
                PracticeFollowUpDecision.order.asc(),
                PracticeFollowUpDecision.id.asc(),
            )
        )
        result = await self._scalars(statement, for_update=for_update)
        return list(result)

    async def _scalar(self, statement, *, for_update: bool):
        if for_update:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    async def _scalars(self, statement, *, for_update: bool):
        if for_update:
            statement = statement.with_for_update()
        return (await self.session.scalars(statement)).all()

    def _require_configuration(self) -> None:
        if not self.llm_model:
            raise ValueError("llm_model must not be empty")


def _validate_follow_up_source(
    run: AgentRun,
    *,
    attempt: PracticeAttempt,
    practice_session: PracticeSession,
    question_card: QuestionCard,
    main_answer: PracticeAnswer,
) -> _ValidatedFollowUpSource:
    if (
        run.status != AgentRunStatus.SUCCEEDED
        or run.user_id != practice_session.user_id
        or run.user_id != attempt.user_id
    ):
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
        )
    try:
        payload = validate_follow_up_generation_run(run)
        expected_idempotency_key = practice_follow_up_idempotency_key(
            attempt.id,
            payload.next_follow_up_order,
        )
    except (FollowUpGenerationStateError, TypeError, ValueError, ValidationError):
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
        ) from None

    if (
        payload.attempt_id != attempt.id
        or payload.question_card_id != question_card.id
        or payload.main_answer_id != main_answer.id
        or payload.interaction_language != practice_session.language
        or run.idempotency_key != expected_idempotency_key
    ):
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
        )
    return _ValidatedFollowUpSource(run=run, payload=payload)


def _completion_reason(
    value: PracticeEvaluationFollowUpCompletionReason,
) -> PracticeEvaluationFollowUpCompletionReason:
    try:
        return PracticeEvaluationFollowUpCompletionReason(value)
    except (TypeError, ValueError):
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_CONTEXT_CONFLICT
        ) from None


def _payload_from_context(context: _EvaluationContext) -> EvaluationRunPayload:
    first = context.follow_up_exchanges[0] if context.follow_up_exchanges else None
    second = (
        context.follow_up_exchanges[1]
        if len(context.follow_up_exchanges) > 1
        else None
    )
    return EvaluationRunPayload(
        attempt_id=context.attempt.id,
        question_card_id=context.question_card.id,
        main_answer_id=context.main_answer.id,
        interaction_language=context.session.language,
        follow_up_completion_reason=context.input.follow_up_completion_reason,
        terminal_follow_up_decision_id=context.terminal_decision.id,
        unanswered_follow_up_question_id=(
            context.unanswered_follow_up_question.id
            if context.unanswered_follow_up_question is not None
            else None
        ),
        follow_up_question_1_id=first[0].id if first is not None else None,
        follow_up_answer_1_id=first[1].id if first is not None else None,
        follow_up_question_2_id=second[0].id if second is not None else None,
        follow_up_answer_2_id=second[1].id if second is not None else None,
    )


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
        and question_card.question_type
        == practice_session.initial_question_type
        and question_card.difficulty == practice_session.initial_difficulty
        and question_card.question_type == attempt.question_type
        and question_card.difficulty == attempt.difficulty
    )


def _question_context_from_card(
    question_card: QuestionCard,
) -> EvaluationQuestionContext:
    try:
        return EvaluationQuestionContext.model_validate(
            {
                "prompt": question_card.prompt,
                "question_type": question_card.question_type,
                "difficulty": question_card.difficulty,
                "assessed_capabilities": question_card.assessed_capabilities,
                "scoring_focus": question_card.scoring_focus,
            }
        )
    except (TypeError, ValueError, ValidationError):
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_QUESTION_NOT_READY
        ) from None


def _main_answer_from_answers(
    answers: list[PracticeAnswer],
    *,
    expected_id: UUID | None,
) -> PracticeAnswer:
    main_answers = [
        answer
        for answer in answers
        if answer.kind == PracticeAnswerKind.MAIN.value
        and answer.order == 1
        and answer.follow_up_question_id is None
    ]
    if len(main_answers) != 1:
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_MAIN_ANSWER_NOT_READY
        )
    main_answer = main_answers[0]
    if expected_id is not None and main_answer.id != expected_id:
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_CONTEXT_CONFLICT
        )
    return main_answer


def _answer_content(
    answer: PracticeAnswer,
    error_code: EvaluationGenerationStateErrorCode = (
        PRACTICE_EVALUATION_MAIN_ANSWER_NOT_READY
    ),
) -> str:
    try:
        return cast(
            str,
            TypeAdapter(PracticeAnswerContent).validate_python(answer.content),
        )
    except (TypeError, ValueError, ValidationError):
        raise EvaluationGenerationStateError(error_code) from None


def _terminal_decision(
    decisions: list[PracticeFollowUpDecision],
    expected_id: UUID | None,
) -> PracticeFollowUpDecision:
    if expected_id is None:
        if not decisions:
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_COMPLETION_CONFLICT
            )
        return decisions[-1]
    for decision in decisions:
        if decision.id == expected_id:
            return decision
    raise EvaluationGenerationStateError(
        PRACTICE_EVALUATION_CONTEXT_CONFLICT
    )


def _validate_completion_graph(
    *,
    reason: PracticeEvaluationFollowUpCompletionReason,
    questions: list[PracticeFollowUpQuestion],
    answers: list[PracticeAnswer],
    decisions: list[PracticeFollowUpDecision],
    terminal_decision: PracticeFollowUpDecision,
    payload: EvaluationRunPayload | None,
    follow_up_sources: Mapping[UUID, _ValidatedFollowUpSource],
) -> _ValidatedEvaluationFollowUpSnapshot:
    follow_up_answers = [
        answer
        for answer in answers
        if answer.kind == PracticeAnswerKind.FOLLOW_UP.value
    ]
    if any(
        answer.kind not in {
            PracticeAnswerKind.MAIN.value,
            PracticeAnswerKind.FOLLOW_UP.value,
        }
        for answer in answers
    ):
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
        )

    ordered_questions = sorted(questions, key=lambda item: (item.order, item.id))
    if [question.order for question in ordered_questions] != list(
        range(1, len(ordered_questions) + 1)
    ) or len(ordered_questions) > MAX_PRACTICE_FOLLOW_UPS:
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
        )

    if reason == PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED:
        if (
            ordered_questions
            or follow_up_answers
            or len(decisions) != 1
            or terminal_decision.order != 1
            or terminal_decision.action != "complete"
            or terminal_decision.follow_up_question_id is not None
        ):
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_COMPLETION_CONFLICT
            )
        _validate_follow_up_decision_payload(
            terminal_decision,
            follow_up_sources=follow_up_sources,
            expected_order=1,
            previous_question_id=None,
            previous_answer_id=None,
        )
        if payload is not None and (
            payload.unanswered_follow_up_question_id is not None
            or any(
                value is not None
                for value in (
                    payload.follow_up_question_1_id,
                    payload.follow_up_answer_1_id,
                    payload.follow_up_question_2_id,
                    payload.follow_up_answer_2_id,
                )
            )
        ):
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_CONTEXT_CONFLICT
            )
        return _ValidatedEvaluationFollowUpSnapshot(
            terminal_decision=terminal_decision,
            completed_exchanges=(),
            unanswered_question=None,
            completion_reason=reason,
        )

    if not ordered_questions or len(ordered_questions) not in (1, 2):
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_COMPLETION_CONFLICT
        )

    answer_by_question: dict[UUID, PracticeAnswer] = {}
    for answer in follow_up_answers:
        if (
            answer.follow_up_question_id is None
            or answer.follow_up_question_id in answer_by_question
            or answer.order != 1 + _question_order(
                answer.follow_up_question_id,
                ordered_questions,
            )
        ):
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
            )
        answer_by_question[answer.follow_up_question_id] = answer

    def build_exchanges(
        exchange_questions: list[PracticeFollowUpQuestion],
    ) -> list[tuple[PracticeFollowUpQuestion, PracticeAnswer]]:
        exchanges: list[tuple[PracticeFollowUpQuestion, PracticeAnswer]] = []
        for question in exchange_questions:
            answer = answer_by_question.get(question.id)
            if answer is None:
                raise EvaluationGenerationStateError(
                    PRACTICE_EVALUATION_COMPLETION_CONFLICT
                )
            try:
                answer_content = _answer_content(
                    answer,
                    PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID,
                )
                EvaluationFollowUpExchange(
                    order=question.order,
                    prompt=question.prompt,
                    focus=question.focus,
                    answer=answer_content,
                )
            except (TypeError, ValueError, ValidationError):
                raise EvaluationGenerationStateError(
                    PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
                ) from None
            exchanges.append((question, answer))
        return exchanges

    decisions_by_order = {decision.order: decision for decision in decisions}
    if len(decisions_by_order) != len(decisions):
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_COMPLETION_CONFLICT
        )

    first_decision = decisions_by_order.get(1)
    if (
        first_decision is None
        or first_decision.action != "askFollowUp"
        or first_decision.follow_up_question_id != ordered_questions[0].id
    ):
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_COMPLETION_CONFLICT
        )
    _validate_follow_up_decision_payload(
        first_decision,
        follow_up_sources=follow_up_sources,
        expected_order=1,
        previous_question_id=None,
        previous_answer_id=None,
    )

    if reason == PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY:
        requested_terminal_decision = terminal_decision
        if len(decisions) != len(ordered_questions):
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_COMPLETION_CONFLICT
            )
        unanswered_question = ordered_questions[-1]
        completed_questions = ordered_questions[:-1]
        if len(follow_up_answers) != len(completed_questions):
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_COMPLETION_CONFLICT
            )
        if unanswered_question.id in answer_by_question:
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_COMPLETION_CONFLICT
            )
        exchanges = build_exchanges(completed_questions)
        terminal_decision = first_decision
        if len(ordered_questions) == 2:
            second_decision = decisions_by_order.get(2)
            first_answer = answer_by_question.get(ordered_questions[0].id)
            if second_decision is None or first_answer is None:
                raise EvaluationGenerationStateError(
                    PRACTICE_EVALUATION_COMPLETION_CONFLICT
                )
            _validate_follow_up_decision_payload(
                second_decision,
                follow_up_sources=follow_up_sources,
                expected_order=2,
                previous_question_id=ordered_questions[0].id,
                previous_answer_id=first_answer.id,
            )
            if (
                second_decision.action != "askFollowUp"
                or second_decision.follow_up_question_id
                != unanswered_question.id
            ):
                raise EvaluationGenerationStateError(
                    PRACTICE_EVALUATION_COMPLETION_CONFLICT
                )
            terminal_decision = second_decision
        if terminal_decision.follow_up_question_id != unanswered_question.id:
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_COMPLETION_CONFLICT
            )
        if requested_terminal_decision.id != terminal_decision.id:
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_CONTEXT_CONFLICT
            )
        if payload is not None:
            expected_pairs = [
                (question_id, answer_id)
                for question_id, answer_id in (
                    (
                        payload.follow_up_question_1_id,
                        payload.follow_up_answer_1_id,
                    ),
                    (
                        payload.follow_up_question_2_id,
                        payload.follow_up_answer_2_id,
                    ),
                )
                if question_id is not None
            ]
            actual_pairs = [
                (question.id, answer.id) for question, answer in exchanges
            ]
            if (
                payload.unanswered_follow_up_question_id
                != unanswered_question.id
                or expected_pairs != actual_pairs
            ):
                raise EvaluationGenerationStateError(
                    PRACTICE_EVALUATION_CONTEXT_CONFLICT
                )
        return _ValidatedEvaluationFollowUpSnapshot(
            terminal_decision=terminal_decision,
            completed_exchanges=tuple(exchanges),
            unanswered_question=unanswered_question,
            completion_reason=reason,
        )

    if len(follow_up_answers) != len(ordered_questions) or len(decisions) != 2:
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_COMPLETION_CONFLICT
        )
    exchanges = build_exchanges(ordered_questions)
    second_decision = decisions_by_order.get(2)
    first_answer = answer_by_question.get(ordered_questions[0].id)
    if second_decision is None or first_answer is None:
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_COMPLETION_CONFLICT
        )
    _validate_follow_up_decision_payload(
        second_decision,
        follow_up_sources=follow_up_sources,
        expected_order=2,
        previous_question_id=ordered_questions[0].id,
        previous_answer_id=first_answer.id,
    )
    if len(ordered_questions) == 1:
        valid_terminal = (
            second_decision.action == "complete"
            and second_decision.follow_up_question_id is None
        )
    else:
        valid_terminal = (
            second_decision.action == "askFollowUp"
            and second_decision.follow_up_question_id == ordered_questions[1].id
        )
    if (
        not valid_terminal
        or terminal_decision.id != second_decision.id
        or terminal_decision.order != 2
    ):
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_COMPLETION_CONFLICT
        )

    if payload is not None:
        expected_pairs = [
            (question_id, answer_id)
            for question_id, answer_id in (
                (
                    payload.follow_up_question_1_id,
                    payload.follow_up_answer_1_id,
                ),
                (
                    payload.follow_up_question_2_id,
                    payload.follow_up_answer_2_id,
                ),
            )
            if question_id is not None
        ]
        actual_pairs = [(question.id, answer.id) for question, answer in exchanges]
        if (
            payload.unanswered_follow_up_question_id is not None
            or expected_pairs != actual_pairs
        ):
            raise EvaluationGenerationStateError(
                PRACTICE_EVALUATION_CONTEXT_CONFLICT
            )
    return _ValidatedEvaluationFollowUpSnapshot(
        terminal_decision=second_decision,
        completed_exchanges=tuple(exchanges),
        unanswered_question=None,
        completion_reason=reason,
    )


def _validate_follow_up_decision_payload(
    decision: PracticeFollowUpDecision,
    *,
    follow_up_sources: Mapping[UUID, _ValidatedFollowUpSource],
    expected_order: int,
    previous_question_id: UUID | None,
    previous_answer_id: UUID | None,
) -> None:
    source = follow_up_sources.get(decision.source_agent_run_id)
    if source is None:
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
        )
    source_payload = source.payload
    if (
        decision.order != expected_order
        or source_payload.next_follow_up_order != expected_order
        or source_payload.previous_follow_up_question_id
        != previous_question_id
        or source_payload.previous_follow_up_answer_id != previous_answer_id
    ):
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
        )


def _question_order(
    question_id: UUID,
    questions: list[PracticeFollowUpQuestion],
) -> int:
    matches = [question.order for question in questions if question.id == question_id]
    if len(matches) != 1:
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
        )
    return matches[0]


def _validate_output(output: object) -> PracticeEvaluationOutput:
    try:
        return PracticeEvaluationOutput.model_validate(output)
    except (TypeError, ValueError, ValidationError):
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_ARTIFACT_CONFLICT
        ) from None


def _validate_focus_indices(
    output: PracticeEvaluationOutput,
    scoring_focus_count: int,
) -> None:
    actual_indices = [
        assessment.focus_index for assessment in output.focus_assessments
    ]
    if actual_indices != list(range(scoring_focus_count)):
        raise EvaluationGenerationStateError(
            PRACTICE_EVALUATION_ARTIFACT_CONFLICT
        )


def _require_aware_datetime(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("clock must return a timezone-aware datetime")


__all__ = [
    "EvaluationGenerationService",
    "EvaluationGenerationStateError",
    "EvaluationGenerationStateErrorCode",
    "INVALID_PRACTICE_EVALUATION_RUN",
    "PRACTICE_EVALUATION_ARTIFACT_CONFLICT",
    "PRACTICE_EVALUATION_ATTEMPT_NOT_FOUND",
    "PRACTICE_EVALUATION_COMPLETION_CONFLICT",
    "PRACTICE_EVALUATION_CONTEXT_CONFLICT",
    "PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID",
    "PRACTICE_EVALUATION_MAIN_ANSWER_NOT_READY",
    "PRACTICE_EVALUATION_QUESTION_NOT_READY",
    "PRACTICE_EVALUATION_SESSION_NOT_ACTIVE",
    "practice_evaluation_idempotency_key",
    "practice_evaluation_output_from_artifact",
    "validate_evaluation_generation_run",
]
