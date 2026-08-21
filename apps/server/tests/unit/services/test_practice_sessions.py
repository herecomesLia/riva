import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest

from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAnswer,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeRecommendation,
    PracticeReview,
    PracticeSession,
    QuestionCard,
)
from riva.prompts import (
    FOLLOW_UP_PROMPT,
    PRACTICE_EVALUATION_PROMPT,
    PRACTICE_RECOMMENDATION_PROMPT,
    PRACTICE_REFERENCE_ANSWER_PROMPT,
    PRACTICE_REVIEW_PROMPT,
    QUESTION_GENERATION_PROMPT,
)
from riva.schemas.evaluation import (
    EvaluationRunPayload,
    PracticeEvaluationFollowUpCompletionReason,
)
from riva.schemas.follow_up import FollowUpRunPayload
from riva.schemas.practice_interactions import PracticeAnswerKind
from riva.schemas.practice_recommendation import RecommendationRunPayload
from riva.schemas.practice_reference_answer import PracticeReferenceAnswerTargetType
from riva.schemas.practice_review import ReviewRunPayload
from riva.schemas.practice_sessions import (
    PracticeAttemptStatus,
    PracticeSessionCompletionReason,
    PracticeSessionSelection,
    PracticeSessionStatus,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.schemas.question_generation import QuestionGenerationRunPayload
from riva.services.evaluation_generation import (
    EvaluationGenerationStateError,
    practice_evaluation_idempotency_key,
)
from riva.services.follow_up_generation import FollowUpGenerationStateError
from riva.services.practice_sessions import (
    PRACTICE_EVALUATION_GENERATION_FAILED,
    PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT,
    PRACTICE_EVALUATION_GENERATION_UNAVAILABLE,
    PRACTICE_FOLLOW_UP_GENERATION_FAILED,
    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT,
    PRACTICE_QUESTION_GENERATION_FAILED,
    PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED,
    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT,
    PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
    PRACTICE_RECOMMENDATION_GENERATION_FAILED,
    PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT,
    PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE,
    PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE,
    PRACTICE_REVIEW_GENERATION_FAILED,
    PRACTICE_REVIEW_GENERATION_STATE_CONFLICT,
    PRACTICE_REVIEW_GENERATION_UNAVAILABLE,
    PRACTICE_SESSION_ALREADY_ACTIVE,
    PRACTICE_SESSION_NOT_FOUND,
    PRACTICE_SESSION_SOURCE_UNAVAILABLE,
    PRACTICE_SESSION_STATE_CONFLICT,
    PRACTICE_SESSION_VERSION_CONFLICT,
    PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE,
    PracticeCompletedSessionWorkflowContext,
    PracticeEndedEarlySessionWorkflowContext,
    PracticeEvaluationWorkflowContext,
    PracticePrimaryAnswerWorkflowContext,
    PracticeReviewWorkflowContext,
    PracticeSessionService,
    PracticeSessionStateError,
    PracticeSessionWorkflowContext,
    practice_follow_up_idempotency_key,
    practice_question_generation_idempotency_key,
)
from riva.services.question_generation import QuestionGenerationStateError
from riva.services.recommendation_generation import (
    practice_recommendation_idempotency_key,
)
from riva.services.reference_answer_generation import (
    PracticeReferenceAnswerLifecycleStatus,
    PracticeReferenceAnswerWorkflowState,
    ReferenceAnswerGenerationStateError,
    practice_follow_up_reference_answer_idempotency_key,
    practice_main_reference_answer_idempotency_key,
)
from riva.services.review_generation import practice_review_idempotency_key

NOW = datetime(2026, 8, 10, 10, 0, tzinfo=UTC)


class ScriptedSession:
    def __init__(
        self,
        *scalar_values: object,
        execute_rows: list[tuple[object, ...]] | None = None,
        execute_results: list[list[tuple[object, ...]]] | None = None,
    ) -> None:
        self.scalar_values = list(scalar_values)
        self.execute_rows = execute_rows or []
        self.execute_results = execute_results
        self.consumed_values: list[object] = []
        self.statements: list[Any] = []
        self.added: list[object] = []
        self.commit_count = 0
        self.flush_count = 0
        self.rollback_count = 0

    async def scalar(self, statement: Any) -> object:
        self.statements.append(statement)
        if not self.scalar_values:
            raise AssertionError("unexpected scalar query")
        value = self.scalar_values.pop(0)
        self.consumed_values.append(value)
        return value

    async def scalars(self, statement: Any) -> Any:
        self.statements.append(statement)
        entity = statement.column_descriptions[0].get("entity")
        candidates = [*self.consumed_values, *self.scalar_values]
        values = [
            value
            for value in candidates
            if entity is not None
            and isinstance(value, entity)
            and not (entity is AgentRun and value.agent_id != "follow-up-generator")
        ]

        class Result:
            def all(self) -> list[object]:
                return values

        return Result()

    async def execute(self, statement: Any) -> Any:
        self.statements.append(statement)
        rows = (
            self.execute_results.pop(0)
            if self.execute_results is not None
            else self.execute_rows
        )

        class Result:
            def all(self) -> list[tuple[object, ...]]:
                return rows

        return Result()

    def add(self, value: object) -> None:
        self.added.append(value)

    def add_all(self, values: list[object]) -> None:
        self.added.extend(values)

    async def flush(self) -> None:
        self.flush_count += 1

    async def commit(self) -> None:
        self.commit_count += 1

    async def rollback(self) -> None:
        self.rollback_count += 1


class FakeGenerationService:
    def __init__(
        self,
        run: AgentRun | None = None,
        error: QuestionGenerationStateError | None = None,
        run_factory: Any | None = None,
    ) -> None:
        self.run = run
        self.error = error
        self.run_factory = run_factory
        self.calls: list[dict[str, object]] = []

    async def enqueue_generation_in_transaction(
        self,
        **kwargs: object,
    ) -> AgentRun:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        if self.run_factory is not None:
            self.run = self.run_factory(kwargs)
        assert self.run is not None
        return self.run


class FakeFollowUpGenerationService:
    def __init__(
        self,
        run: AgentRun | None = None,
        error: BaseException | None = None,
        run_factory: Any | None = None,
    ) -> None:
        self.run = run
        self.error = error
        self.run_factory = run_factory
        self.calls: list[dict[str, object]] = []

    async def enqueue_generation_in_transaction(
        self,
        **kwargs: object,
    ) -> AgentRun:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        if self.run_factory is not None:
            self.run = self.run_factory(kwargs)
        assert self.run is not None
        return self.run


class FakeEvaluationGenerationService:
    def __init__(
        self,
        run: AgentRun | None = None,
        error: BaseException | None = None,
        run_factory: Any | None = None,
    ) -> None:
        self.run = run
        self.error = error
        self.run_factory = run_factory
        self.calls: list[dict[str, object]] = []

    async def enqueue_generation_in_transaction(
        self,
        **kwargs: object,
    ) -> AgentRun:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        if self.run_factory is not None:
            self.run = self.run_factory(kwargs)
        assert self.run is not None
        return self.run


class FakeReviewGenerationService:
    def __init__(
        self,
        run: AgentRun | None = None,
        error: BaseException | None = None,
    ) -> None:
        self.run = run
        self.error = error
        self.calls: list[dict[str, object]] = []

    async def enqueue_generation_in_transaction(
        self,
        **kwargs: object,
    ) -> AgentRun:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        assert self.run is not None
        return self.run


class FakeRecommendationGenerationService:
    def __init__(
        self,
        run: AgentRun | None = None,
        error: BaseException | None = None,
    ) -> None:
        self.run = run
        self.error = error
        self.calls: list[dict[str, object]] = []

    async def enqueue_generation_in_transaction(
        self,
        **kwargs: object,
    ) -> AgentRun:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        assert self.run is not None
        return self.run


class FakeReferenceAnswerGenerationService:
    def __init__(
        self,
        run: AgentRun | None = None,
        state: PracticeReferenceAnswerWorkflowState | None = None,
        error: BaseException | None = None,
        state_error: ReferenceAnswerGenerationStateError | None = None,
        states: dict[tuple[str, UUID | None], PracticeReferenceAnswerWorkflowState]
        | None = None,
    ) -> None:
        self.run = run
        self.state = state
        self.error = error
        self.state_error = state_error
        self.states = states or {}
        self.main_calls: list[dict[str, object]] = []
        self.follow_up_calls: list[dict[str, object]] = []
        self.state_calls: list[dict[str, object]] = []

    def _state_for(
        self,
        *,
        target_type: str,
        follow_up_question_id: UUID | None,
    ) -> PracticeReferenceAnswerWorkflowState:
        if self.state_error is not None:
            raise self.state_error
        state = self.states.get((target_type, follow_up_question_id), self.state)
        if state is None:
            raise AssertionError("reference state was not configured")
        return state

    def _mark_enqueued(
        self,
        *,
        target_type: str,
        follow_up_question_id: UUID | None,
    ) -> None:
        key = (target_type, follow_up_question_id)
        state = self.states.get(key, self.state)
        if (
            state is not None
            and state.status is PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED
        ):
            if self.run is None:
                raise AssertionError("reference run was not configured")
            self.states[key] = reference_answer_state(self.run)

    async def enqueue_main_generation_in_transaction(
        self,
        **kwargs: object,
    ) -> AgentRun:
        self.main_calls.append(kwargs)
        if self.error is not None:
            raise self.error
        assert self.run is not None
        self._mark_enqueued(target_type="main", follow_up_question_id=None)
        return self.run

    async def enqueue_follow_up_generation_in_transaction(
        self,
        **kwargs: object,
    ) -> AgentRun:
        self.follow_up_calls.append(kwargs)
        if self.error is not None:
            raise self.error
        assert self.run is not None
        self._mark_enqueued(
            target_type="followUp",
            follow_up_question_id=kwargs.get("follow_up_question_id"),  # type: ignore[arg-type]
        )
        return self.run

    async def get_main_generation_state(
        self,
        **kwargs: object,
    ) -> PracticeReferenceAnswerWorkflowState:
        self.state_calls.append({"target_type": "main", **kwargs})
        return self._state_for(target_type="main", follow_up_question_id=None)

    async def get_follow_up_generation_state(
        self,
        **kwargs: object,
    ) -> PracticeReferenceAnswerWorkflowState:
        follow_up_question_id = kwargs.get("follow_up_question_id")
        assert isinstance(follow_up_question_id, UUID)
        self.state_calls.append({"target_type": "followUp", **kwargs})
        return self._state_for(
            target_type="followUp",
            follow_up_question_id=follow_up_question_id,
        )


def reference_answer_run(*, user_id: UUID) -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="practice-reference-answer-generator",
        prompt_id=PRACTICE_REFERENCE_ANSWER_PROMPT.prompt_id,
        prompt_version=PRACTICE_REFERENCE_ANSWER_PROMPT.version,
        output_schema_id=PRACTICE_REFERENCE_ANSWER_PROMPT.output_schema_id,
        status=AgentRunStatus.QUEUED,
        payload={},
        idempotency_key=f"reference:{uuid4()}",
        attempt_count=0,
        max_attempts=3,
        available_at=NOW,
        model="test-model",
    )


def reference_answer_state(
    run: AgentRun,
    status: PracticeReferenceAnswerLifecycleStatus = (
        PracticeReferenceAnswerLifecycleStatus.GENERATING
    ),
) -> PracticeReferenceAnswerWorkflowState:
    return PracticeReferenceAnswerWorkflowState(
        status=status,
        generation_run=run,
        artifact=None,
        output=None,
        viewed_before_submission=False,
    )


def selection(
    *,
    target_role_id: UUID | None = None,
    question_type: QuestionCardQuestionType = QuestionCardQuestionType.PROJECT_DEEP_DIVE,
    difficulty: QuestionCardDifficulty = QuestionCardDifficulty.BASIC,
    source: str = "personalized",
    prioritize_weaknesses: bool = False,
) -> PracticeSessionSelection:
    return PracticeSessionSelection(
        target_role_id=target_role_id or uuid4(),
        question_type=question_type,
        difficulty=difficulty,
        source=source,
        prioritize_weaknesses=prioritize_weaknesses,
    )


def generation_payload(
    *,
    role_id: UUID,
    language: str = "en",
    question_type: QuestionCardQuestionType = QuestionCardQuestionType.PROJECT_DEEP_DIVE,
    difficulty: QuestionCardDifficulty = QuestionCardDifficulty.BASIC,
) -> QuestionGenerationRunPayload:
    return QuestionGenerationRunPayload(
        role_id=role_id,
        profile_id=uuid4(),
        profile_version=1,
        job_description_version=1,
        job_description_analysis_version=1,
        matching_analysis_run_id=uuid4(),
        interaction_language=language,
        question_type=question_type,
        difficulty=difficulty,
    )


def generation_run(
    *,
    user_id: UUID,
    payload: QuestionGenerationRunPayload,
    status: AgentRunStatus = AgentRunStatus.QUEUED,
) -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="question-generator",
        prompt_id=QUESTION_GENERATION_PROMPT.prompt_id,
        prompt_version=QUESTION_GENERATION_PROMPT.version,
        output_schema_id=QUESTION_GENERATION_PROMPT.output_schema_id,
        status=status,
        payload=payload.model_dump(mode="json", by_alias=True),
        idempotency_key=f"generation:{uuid4()}",
        attempt_count=0 if status is AgentRunStatus.QUEUED else 1,
        max_attempts=3,
        available_at=NOW,
        created_at=NOW,
        started_at=None if status is AgentRunStatus.QUEUED else NOW,
        finished_at=NOW
        if status in {AgentRunStatus.SUCCEEDED, AgentRunStatus.FAILED}
        else None,
        provider="fake" if status is AgentRunStatus.SUCCEEDED else None,
        model="test-model",
        input_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        output_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        result={"prompt": "persisted"} if status is AgentRunStatus.SUCCEEDED else None,
        error_code="provider_unavailable" if status is AgentRunStatus.FAILED else None,
    )


def practice_session(
    *,
    user_id: UUID,
    role_id: UUID,
    language: str = "en",
    version: int = 1,
    status: str = "active",
) -> PracticeSession:
    return PracticeSession(
        id=uuid4(),
        user_id=user_id,
        target_role_id=role_id,
        language=language,
        version=version,
        status=status,
        initial_question_type="projectDeepDive",
        initial_difficulty="basic",
        source="personalized",
        prioritize_weaknesses=False,
        started_at=NOW,
        completed_at=None,
        completion_reason=None,
        created_at=NOW,
        updated_at=NOW,
    )


def practice_attempt(
    *,
    user_id: UUID,
    session_id: UUID,
    run_id: UUID | None,
    status: str = "generatingQuestion",
    question_card_id: UUID | None = None,
) -> PracticeAttempt:
    return PracticeAttempt(
        id=uuid4(),
        user_id=user_id,
        session_id=session_id,
        attempt_number=1,
        question_type="projectDeepDive",
        difficulty="basic",
        status=status,
        question_generation_run_id=run_id,
        question_card_id=question_card_id,
        retry_of_attempt_id=None,
        created_at=NOW,
        updated_at=NOW,
        completed_at=None,
    )


def question_card(
    *,
    user_id: UUID,
    role_id: UUID,
    run_id: UUID,
    language: str = "en",
    question_type: str = "projectDeepDive",
    difficulty: str = "basic",
) -> QuestionCard:
    return QuestionCard(
        id=uuid4(),
        user_id=user_id,
        target_role_id=role_id,
        profile_id=uuid4(),
        source_agent_run_id=run_id,
        matching_analysis_run_id=uuid4(),
        language=language,
        question_type=question_type,
        difficulty=difficulty,
        prompt="Persisted question",
        assessed_capabilities=["Ownership"],
        recommended_materials=[],
        answer_hints=["Explain the context."],
        answer_framework=["Context", "Action", "Result"],
        follow_up_directions=["Technical rationale"],
        scoring_focus=["Evidence"],
        profile_version=1,
        job_description_version=1,
        job_description_analysis_version=1,
        is_saved=False,
        is_marked_weak=False,
        answer_hints_revealed=False,
        answer_framework_revealed=False,
        created_at=NOW,
        updated_at=NOW,
    )


def main_answer(
    *,
    attempt_id: UUID,
    content: str = "  I reduced failures by 20%.  ",
) -> PracticeAnswer:
    return PracticeAnswer(
        id=uuid4(),
        attempt_id=attempt_id,
        kind=PracticeAnswerKind.MAIN.value,
        order=1,
        content=content,
        follow_up_question_id=None,
        submitted_at=NOW,
    )


def follow_up_run(
    *,
    user_id: UUID,
    attempt_id: UUID,
    question_card_id: UUID,
    main_answer_id: UUID,
    status: AgentRunStatus = AgentRunStatus.QUEUED,
    order: int = 1,
    previous_question_id: UUID | None = None,
    previous_answer_id: UUID | None = None,
) -> AgentRun:
    payload = FollowUpRunPayload(
        attempt_id=attempt_id,
        question_card_id=question_card_id,
        main_answer_id=main_answer_id,
        interaction_language="en",
        next_follow_up_order=order,
        previous_follow_up_question_id=previous_question_id,
        previous_follow_up_answer_id=previous_answer_id,
    )
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="follow-up-generator",
        prompt_id=FOLLOW_UP_PROMPT.prompt_id,
        prompt_version=FOLLOW_UP_PROMPT.version,
        output_schema_id=FOLLOW_UP_PROMPT.output_schema_id,
        status=status,
        payload=payload.model_dump(mode="json", by_alias=True),
        idempotency_key=practice_follow_up_idempotency_key(attempt_id, order),
        attempt_count=0 if status is AgentRunStatus.QUEUED else 1,
        max_attempts=3,
        available_at=NOW,
        started_at=None if status is AgentRunStatus.QUEUED else NOW,
        finished_at=NOW
        if status in {AgentRunStatus.SUCCEEDED, AgentRunStatus.FAILED}
        else None,
        provider="fake" if status is AgentRunStatus.SUCCEEDED else None,
        model="test-model",
        input_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        output_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        result={"action": "complete"} if status is AgentRunStatus.SUCCEEDED else None,
        error_code="provider_unavailable" if status is AgentRunStatus.FAILED else None,
    )


def primary_answer_context(
    *,
    version: int = 2,
    attempt_status: str = "answering",
) -> tuple[PracticeSession, PracticeAttempt, AgentRun, QuestionCard]:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(
        user_id=user_id,
        role_id=role_id,
        version=version,
    )
    question_run = generation_run(
        user_id=user_id,
        payload=generation_payload(role_id=role_id),
        status=AgentRunStatus.SUCCEEDED,
    )
    card = question_card(
        user_id=user_id,
        role_id=role_id,
        run_id=question_run.id,
    )
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=question_run.id,
        status=attempt_status,
        question_card_id=card.id,
    )
    return active, attempt, question_run, card


def test_reveal_question_hint_updates_only_the_durable_hint_state() -> None:
    active, attempt, question_run, card = primary_answer_context(version=4)
    mutation_time = NOW + timedelta(minutes=1)
    original_attempt_updated_at = attempt.updated_at
    original_attempt_completed_at = attempt.completed_at

    result = asyncio.run(
        PracticeSessionService(
            ScriptedSession(active, attempt, question_run, card, None),
            clock=lambda: mutation_time,
        ).reveal_question_hint(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
        )
    )

    assert isinstance(result, PracticeSessionWorkflowContext)
    assert result.question_card is card
    assert card.answer_hints_revealed is True
    assert card.answer_framework_revealed is False
    assert card.answer_hints == ["Explain the context."]
    assert card.updated_at == mutation_time
    assert active.version == 5
    assert active.updated_at == mutation_time
    assert attempt.status == PracticeAttemptStatus.ANSWERING.value
    assert attempt.updated_at == original_attempt_updated_at
    assert attempt.completed_at == original_attempt_completed_at


def test_reveal_question_framework_preserves_hint_and_advances_on_same_value() -> None:
    active, attempt, question_run, card = primary_answer_context(version=5)
    card.answer_hints_revealed = True
    mutation_time = NOW + timedelta(minutes=2)

    first_session = ScriptedSession(active, attempt, question_run, card, None)
    result = asyncio.run(
        PracticeSessionService(
            first_session,
            clock=lambda: mutation_time,
        ).reveal_question_framework(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=5,
            question_id=card.id,
        )
    )

    assert result.question_card is card
    assert card.answer_hints_revealed is True
    assert card.answer_framework_revealed is True
    assert active.version == 6
    assert first_session.commit_count == 1

    second_session = ScriptedSession(active, attempt, question_run, card, None)
    second_time = NOW + timedelta(minutes=3)
    asyncio.run(
        PracticeSessionService(
            second_session,
            clock=lambda: second_time,
        ).reveal_question_framework(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=6,
            question_id=card.id,
        )
    )

    assert card.answer_hints_revealed is True
    assert card.answer_framework_revealed is True
    assert card.updated_at == second_time
    assert active.version == 7
    assert second_session.commit_count == 1


def test_reveal_question_allows_empty_frozen_guidance() -> None:
    active, attempt, question_run, card = primary_answer_context(version=4)
    card.answer_hints = []

    result = asyncio.run(
        PracticeSessionService(
            ScriptedSession(active, attempt, question_run, card, None),
        ).reveal_question_hint(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
        )
    )

    assert result.question_card is card
    assert card.answer_hints == []
    assert card.answer_hints_revealed is True
    assert active.version == 5


def test_reveal_question_works_for_a_retry_without_creating_generation_records() -> (
    None
):
    records = _retry_review_records("retryCurrent")
    active = records["active"]
    original = records["attempt"]
    question_run = records["question_run"]
    card = records["card"]
    assert isinstance(active, PracticeSession)
    assert isinstance(original, PracticeAttempt)
    assert isinstance(question_run, AgentRun)
    assert isinstance(card, QuestionCard)
    original.status = PracticeAttemptStatus.COMPLETED.value
    retry = PracticeAttempt(
        id=uuid4(),
        user_id=active.user_id,
        session_id=active.id,
        attempt_number=original.attempt_number + 1,
        question_type=original.question_type,
        difficulty=original.difficulty,
        status=PracticeAttemptStatus.ANSWERING.value,
        question_generation_run_id=None,
        question_card_id=card.id,
        retry_of_attempt_id=original.id,
        created_at=NOW,
        updated_at=NOW,
        completed_at=None,
    )
    scripted = ScriptedSession(
        active,
        retry,
        original,
        question_run,
        card,
        card,
        None,
    )

    result = asyncio.run(
        service(scripted).reveal_question_hint(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=active.version,
            question_id=card.id,
        )
    )

    assert result.attempt is retry
    assert result.question_card is card
    assert retry.question_generation_run_id is None
    assert retry.question_card_id == original.question_card_id == card.id
    assert card.answer_hints_revealed is True
    assert scripted.added == []
    assert scripted.commit_count == 1


def test_reveal_follow_up_hint_and_framework_only_update_the_pending_question() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status=PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value,
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up_run_value = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    pending = follow_up_question(
        attempt_id=attempt.id,
        run_id=follow_up_run_value.id,
    )
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up_run_value.id,
        action="askFollowUp",
        question_id=pending.id,
    )
    original_attempt_updated_at = attempt.updated_at
    original_card_hints = card.answer_hints_revealed
    scripted_values = (
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up_run_value,
        decision,
        pending,
    )

    first_session = ScriptedSession(*scripted_values)
    result = asyncio.run(
        PracticeSessionService(
            first_session,
            clock=lambda: NOW + timedelta(minutes=6),
        ).reveal_follow_up_hint(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
            follow_up_question_id=pending.id,
        )
    )

    assert isinstance(result, PracticePrimaryAnswerWorkflowContext)
    assert result.follow_up_question is pending
    assert pending.answer_hints_revealed is True
    assert pending.answer_framework_revealed is False
    assert card.answer_hints_revealed is original_card_hints
    assert card.answer_framework_revealed is False
    assert active.version == 5
    assert attempt.status == PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
    assert attempt.updated_at == original_attempt_updated_at
    assert first_session.commit_count == 1

    second_session = ScriptedSession(*scripted_values)
    result = asyncio.run(
        PracticeSessionService(
            second_session,
            clock=lambda: NOW + timedelta(minutes=7),
        ).reveal_follow_up_framework(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=5,
            question_id=card.id,
            follow_up_question_id=pending.id,
        )
    )

    assert result.follow_up_question is pending
    assert pending.answer_hints_revealed is True
    assert pending.answer_framework_revealed is True
    assert active.version == 6
    assert second_session.commit_count == 1

    third_session = ScriptedSession(*scripted_values)
    asyncio.run(
        PracticeSessionService(
            third_session,
            clock=lambda: NOW + timedelta(minutes=8),
        ).reveal_follow_up_framework(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=6,
            question_id=card.id,
            follow_up_question_id=pending.id,
        )
    )

    assert pending.answer_hints_revealed is True
    assert pending.answer_framework_revealed is True
    assert active.version == 7
    assert third_session.commit_count == 1


def test_reveal_follow_up_rejects_an_old_follow_up_when_a_new_one_is_pending() -> None:
    records = _order2_refresh_records(
        attempt_status=PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value,
        order2_status=AgentRunStatus.SUCCEEDED,
        order2_action="askFollowUp",
        include_order2_question=True,
    )
    active = records["active"]
    card = records["card"]
    question_1 = records["question_1"]
    question_2 = records["question_2"]
    assert isinstance(active, PracticeSession)
    assert isinstance(card, QuestionCard)
    assert isinstance(question_1, PracticeFollowUpQuestion)
    assert isinstance(question_2, PracticeFollowUpQuestion)
    scripted = ScriptedSession(*records["scripted_values"])

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).reveal_follow_up_hint(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=5,
                question_id=card.id,
                follow_up_question_id=question_1.id,
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert question_1.answer_hints_revealed is False
    assert question_2.answer_hints_revealed is False
    assert active.version == 5
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1

    wrong_main_scripted = ScriptedSession(*records["scripted_values"])
    with pytest.raises(PracticeSessionStateError) as wrong_main_error:
        asyncio.run(
            service(wrong_main_scripted).reveal_follow_up_hint(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=5,
                question_id=uuid4(),
                follow_up_question_id=question_2.id,
            )
        )

    assert wrong_main_error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert active.version == 5
    assert wrong_main_scripted.commit_count == 0


@pytest.mark.parametrize(
    "attempt_status",
    [
        PracticeAttemptStatus.GENERATING_QUESTION.value,
        PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value,
        PracticeAttemptStatus.EVALUATING.value,
        PracticeAttemptStatus.REVIEW.value,
    ],
)
def test_reveal_question_rejects_non_answering_attempt_states(
    attempt_status: str,
) -> None:
    active, attempt, _question_run, card = primary_answer_context(
        version=4,
        attempt_status=attempt_status,
    )
    scripted = ScriptedSession(active, attempt)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).reveal_question_hint(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert card.answer_hints_revealed is False
    assert active.version == 4
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_reveal_question_rejects_a_generating_follow_up_shape() -> None:
    active, attempt, question_run, card = primary_answer_context(version=4)
    answer = main_answer(attempt_id=attempt.id)
    scripted = ScriptedSession(active, attempt, question_run, card, answer)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).reveal_question_hint(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert card.answer_hints_revealed is False
    assert active.version == 4
    assert scripted.commit_count == 0


def test_reveal_question_rejects_completed_session_wrong_version_owner_and_question() -> (
    None
):
    active, attempt, question_run, card = primary_answer_context(version=4)
    active.status = PracticeSessionStatus.COMPLETED.value
    completed_session = ScriptedSession(active)

    with pytest.raises(PracticeSessionStateError) as completed_error:
        asyncio.run(
            service(completed_session).reveal_question_hint(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
            )
        )
    assert completed_error.value.code == PRACTICE_SESSION_STATE_CONFLICT

    active.status = PracticeSessionStatus.ACTIVE.value
    wrong_version_session = ScriptedSession(active)
    with pytest.raises(PracticeSessionStateError) as version_error:
        asyncio.run(
            service(wrong_version_session).reveal_question_hint(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=3,
                question_id=card.id,
            )
        )
    assert version_error.value.code == PRACTICE_SESSION_VERSION_CONFLICT

    owner_session = ScriptedSession(None)
    with pytest.raises(PracticeSessionStateError) as owner_error:
        asyncio.run(
            service(owner_session).reveal_question_hint(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
            )
        )
    assert owner_error.value.code == PRACTICE_SESSION_NOT_FOUND

    wrong_question_session = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        None,
    )
    with pytest.raises(PracticeSessionStateError) as question_error:
        asyncio.run(
            service(wrong_question_session).reveal_question_hint(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=uuid4(),
            )
        )
    assert question_error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert card.answer_hints_revealed is False
    assert active.version == 4


def test_reveal_question_does_not_replay_a_prior_version() -> None:
    active, _attempt, _question_run, card = primary_answer_context(version=5)
    card.answer_hints_revealed = True
    scripted = ScriptedSession(active)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).reveal_question_hint(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
            )
        )

    assert error.value.code == PRACTICE_SESSION_VERSION_CONFLICT
    assert card.answer_hints_revealed is True
    assert active.version == 5
    assert scripted.commit_count == 0


@pytest.mark.parametrize(
    "attempt_status",
    [
        PracticeAttemptStatus.ANSWERING.value,
        PracticeAttemptStatus.EVALUATING.value,
        PracticeAttemptStatus.REVIEW.value,
    ],
)
def test_reveal_follow_up_rejects_non_answering_follow_up_states(
    attempt_status: str,
) -> None:
    active, attempt, _question_run, card = primary_answer_context(
        version=4,
        attempt_status=attempt_status,
    )
    scripted = ScriptedSession(active, attempt)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).reveal_follow_up_hint(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
                follow_up_question_id=uuid4(),
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert active.version == 4
    assert scripted.commit_count == 0


def test_set_question_saved_updates_only_the_flag_and_session_snapshot() -> None:
    active, attempt, question_run, card = primary_answer_context(version=4)
    mutation_time = NOW + timedelta(minutes=1)
    original_attempt_status = attempt.status
    original_attempt_updated_at = attempt.updated_at
    original_attempt_completed_at = attempt.completed_at

    result = asyncio.run(
        PracticeSessionService(
            ScriptedSession(active, attempt, question_run, card, None),
            clock=lambda: mutation_time,
        ).set_question_saved(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
            is_saved=True,
        )
    )

    assert result.attempt is attempt
    assert card.is_saved is True
    assert card.is_marked_weak is False
    assert card.updated_at == mutation_time
    assert active.version == 5
    assert active.updated_at == mutation_time
    assert attempt.status == original_attempt_status
    assert attempt.updated_at == original_attempt_updated_at
    assert attempt.completed_at == original_attempt_completed_at


def test_set_question_saved_can_clear_an_existing_flag() -> None:
    active, attempt, question_run, card = primary_answer_context(version=5)
    card.is_saved = True
    mutation_time = NOW + timedelta(minutes=4)

    result = asyncio.run(
        PracticeSessionService(
            ScriptedSession(active, attempt, question_run, card, None),
            clock=lambda: mutation_time,
        ).set_question_saved(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=5,
            question_id=card.id,
            is_saved=False,
        )
    )

    assert result.question_card is card
    assert card.is_saved is False
    assert card.is_marked_weak is False
    assert active.version == 6
    assert card.updated_at == mutation_time


def test_set_question_weak_same_value_still_advances_the_session_version() -> None:
    active, attempt, question_run, card = primary_answer_context(version=7)
    card.is_marked_weak = True
    mutation_time = NOW + timedelta(minutes=2)
    scripted = ScriptedSession(active, attempt, question_run, card, None)

    result = asyncio.run(
        PracticeSessionService(
            scripted,
            clock=lambda: mutation_time,
        ).set_question_weak(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=7,
            question_id=card.id,
            is_marked_weak=True,
        )
    )

    assert result.question_card is card
    assert card.is_saved is False
    assert card.is_marked_weak is True
    assert active.version == 8
    assert active.updated_at == mutation_time
    assert card.updated_at == mutation_time
    assert scripted.commit_count == 1


def test_set_question_weak_can_clear_an_existing_flag_in_review() -> None:
    records = _continue_review_records("retryCurrent")
    active = records["active"]
    scalar_values = records["scalar_values"]
    card = records["card"]
    assert isinstance(active, PracticeSession)
    assert isinstance(scalar_values, list)
    assert isinstance(card, QuestionCard)
    card.is_marked_weak = True

    mutation_time = NOW + timedelta(minutes=5)
    result = asyncio.run(
        PracticeSessionService(
            ScriptedSession(active, *scalar_values[1:]),
            clock=lambda: mutation_time,
        ).set_question_weak(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
            is_marked_weak=False,
        )
    )

    assert isinstance(result, PracticeReviewWorkflowContext)
    assert result.question_card is card
    assert card.is_saved is False
    assert card.is_marked_weak is False
    assert active.version == 5
    assert card.updated_at == mutation_time


def test_set_question_saved_preserves_the_review_workflow_snapshot() -> None:
    records = _continue_review_records("retryCurrent")
    active = records["active"]
    attempt = records["attempt"]
    scalar_values = records["scalar_values"]
    assert isinstance(active, PracticeSession)
    assert isinstance(attempt, PracticeAttempt)
    assert isinstance(scalar_values, list)
    card = records["card"]
    assert isinstance(card, QuestionCard)
    original_attempt_updated_at = attempt.updated_at

    scripted = ScriptedSession(active, *scalar_values[1:])
    mutation_time = NOW + timedelta(minutes=3)
    result = asyncio.run(
        PracticeSessionService(
            scripted,
            clock=lambda: mutation_time,
        ).set_question_saved(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
            is_saved=True,
        )
    )

    assert isinstance(result, PracticeReviewWorkflowContext)
    assert result.attempt is attempt
    assert result.question_card is card
    assert result.attempt.status == PracticeAttemptStatus.REVIEW.value
    assert result.session.version == 5
    assert card.is_saved is True
    assert card.is_marked_weak is False
    assert card.updated_at == mutation_time
    assert attempt.updated_at == original_attempt_updated_at
    assert scripted.commit_count == 1


@pytest.mark.parametrize("method", ["set_question_saved", "set_question_weak"])
def test_question_flag_rejects_old_version_without_mutating_state(method: str) -> None:
    active, attempt, question_run, card = primary_answer_context(version=5)
    original_card_saved = card.is_saved
    original_card_weak = card.is_marked_weak
    scripted = ScriptedSession(active)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            getattr(
                PracticeSessionService(scripted),
                method,
            )(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
                **(
                    {"is_saved": True}
                    if method == "set_question_saved"
                    else {"is_marked_weak": True}
                ),
            )
        )

    assert error.value.code == PRACTICE_SESSION_VERSION_CONFLICT
    assert card.is_saved is original_card_saved
    assert card.is_marked_weak is original_card_weak
    assert active.version == 5
    assert scripted.commit_count == 0


@pytest.mark.parametrize(
    "attempt_status",
    [
        PracticeAttemptStatus.GENERATING_QUESTION.value,
        PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value,
        PracticeAttemptStatus.EVALUATING.value,
    ],
)
def test_question_flag_rejects_non_public_attempt_states(
    attempt_status: str,
) -> None:
    active, attempt, _question_run, card = primary_answer_context(
        version=1,
        attempt_status=attempt_status,
    )
    scripted = ScriptedSession(active, attempt)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            PracticeSessionService(scripted).set_question_saved(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=active.version,
                question_id=card.id,
                is_saved=True,
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert card.is_saved is False
    assert active.version == 1
    assert scripted.commit_count == 0


def test_question_flag_rejects_completed_session_and_wrong_owner() -> None:
    active, _attempt, _question_run, card = primary_answer_context()
    active.status = PracticeSessionStatus.COMPLETED.value
    completed_session = ScriptedSession(active)

    with pytest.raises(PracticeSessionStateError) as completed_error:
        asyncio.run(
            PracticeSessionService(completed_session).set_question_saved(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=active.version,
                question_id=card.id,
                is_saved=True,
            )
        )
    assert completed_error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert card.is_saved is False
    assert completed_session.commit_count == 0

    owner_session = ScriptedSession(None)
    with pytest.raises(PracticeSessionStateError) as owner_error:
        asyncio.run(
            PracticeSessionService(owner_session).set_question_saved(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=active.version,
                question_id=card.id,
                is_saved=True,
            )
        )
    assert owner_error.value.code == PRACTICE_SESSION_NOT_FOUND
    assert card.is_saved is False
    assert owner_session.commit_count == 0


def test_question_flag_rejects_a_non_current_question_without_mutation() -> None:
    active, attempt, question_run, card = primary_answer_context(version=1)
    scripted = ScriptedSession(active, attempt, question_run, card, None)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            PracticeSessionService(scripted).set_question_saved(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=active.version,
                question_id=uuid4(),
                is_saved=True,
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert card.is_saved is False
    assert active.version == 1
    assert scripted.commit_count == 0


def follow_up_decision(
    *,
    attempt_id: UUID,
    run_id: UUID,
    action: str,
    question_id: UUID | None = None,
    order: int = 1,
) -> PracticeFollowUpDecision:
    return PracticeFollowUpDecision(
        id=uuid4(),
        attempt_id=attempt_id,
        source_agent_run_id=run_id,
        order=order,
        action=action,
        follow_up_question_id=question_id,
        created_at=NOW,
    )


def follow_up_question(
    *,
    attempt_id: UUID,
    run_id: UUID,
    question_id: UUID | None = None,
    order: int = 1,
) -> PracticeFollowUpQuestion:
    return PracticeFollowUpQuestion(
        id=question_id or uuid4(),
        attempt_id=attempt_id,
        source_agent_run_id=run_id,
        order=order,
        prompt="What metric changed?",
        focus="Evidence",
        answer_hints=["Name the metric."],
        answer_framework=["Baseline", "Result"],
        answer_hints_revealed=False,
        answer_framework_revealed=False,
        created_at=NOW,
    )


def evaluation_run(
    *,
    user_id: UUID,
    attempt_id: UUID,
    question_card_id: UUID,
    main_answer_id: UUID,
    decision_id: UUID,
    status: AgentRunStatus = AgentRunStatus.QUEUED,
    follow_up_completion_reason: PracticeEvaluationFollowUpCompletionReason = (
        PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
    ),
    follow_up_question_1_id: UUID | None = None,
    follow_up_answer_1_id: UUID | None = None,
    follow_up_question_2_id: UUID | None = None,
    follow_up_answer_2_id: UUID | None = None,
    unanswered_follow_up_question_id: UUID | None = None,
) -> AgentRun:
    payload = EvaluationRunPayload(
        attempt_id=attempt_id,
        question_card_id=question_card_id,
        main_answer_id=main_answer_id,
        interaction_language="en",
        follow_up_completion_reason=(follow_up_completion_reason),
        terminal_follow_up_decision_id=decision_id,
        unanswered_follow_up_question_id=unanswered_follow_up_question_id,
        follow_up_question_1_id=follow_up_question_1_id,
        follow_up_answer_1_id=follow_up_answer_1_id,
        follow_up_question_2_id=follow_up_question_2_id,
        follow_up_answer_2_id=follow_up_answer_2_id,
    )
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="practice-evaluator",
        prompt_id=PRACTICE_EVALUATION_PROMPT.prompt_id,
        prompt_version=PRACTICE_EVALUATION_PROMPT.version,
        output_schema_id=PRACTICE_EVALUATION_PROMPT.output_schema_id,
        status=status,
        payload=payload.model_dump(mode="json", by_alias=True),
        idempotency_key=practice_evaluation_idempotency_key(attempt_id),
        attempt_count=0 if status is AgentRunStatus.QUEUED else 1,
        max_attempts=3,
        available_at=NOW,
        started_at=None if status is AgentRunStatus.QUEUED else NOW,
        finished_at=(
            NOW if status in {AgentRunStatus.SUCCEEDED, AgentRunStatus.FAILED} else None
        ),
        provider="fake" if status is AgentRunStatus.SUCCEEDED else None,
        model="test-model",
        input_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        output_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        result={"overallScore": 80} if status is AgentRunStatus.SUCCEEDED else None,
        error_code="provider_unavailable" if status is AgentRunStatus.FAILED else None,
    )


def evaluation_artifact(
    *,
    attempt_id: UUID,
    run_id: UUID,
) -> PracticeEvaluation:
    return PracticeEvaluation(
        id=uuid4(),
        attempt_id=attempt_id,
        source_agent_run_id=run_id,
        overall_score=80,
        dimension_scores=[
            {
                "dimension": dimension,
                "score": 80,
                "explanation": f"Evidence supports {dimension}.",
            }
            for dimension in (
                "relevance",
                "structure",
                "specificity",
                "communication",
            )
        ],
        focus_assessments=[
            {
                "focusIndex": 0,
                "status": "demonstrated",
                "explanation": "The answer provides evidence.",
            }
        ],
        evaluated_at=NOW,
    )


def review_run(
    *,
    user_id: UUID,
    attempt_id: UUID,
    evaluation_id: UUID,
    status: AgentRunStatus = AgentRunStatus.QUEUED,
    language: str = "en",
    idempotency_key: str | None = None,
) -> AgentRun:
    payload = ReviewRunPayload(
        attempt_id=attempt_id,
        evaluation_id=evaluation_id,
        interaction_language=language,
    )
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="practice-reviewer",
        prompt_id=PRACTICE_REVIEW_PROMPT.prompt_id,
        prompt_version=PRACTICE_REVIEW_PROMPT.version,
        output_schema_id=PRACTICE_REVIEW_PROMPT.output_schema_id,
        status=status,
        payload=payload.model_dump(mode="json", by_alias=True),
        idempotency_key=idempotency_key or practice_review_idempotency_key(attempt_id),
        attempt_count=0 if status is AgentRunStatus.QUEUED else 1,
        max_attempts=3,
        available_at=NOW,
        started_at=None if status is AgentRunStatus.QUEUED else NOW,
        finished_at=(
            NOW if status in {AgentRunStatus.SUCCEEDED, AgentRunStatus.FAILED} else None
        ),
        provider="fake" if status is AgentRunStatus.SUCCEEDED else None,
        model="test-model",
        input_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        output_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        result={"overallPerformance": "Strong answer."}
        if status is AgentRunStatus.SUCCEEDED
        else None,
        error_code="provider_unavailable" if status is AgentRunStatus.FAILED else None,
    )


def review_artifact(
    *,
    attempt_id: UUID,
    run_id: UUID,
    weaknesses: list[str] | None = None,
) -> PracticeReview:
    return PracticeReview(
        id=uuid4(),
        attempt_id=attempt_id,
        source_agent_run_id=run_id,
        overall_performance="Strong answer with a clear result.",
        highlights=["Shows ownership."],
        main_issues=["Attribution evidence is brief."],
        improvement_suggestions=["Name the baseline and result."],
        reusable_answer_structure=["Context", "Evidence", "Result"],
        exposed_weaknesses=weaknesses or ["Attribution evidence"],
        reviewed_at=NOW,
    )


def recommendation_run(
    *,
    user_id: UUID,
    attempt_id: UUID,
    evaluation_id: UUID,
    review_id: UUID,
    status: AgentRunStatus = AgentRunStatus.QUEUED,
    language: str = "en",
    idempotency_key: str | None = None,
) -> AgentRun:
    payload = RecommendationRunPayload(
        attempt_id=attempt_id,
        evaluation_id=evaluation_id,
        review_id=review_id,
        interaction_language=language,
    )
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="practice-recommender",
        prompt_id=PRACTICE_RECOMMENDATION_PROMPT.prompt_id,
        prompt_version=PRACTICE_RECOMMENDATION_PROMPT.version,
        output_schema_id=PRACTICE_RECOMMENDATION_PROMPT.output_schema_id,
        status=status,
        payload=payload.model_dump(mode="json", by_alias=True),
        idempotency_key=idempotency_key
        or practice_recommendation_idempotency_key(attempt_id),
        attempt_count=0 if status is AgentRunStatus.QUEUED else 1,
        max_attempts=3,
        available_at=NOW,
        started_at=None if status is AgentRunStatus.QUEUED else NOW,
        finished_at=(
            NOW if status in {AgentRunStatus.SUCCEEDED, AgentRunStatus.FAILED} else None
        ),
        provider="fake" if status is AgentRunStatus.SUCCEEDED else None,
        model="test-model",
        input_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        output_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        result={"action": "retryCurrent"}
        if status is AgentRunStatus.SUCCEEDED
        else None,
        error_code="provider_unavailable" if status is AgentRunStatus.FAILED else None,
    )


def recommendation_artifact(
    *,
    attempt_id: UUID,
    run_id: UUID,
    action: str = "retryCurrent",
) -> PracticeRecommendation:
    if action == "retryCurrent":
        return PracticeRecommendation(
            id=uuid4(),
            attempt_id=attempt_id,
            source_agent_run_id=run_id,
            action=action,
            reason="Practice the current question again.",
            next_question_type=None,
            next_difficulty=None,
            focus_areas=[],
            recommended_at=NOW,
        )
    return PracticeRecommendation(
        id=uuid4(),
        attempt_id=attempt_id,
        source_agent_run_id=run_id,
        action=action,
        reason="Move to the next focused question.",
        next_question_type="projectDeepDive",
        next_difficulty="basic",
        focus_areas=["Attribution evidence"],
        recommended_at=NOW,
    )


def service(
    session: ScriptedSession,
    fake_generation: FakeGenerationService | None = None,
    fake_follow_up: FakeFollowUpGenerationService | None = None,
    fake_evaluation: FakeEvaluationGenerationService | None = None,
    fake_review: FakeReviewGenerationService | None = None,
    fake_recommendation: FakeRecommendationGenerationService | None = None,
    fake_reference: FakeReferenceAnswerGenerationService | None = None,
) -> PracticeSessionService:
    fake_generation = fake_generation or FakeGenerationService()
    fake_follow_up = fake_follow_up or FakeFollowUpGenerationService()
    fake_evaluation = fake_evaluation or FakeEvaluationGenerationService()
    fake_review = fake_review or FakeReviewGenerationService()
    fake_recommendation = fake_recommendation or FakeRecommendationGenerationService()
    fake_reference = fake_reference or FakeReferenceAnswerGenerationService()
    return PracticeSessionService(
        session,  # type: ignore[arg-type]
        llm_model="test-model",
        question_generation_service_factory=lambda _session, **kwargs: fake_generation,  # type: ignore[arg-type]
        follow_up_generation_service_factory=lambda _session, **kwargs: fake_follow_up,  # type: ignore[arg-type]
        evaluation_generation_service_factory=lambda _session, **kwargs: (
            fake_evaluation
        ),  # type: ignore[arg-type]
        review_generation_service_factory=lambda _session, **kwargs: fake_review,  # type: ignore[arg-type]
        recommendation_generation_service_factory=lambda _session, **kwargs: (
            fake_recommendation
        ),  # type: ignore[arg-type]
        reference_answer_generation_service_factory=lambda _session, **kwargs: (
            fake_reference
        ),  # type: ignore[arg-type]
        clock=lambda: NOW,
    )


def main_reference_request_values(
    active: PracticeSession,
    attempt: PracticeAttempt,
    question_run: AgentRun,
    card: QuestionCard,
) -> list[object]:
    question_run.idempotency_key = practice_question_generation_idempotency_key(
        active.id,
        attempt.id,
    )
    return [active, attempt, question_run, card, None, *([None] * 7)]


def follow_up_reference_request_values(
    active: PracticeSession,
    attempt: PracticeAttempt,
    question_run: AgentRun,
    card: QuestionCard,
    main: PracticeAnswer,
    follow_up_generation_run: AgentRun,
    decision: PracticeFollowUpDecision,
    question: PracticeFollowUpQuestion,
) -> list[object]:
    return [
        active,
        attempt,
        question_run,
        card,
        main,
        follow_up_generation_run,
        decision,
        question,
    ]


def test_request_question_reference_answer_enqueues_and_advances_only_session_version() -> (
    None
):
    active, attempt, question_run, card = primary_answer_context(version=4)
    original_attempt_updated_at = attempt.updated_at
    reference_run = reference_answer_run(user_id=active.user_id)
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        state=reference_answer_state(reference_run),
    )
    scripted = ScriptedSession(
        *main_reference_request_values(active, attempt, question_run, card)
    )

    result = asyncio.run(
        service(
            scripted, fake_reference=fake_reference
        ).request_question_reference_answer(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
        )
    )

    assert result.target_type is PracticeReferenceAnswerTargetType.MAIN
    assert result.follow_up_question is None
    assert result.generation_state.status is (
        PracticeReferenceAnswerLifecycleStatus.GENERATING
    )
    assert result.generation_state.generation_run is reference_run
    assert active.version == 5
    assert attempt.status == PracticeAttemptStatus.ANSWERING.value
    assert attempt.updated_at == original_attempt_updated_at
    assert fake_reference.main_calls == [
        {
            "user_id": active.user_id,
            "question_card_id": card.id,
            "idempotency_key": practice_main_reference_answer_idempotency_key(card.id),
        }
    ]
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


def test_request_question_reference_answer_reuses_stable_run_with_latest_version() -> (
    None
):
    active, attempt, question_run, card = primary_answer_context(version=4)
    reference_run = reference_answer_run(user_id=active.user_id)
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        state=reference_answer_state(reference_run),
    )

    first_session = ScriptedSession(
        *main_reference_request_values(active, attempt, question_run, card)
    )
    first = asyncio.run(
        service(
            first_session,
            fake_reference=fake_reference,
        ).request_question_reference_answer(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
        )
    )
    second_session = ScriptedSession(
        *main_reference_request_values(active, attempt, question_run, card)
    )
    second = asyncio.run(
        service(
            second_session,
            fake_reference=fake_reference,
        ).request_question_reference_answer(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=5,
            question_id=card.id,
        )
    )

    assert first.generation_state.generation_run is reference_run
    assert second.generation_state.generation_run is reference_run
    assert active.version == 6
    assert len(fake_reference.main_calls) == 2
    assert first_session.commit_count == 1
    assert second_session.commit_count == 1


def test_request_question_reference_answer_rejects_stale_version_and_unavailable_enqueue_rolls_back() -> (
    None
):
    active, attempt, question_run, card = primary_answer_context(version=4)
    reference_run = reference_answer_run(user_id=active.user_id)
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        state=reference_answer_state(reference_run),
        error=ValueError("reference model is unavailable"),
    )
    scripted = ScriptedSession(
        *main_reference_request_values(active, attempt, question_run, card)
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_reference=fake_reference,
            ).request_question_reference_answer(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
            )
        )

    assert error.value.code == PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE
    assert active.version == 4
    assert active.updated_at == NOW
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1

    stale_session = ScriptedSession(active)
    with pytest.raises(PracticeSessionStateError) as stale_error:
        asyncio.run(
            service(
                stale_session,
                fake_reference=FakeReferenceAnswerGenerationService(
                    run=reference_run,
                    state=reference_answer_state(reference_run),
                ),
            ).request_question_reference_answer(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=3,
                question_id=card.id,
            )
        )
    assert stale_error.value.code == PRACTICE_SESSION_VERSION_CONFLICT
    assert stale_session.rollback_count == 1


def test_refresh_question_reference_answer_is_read_like_and_preserves_version() -> None:
    active, attempt, question_run, card = primary_answer_context(version=4)
    reference_run = reference_answer_run(user_id=active.user_id)
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        state=reference_answer_state(reference_run),
    )
    scripted = ScriptedSession(
        *main_reference_request_values(active, attempt, question_run, card)
    )

    result = asyncio.run(
        service(
            scripted,
            fake_reference=fake_reference,
        ).refresh_question_reference_answer(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
        )
    )

    assert result.generation_state.status is (
        PracticeReferenceAnswerLifecycleStatus.GENERATING
    )
    assert active.version == 4
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0
    assert fake_reference.main_calls == []


def test_request_question_reference_answer_rejects_existing_main_answer() -> None:
    active, attempt, question_run, card = primary_answer_context(version=4)
    answer = main_answer(attempt_id=attempt.id)
    question_run.idempotency_key = practice_question_generation_idempotency_key(
        active.id,
        attempt.id,
    )
    scripted = ScriptedSession(active, attempt, question_run, card, answer)
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_answer_run(user_id=active.user_id),
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_reference=fake_reference,
            ).request_question_reference_answer(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert fake_reference.main_calls == []
    assert active.version == 4


def test_request_follow_up_reference_answer_enqueues_only_current_pending_question() -> (
    None
):
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status=PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value,
    )
    main = main_answer(attempt_id=attempt.id)
    follow_up_generation_run = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=main.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    question = follow_up_question(
        attempt_id=attempt.id,
        run_id=follow_up_generation_run.id,
    )
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up_generation_run.id,
        action="askFollowUp",
        question_id=question.id,
    )
    reference_run = reference_answer_run(user_id=active.user_id)
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        state=reference_answer_state(reference_run),
    )
    scripted = ScriptedSession(
        *follow_up_reference_request_values(
            active,
            attempt,
            question_run,
            card,
            main,
            follow_up_generation_run,
            decision,
            question,
        )
    )

    result = asyncio.run(
        service(
            scripted,
            fake_reference=fake_reference,
        ).request_follow_up_reference_answer(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
            follow_up_question_id=question.id,
        )
    )

    assert result.target_type is PracticeReferenceAnswerTargetType.FOLLOW_UP
    assert result.follow_up_question is question
    assert active.version == 5
    assert attempt.status == PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value
    assert fake_reference.follow_up_calls == [
        {
            "user_id": active.user_id,
            "question_card_id": card.id,
            "follow_up_question_id": question.id,
            "idempotency_key": practice_follow_up_reference_answer_idempotency_key(
                question.id
            ),
        }
    ]
    assert scripted.commit_count == 1


def test_refresh_follow_up_reference_answer_preserves_version_and_rejects_wrong_question() -> (
    None
):
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status=PracticeAttemptStatus.ANSWERING_FOLLOW_UP.value,
    )
    main = main_answer(attempt_id=attempt.id)
    follow_up_generation_run = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=main.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    question = follow_up_question(
        attempt_id=attempt.id,
        run_id=follow_up_generation_run.id,
    )
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up_generation_run.id,
        action="askFollowUp",
        question_id=question.id,
    )
    reference_run = reference_answer_run(user_id=active.user_id)
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        state=reference_answer_state(reference_run),
    )
    scripted = ScriptedSession(
        *follow_up_reference_request_values(
            active,
            attempt,
            question_run,
            card,
            main,
            follow_up_generation_run,
            decision,
            question,
        )
    )

    refreshed = asyncio.run(
        service(
            scripted,
            fake_reference=fake_reference,
        ).refresh_follow_up_reference_answer(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
            follow_up_question_id=question.id,
        )
    )

    assert refreshed.generation_state.status is (
        PracticeReferenceAnswerLifecycleStatus.GENERATING
    )
    assert active.version == 4
    assert scripted.commit_count == 0
    assert fake_reference.follow_up_calls == []

    wrong_session = ScriptedSession(
        *follow_up_reference_request_values(
            active,
            attempt,
            question_run,
            card,
            main,
            follow_up_generation_run,
            decision,
            question,
        )
    )
    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                wrong_session,
                fake_reference=fake_reference,
            ).request_follow_up_reference_answer(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
                follow_up_question_id=uuid4(),
            )
        )
    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT


def test_request_question_reference_answer_on_retry_reuses_question_card_target() -> (
    None
):
    records = _retry_review_records("retryCurrent")
    active = records["active"]
    original = records["attempt"]
    question_run = records["question_run"]
    card = records["card"]
    assert isinstance(active, PracticeSession)
    assert isinstance(original, PracticeAttempt)
    assert isinstance(question_run, AgentRun)
    assert isinstance(card, QuestionCard)
    original.status = PracticeAttemptStatus.COMPLETED.value
    original.completed_at = NOW - timedelta(minutes=1)
    question_run.idempotency_key = practice_question_generation_idempotency_key(
        active.id,
        original.id,
    )
    retry = PracticeAttempt(
        id=uuid4(),
        user_id=active.user_id,
        session_id=active.id,
        attempt_number=original.attempt_number + 1,
        question_type=original.question_type,
        difficulty=original.difficulty,
        status=PracticeAttemptStatus.ANSWERING.value,
        question_generation_run_id=None,
        question_card_id=card.id,
        retry_of_attempt_id=original.id,
        created_at=NOW,
        updated_at=NOW,
        completed_at=None,
    )
    reference_run = reference_answer_run(user_id=active.user_id)
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        state=reference_answer_state(
            reference_run,
            PracticeReferenceAnswerLifecycleStatus.REVEALED,
        ),
    )
    scripted = ScriptedSession(
        active,
        retry,
        original,
        question_run,
        card,
        None,
        *([None] * 7),
    )

    result = asyncio.run(
        service(
            scripted,
            fake_reference=fake_reference,
        ).request_question_reference_answer(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=active.version,
            question_id=card.id,
        )
    )

    assert result.question_card is card
    assert result.attempt is retry
    assert result.generation_state.status is (
        PracticeReferenceAnswerLifecycleStatus.REVEALED
    )
    assert fake_reference.main_calls[0]["question_card_id"] == card.id
    assert active.version == 5


def evaluation_pipeline(
    *,
    evaluation_status: AgentRunStatus = AgentRunStatus.SUCCEEDED,
    evaluation_artifact_present: bool = True,
    review_status: AgentRunStatus | None = None,
    review_artifact_present: bool = True,
    recommendation_status: AgentRunStatus | None = None,
    recommendation_artifact_present: bool = True,
    recommendation_action: str = "retryCurrent",
    attempt_status: str = "evaluating",
) -> dict[str, object]:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status=attempt_status,
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="complete",
    )
    evaluation = evaluation_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        decision_id=decision.id,
        status=evaluation_status,
    )
    evaluation_value = (
        evaluation_artifact(
            attempt_id=attempt.id,
            run_id=evaluation.id,
        )
        if evaluation_artifact_present and evaluation_status is AgentRunStatus.SUCCEEDED
        else None
    )
    review = None
    review_value = None
    if review_status is not None:
        review = review_run(
            user_id=active.user_id,
            attempt_id=attempt.id,
            evaluation_id=evaluation_value.id
            if evaluation_value is not None
            else uuid4(),
            status=review_status,
        )
        if review_artifact_present and review_status is AgentRunStatus.SUCCEEDED:
            review_value = review_artifact(
                attempt_id=attempt.id,
                run_id=review.id,
            )
    recommendation = None
    recommendation_value = None
    if recommendation_status is not None:
        recommendation = recommendation_run(
            user_id=active.user_id,
            attempt_id=attempt.id,
            evaluation_id=evaluation_value.id
            if evaluation_value is not None
            else uuid4(),
            review_id=review_value.id if review_value is not None else uuid4(),
            status=recommendation_status,
        )
        if (
            recommendation_artifact_present
            and recommendation_status is AgentRunStatus.SUCCEEDED
        ):
            recommendation_value = recommendation_artifact(
                attempt_id=attempt.id,
                run_id=recommendation.id,
                action=recommendation_action,
            )

    scalar_values: list[object] = [
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up,
        decision,
        None,
        evaluation,
    ]
    if evaluation_status is AgentRunStatus.SUCCEEDED:
        scalar_values.append(evaluation_value)
        scalar_values.append(review)
        if review is not None and review_status is AgentRunStatus.SUCCEEDED:
            scalar_values.append(review_value)
        scalar_values.append(recommendation)
        if (
            recommendation is not None
            and recommendation_status is AgentRunStatus.SUCCEEDED
        ):
            scalar_values.append(recommendation_value)

    return {
        "active": active,
        "attempt": attempt,
        "question_run": question_run,
        "card": card,
        "answer": answer,
        "follow_up": follow_up,
        "decision": decision,
        "evaluation": evaluation,
        "evaluation_value": evaluation_value,
        "review": review,
        "review_value": review_value,
        "recommendation": recommendation,
        "recommendation_value": recommendation_value,
        "scalar_values": scalar_values,
    }


def evaluation_pipeline_with_two_follow_ups(
    *,
    ended_early: bool = False,
) -> dict[str, object]:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status="evaluating",
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    first_follow_up_run = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
        order=1,
    )
    first_question = follow_up_question(
        attempt_id=attempt.id,
        run_id=first_follow_up_run.id,
        order=1,
    )
    first_decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=first_follow_up_run.id,
        action="askFollowUp",
        question_id=first_question.id,
        order=1,
    )
    first_answer = PracticeAnswer(
        id=uuid4(),
        attempt_id=attempt.id,
        kind=PracticeAnswerKind.FOLLOW_UP.value,
        order=2,
        content="First follow-up answer",
        follow_up_question_id=first_question.id,
        submitted_at=NOW,
    )
    second_follow_up_run = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
        order=2,
        previous_question_id=first_question.id,
        previous_answer_id=first_answer.id,
    )
    second_question = follow_up_question(
        attempt_id=attempt.id,
        run_id=second_follow_up_run.id,
        order=2,
    )
    second_decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=second_follow_up_run.id,
        action="askFollowUp",
        question_id=second_question.id,
        order=2,
    )
    second_answer = None
    completion_reason = (
        PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
        if ended_early
        else PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
    )
    if not ended_early:
        second_answer = PracticeAnswer(
            id=uuid4(),
            attempt_id=attempt.id,
            kind=PracticeAnswerKind.FOLLOW_UP.value,
            order=3,
            content="Second follow-up answer",
            follow_up_question_id=second_question.id,
            submitted_at=NOW,
        )
    evaluation = evaluation_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        decision_id=second_decision.id,
        status=AgentRunStatus.SUCCEEDED,
        follow_up_completion_reason=completion_reason,
        follow_up_question_1_id=first_question.id,
        follow_up_answer_1_id=first_answer.id,
        follow_up_question_2_id=second_question.id if second_answer else None,
        follow_up_answer_2_id=second_answer.id if second_answer else None,
        unanswered_follow_up_question_id=(second_question.id if ended_early else None),
    )
    evaluation_value = evaluation_artifact(
        attempt_id=attempt.id,
        run_id=evaluation.id,
    )
    review = review_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        evaluation_id=evaluation_value.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    review_value = review_artifact(
        attempt_id=attempt.id,
        run_id=review.id,
    )
    recommendation = recommendation_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        evaluation_id=evaluation_value.id,
        review_id=review_value.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    recommendation_value = recommendation_artifact(
        attempt_id=attempt.id,
        run_id=recommendation.id,
    )
    return {
        "active": active,
        "attempt": attempt,
        "question_run": question_run,
        "card": card,
        "answer": answer,
        "first_follow_up_run": first_follow_up_run,
        "first_question": first_question,
        "first_decision": first_decision,
        "first_answer": first_answer,
        "second_follow_up_run": second_follow_up_run,
        "second_question": second_question,
        "second_decision": second_decision,
        "second_answer": second_answer,
        "evaluation": evaluation,
        "evaluation_value": evaluation_value,
        "review": review,
        "review_value": review_value,
        "recommendation": recommendation,
        "recommendation_value": recommendation_value,
        "scalar_values": [
            active,
            attempt,
            question_run,
            card,
            answer,
            first_follow_up_run,
            first_decision,
            first_question,
            second_follow_up_run,
            second_decision,
            second_question,
            evaluation,
            evaluation_value,
            review,
            review_value,
            recommendation,
            recommendation_value,
            first_answer,
            *([second_answer] if second_answer is not None else []),
        ],
    }


def test_start_session_creates_session_attempt_and_run_in_one_outer_commit() -> None:
    user_id = uuid4()
    role_id = uuid4()
    selected = selection(target_role_id=role_id)
    run_payload = generation_payload(role_id=role_id)
    run = generation_run(user_id=user_id, payload=run_payload)
    fake_generation = FakeGenerationService(run)
    session = ScriptedSession(user_id, None)

    result = asyncio.run(
        service(session, fake_generation).start_session(
            user_id=user_id,
            selection=selected,
            interaction_language="en",
        )
    )

    assert result.session.status == "active"
    assert result.session.version == 1
    assert result.session.language == "en"
    assert result.session.initial_question_type == "projectDeepDive"
    assert result.session.initial_difficulty == "basic"
    assert result.session.source == "personalized"
    assert result.session.prioritize_weaknesses is False
    assert result.attempt.attempt_number == 1
    assert result.attempt.status == "generatingQuestion"
    assert result.attempt.question_type == "projectDeepDive"
    assert result.attempt.difficulty == "basic"
    assert result.attempt.question_generation_run_id == run.id
    assert result.attempt.question_generation_run is run
    assert result.question_generation_run is run
    assert result.question_card is None
    assert session.added == [result.session, result.attempt]
    assert session.commit_count == 1
    assert session.rollback_count == 0
    assert fake_generation.calls[0]["interaction_language"] == "en"
    assert fake_generation.calls[0]["target_role_id"] == role_id
    assert fake_generation.calls[0]["idempotency_key"] == (
        f"practice-session:{result.session.id}:"
        f"attempt:{result.attempt.id}:question-generation"
    )
    assert all(
        getattr(statement, "_for_update_arg", None) is not None
        for statement in session.statements
    )


def test_start_session_maps_generation_prerequisite_and_rolls_back() -> None:
    user_id = uuid4()
    role_id = uuid4()
    fake_generation = FakeGenerationService(
        error=QuestionGenerationStateError(
            "question_generation_matching_analysis_stale"
        )
    )
    session = ScriptedSession(user_id, None)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(session, fake_generation).start_session(
                user_id=user_id,
                selection=selection(target_role_id=role_id),
                interaction_language="en",
            )
        )

    assert error.value.code == PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED
    assert error.value.source_code == "question_generation_matching_analysis_stale"
    assert str(error.value) == PracticeSessionStateError.safe_message
    assert session.commit_count == 0
    assert session.rollback_count == 1


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("history", PRACTICE_SESSION_SOURCE_UNAVAILABLE),
    ],
)
def test_start_session_rejects_unavailable_sources(
    source: str,
    expected: str,
) -> None:
    user_id = uuid4()
    session = ScriptedSession(user_id, None, None)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(session).start_session(
                user_id=user_id,
                selection=selection(source=source),
                interaction_language="en",
            )
        )

    assert error.value.code == expected
    assert session.rollback_count == 1


def test_start_session_rejects_saved_without_an_eligible_question_card() -> None:
    user_id = uuid4()
    session = ScriptedSession(user_id, None, None)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(session).start_session(
                user_id=user_id,
                selection=selection(source="saved"),
                interaction_language="en",
            )
        )

    assert error.value.code == PRACTICE_SESSION_SOURCE_UNAVAILABLE
    assert session.commit_count == 0
    assert session.rollback_count == 1


def test_setup_capabilities_expose_only_currently_supported_sources() -> None:
    role_id = uuid4()
    result = asyncio.run(
        PracticeSessionService(
            ScriptedSession(
                execute_results=[
                    [(role_id, "projectDeepDive", "basic", 3)],
                    [],
                    [],
                ]
            ),  # type: ignore[arg-type]
        ).get_setup_capabilities(
            user_id=uuid4(),
            interaction_language="en",
        )
    )

    assert result.saved_question_count == 3
    assert result.history_question_count == 0
    assert result.can_prioritize_weaknesses is False
    assert [
        item.model_dump(mode="json") for item in result.question_source_availability
    ] == [
        {
            "targetRoleId": str(role_id),
            "questionType": "projectDeepDive",
            "difficulty": "basic",
            "savedQuestionCount": 3,
            "historyQuestionCount": 0,
        }
    ]


def test_setup_capabilities_enable_weakness_prioritization_for_eligible_review() -> (
    None
):
    user_id = uuid4()
    role_id = uuid4()
    session = ScriptedSession(
        execute_results=[
            [],
            [],
            [
                (
                    uuid4(),
                    role_id,
                    "projectDeepDive",
                    NOW,
                    ["Ownership evidence"],
                )
            ],
        ],
    )

    result = asyncio.run(
        PracticeSessionService(session).get_setup_capabilities(
            user_id=user_id,
            interaction_language="en",
        )
    )

    assert result.can_prioritize_weaknesses is True


def test_start_session_rejects_weakness_prioritization_without_eligible_weakness() -> (
    None
):
    user_id = uuid4()
    session = ScriptedSession(user_id, None)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(session).start_session(
                user_id=user_id,
                selection=selection(prioritize_weaknesses=True),
                interaction_language="en",
            )
        )

    assert error.value.code == PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE
    assert session.rollback_count == 1


def test_start_session_persists_priority_and_snapshots_weakness_focus() -> None:
    user_id = uuid4()
    role_id = uuid4()
    source_attempt_id = uuid4()
    run = generation_run(
        user_id=user_id,
        payload=generation_payload(role_id=role_id),
    )
    fake_generation = FakeGenerationService(run)
    session = ScriptedSession(
        user_id,
        None,
        execute_rows=[
            (
                source_attempt_id,
                role_id,
                "projectDeepDive",
                NOW,
                ["Ownership evidence"],
            )
        ],
    )

    result = asyncio.run(
        service(session, fake_generation=fake_generation).start_session(
            user_id=user_id,
            selection=selection(
                target_role_id=role_id,
                prioritize_weaknesses=True,
            ),
            interaction_language="en",
        )
    )

    assert result.session.prioritize_weaknesses is True
    assert fake_generation.calls[0]["weakness_focus"].evidence[0].weakness == (
        "Ownership evidence"
    )


def test_start_session_same_intent_returns_existing_active_workflow() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    payload = generation_payload(role_id=role_id)
    run = generation_run(user_id=user_id, payload=payload)
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
    )
    fake_generation = FakeGenerationService()
    session = ScriptedSession(user_id, active, attempt, run)

    result = asyncio.run(
        service(session, fake_generation).start_session(
            user_id=user_id,
            selection=selection(target_role_id=role_id),
            interaction_language="en",
        )
    )

    assert result.session is active
    assert result.attempt is attempt
    assert result.question_generation_run is run
    assert result.question_card is None
    assert fake_generation.calls == []
    assert session.added == []
    assert session.commit_count == 1


@pytest.mark.parametrize(
    "changed_selection",
    [
        selection(target_role_id=uuid4()),
        selection(question_type=QuestionCardQuestionType.BEHAVIORAL),
        selection(difficulty=QuestionCardDifficulty.PRESSURE),
    ],
)
def test_start_session_rejects_different_intent_while_active(
    changed_selection: PracticeSessionSelection,
) -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    session = ScriptedSession(user_id, active)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(session).start_session(
                user_id=user_id,
                selection=changed_selection,
                interaction_language="en",
            )
        )

    assert error.value.code == PRACTICE_SESSION_ALREADY_ACTIVE
    assert session.commit_count == 0
    assert session.rollback_count == 1


def test_start_session_rejects_active_session_without_attempt() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    session = ScriptedSession(user_id, active, None)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(session).start_session(
                user_id=user_id,
                selection=selection(target_role_id=role_id),
                interaction_language="en",
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert session.rollback_count == 1


@pytest.mark.parametrize(
    "run_status",
    [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING],
)
def test_refresh_queued_or_running_does_not_change_version_or_attempt(
    run_status: AgentRunStatus,
) -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    payload = generation_payload(role_id=role_id)
    run = generation_run(user_id=user_id, payload=payload, status=run_status)
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
    )
    session = ScriptedSession(active, attempt, run)

    result = asyncio.run(
        service(session).refresh_question_generation(
            user_id=user_id,
            session_id=active.id,
            expected_version=1,
        )
    )

    assert result.question_card is None
    assert result.session.version == 1
    assert result.attempt.status == "generatingQuestion"
    assert result.attempt.question_card_id is None
    assert session.commit_count == 1
    assert session.rollback_count == 0


def test_refresh_succeeded_links_card_and_increments_session_version() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    payload = generation_payload(role_id=role_id)
    run = generation_run(
        user_id=user_id,
        payload=payload,
        status=AgentRunStatus.SUCCEEDED,
    )
    card = question_card(user_id=user_id, role_id=role_id, run_id=run.id)
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
    )
    session = ScriptedSession(active, attempt, run, card)

    result = asyncio.run(
        service(session).refresh_question_generation(
            user_id=user_id,
            session_id=active.id,
            expected_version=1,
        )
    )

    assert result.question_card is card
    assert result.attempt.question_card_id == card.id
    assert result.attempt.question_card is card
    assert result.attempt.status == "answering"
    assert result.session.version == 2
    assert result.session.language == "en"
    assert result.session.initial_question_type == "projectDeepDive"
    assert result.session.initial_difficulty == "basic"
    assert session.commit_count == 1
    assert session.rollback_count == 0


def test_refresh_failed_raises_without_changing_session_state() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    payload = generation_payload(role_id=role_id)
    run = generation_run(
        user_id=user_id,
        payload=payload,
        status=AgentRunStatus.FAILED,
    )
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
    )
    session = ScriptedSession(active, attempt, run)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(session).refresh_question_generation(
                user_id=user_id,
                session_id=active.id,
                expected_version=1,
            )
        )

    assert error.value.code == PRACTICE_QUESTION_GENERATION_FAILED
    assert error.value.source_code == "provider_unavailable"
    assert active.version == 1
    assert attempt.status == "generatingQuestion"
    assert session.commit_count == 0
    assert session.rollback_count == 1


@pytest.mark.parametrize(
    ("scalar_values", "expected"),
    [
        ((None,), PRACTICE_SESSION_NOT_FOUND),
        (
            (practice_session(user_id=uuid4(), role_id=uuid4(), version=3),),
            PRACTICE_SESSION_VERSION_CONFLICT,
        ),
    ],
)
def test_refresh_rejects_missing_or_stale_session(
    scalar_values: tuple[object, ...],
    expected: str,
) -> None:
    user_id = uuid4()
    session_id = uuid4()
    scripted = ScriptedSession(*scalar_values)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).refresh_question_generation(
                user_id=user_id,
                session_id=session_id,
                expected_version=1,
            )
        )

    assert error.value.code == expected
    assert scripted.rollback_count == 1


def test_refresh_rejects_completed_session_and_wrong_attempt_state() -> None:
    user_id = uuid4()
    role_id = uuid4()
    completed = practice_session(
        user_id=user_id,
        role_id=role_id,
        status="completed",
    )
    completed_session = ScriptedSession(completed)

    with pytest.raises(PracticeSessionStateError) as completed_error:
        asyncio.run(
            service(completed_session).refresh_question_generation(
                user_id=user_id,
                session_id=completed.id,
                expected_version=1,
            )
        )
    assert completed_error.value.code == PRACTICE_SESSION_STATE_CONFLICT

    active = practice_session(user_id=user_id, role_id=role_id)
    payload = generation_payload(role_id=role_id)
    run = generation_run(user_id=user_id, payload=payload)
    answering = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
        status="answering",
    )
    wrong_state_session = ScriptedSession(active, answering)

    with pytest.raises(PracticeSessionStateError) as attempt_error:
        asyncio.run(
            service(wrong_state_session).refresh_question_generation(
                user_id=user_id,
                session_id=active.id,
                expected_version=1,
            )
        )
    assert attempt_error.value.code == PRACTICE_SESSION_STATE_CONFLICT


def test_refresh_rejects_missing_generation_link_and_invalid_run_identity() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    missing_link = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=None,
    )
    missing_link_session = ScriptedSession(active, missing_link)

    with pytest.raises(PracticeSessionStateError) as missing_error:
        asyncio.run(
            service(missing_link_session).refresh_question_generation(
                user_id=user_id,
                session_id=active.id,
                expected_version=1,
            )
        )
    assert missing_error.value.code == PRACTICE_QUESTION_GENERATION_STATE_CONFLICT

    payload = generation_payload(role_id=role_id)
    wrong_owner_run = generation_run(user_id=uuid4(), payload=payload)
    wrong_owner_attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=wrong_owner_run.id,
    )
    wrong_owner_session = ScriptedSession(active, wrong_owner_attempt, wrong_owner_run)

    with pytest.raises(PracticeSessionStateError) as owner_error:
        asyncio.run(
            service(wrong_owner_session).refresh_question_generation(
                user_id=user_id,
                session_id=active.id,
                expected_version=1,
            )
        )
    assert owner_error.value.code == PRACTICE_QUESTION_GENERATION_STATE_CONFLICT


@pytest.mark.parametrize(
    "mutate",
    [
        lambda run: setattr(run, "agent_id", "resume-parser"),
        lambda run: setattr(run, "payload", {"invalid": "payload"}),
    ],
)
def test_refresh_rejects_malformed_generation_contract(mutate) -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    payload = generation_payload(role_id=role_id)
    run = generation_run(user_id=user_id, payload=payload)
    mutate(run)
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
    )
    session = ScriptedSession(active, attempt, run)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(session).refresh_question_generation(
                user_id=user_id,
                session_id=active.id,
                expected_version=1,
            )
        )

    assert error.value.code == PRACTICE_QUESTION_GENERATION_STATE_CONFLICT


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload.model_copy(update={"role_id": uuid4()}),
        lambda payload: payload.model_copy(update={"interaction_language": "zh-CN"}),
        lambda payload: payload.model_copy(
            update={"question_type": QuestionCardQuestionType.BEHAVIORAL}
        ),
        lambda payload: payload.model_copy(
            update={"difficulty": QuestionCardDifficulty.PRESSURE}
        ),
    ],
)
def test_refresh_rejects_payload_lineage_mismatch(mutate) -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    changed_payload = mutate(generation_payload(role_id=role_id))
    run = generation_run(user_id=user_id, payload=changed_payload)
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
    )
    session = ScriptedSession(active, attempt, run)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(session).refresh_question_generation(
                user_id=user_id,
                session_id=active.id,
                expected_version=1,
            )
        )

    assert error.value.code == PRACTICE_QUESTION_GENERATION_STATE_CONFLICT


def test_refresh_rejects_missing_or_mismatched_question_card() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    payload = generation_payload(role_id=role_id)
    run = generation_run(
        user_id=user_id,
        payload=payload,
        status=AgentRunStatus.SUCCEEDED,
    )
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
    )
    missing_card_session = ScriptedSession(active, attempt, run, None)

    with pytest.raises(PracticeSessionStateError) as missing_error:
        asyncio.run(
            service(missing_card_session).refresh_question_generation(
                user_id=user_id,
                session_id=active.id,
                expected_version=1,
            )
        )
    assert missing_error.value.code == PRACTICE_QUESTION_GENERATION_STATE_CONFLICT

    mismatched_card = question_card(
        user_id=user_id,
        role_id=uuid4(),
        run_id=run.id,
    )
    mismatched_session = ScriptedSession(active, attempt, run, mismatched_card)

    with pytest.raises(PracticeSessionStateError) as mismatch_error:
        asyncio.run(
            service(mismatched_session).refresh_question_generation(
                user_id=user_id,
                session_id=active.id,
                expected_version=1,
            )
        )
    assert mismatch_error.value.code == PRACTICE_QUESTION_GENERATION_STATE_CONFLICT


def test_refresh_replays_lost_success_response_without_mutating_workflow() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    payload = generation_payload(role_id=role_id)
    run = generation_run(
        user_id=user_id,
        payload=payload,
        status=AgentRunStatus.SUCCEEDED,
    )
    card = question_card(user_id=user_id, role_id=role_id, run_id=run.id)
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
    )

    first_session = ScriptedSession(active, attempt, run, card)
    first = asyncio.run(
        service(first_session).refresh_question_generation(
            user_id=user_id,
            session_id=active.id,
            expected_version=1,
        )
    )
    assert first.session.version == 2
    assert first.attempt.status == "answering"

    replay_session = ScriptedSession(active, attempt, run, card)
    replay = asyncio.run(
        service(replay_session).refresh_question_generation(
            user_id=user_id,
            session_id=active.id,
            expected_version=1,
        )
    )

    assert replay.session is active
    assert replay.attempt is attempt
    assert replay.question_card is card
    assert replay.session.version == 2
    assert replay.attempt.question_card_id == card.id
    assert replay_session.added == []
    assert replay_session.commit_count == 1
    assert replay_session.rollback_count == 0


def test_refresh_rejects_invalid_version_plus_one_as_version_conflict() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id, version=2)
    payload = generation_payload(role_id=role_id)
    run = generation_run(user_id=user_id, payload=payload)
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
    )
    scripted = ScriptedSession(active, attempt, run)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).refresh_question_generation(
                user_id=user_id,
                session_id=active.id,
                expected_version=1,
            )
        )

    assert error.value.code == PRACTICE_SESSION_VERSION_CONFLICT
    assert active.version == 2
    assert attempt.status == "generatingQuestion"
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_get_session_context_returns_generating_without_reconciling() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    payload = generation_payload(role_id=role_id)
    run = generation_run(
        user_id=user_id,
        payload=payload,
        status=AgentRunStatus.SUCCEEDED,
    )
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
    )
    scripted = ScriptedSession(active, attempt, run)

    result = asyncio.run(
        service(scripted).get_session_context(
            user_id=user_id,
            session_id=active.id,
        )
    )

    assert result.session.version == 1
    assert result.attempt.status == "generatingQuestion"
    assert result.question_card is None
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0


def test_get_session_context_returns_answering_snapshot_without_mutation() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id, version=2)
    payload = generation_payload(role_id=role_id)
    run = generation_run(
        user_id=user_id,
        payload=payload,
        status=AgentRunStatus.SUCCEEDED,
    )
    card = question_card(user_id=user_id, role_id=role_id, run_id=run.id)
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
        status="answering",
        question_card_id=card.id,
    )
    scripted = ScriptedSession(active, attempt, run, card, None)

    result = asyncio.run(
        service(scripted).get_session_context(
            user_id=user_id,
            session_id=active.id,
        )
    )

    assert result.question_card is card
    assert result.session.version == 2
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


def test_get_session_context_rejects_future_attempt_states() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=uuid4(),
        status="review",
    )
    scripted = ScriptedSession(active, attempt, None)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).get_session_context(
                user_id=user_id,
                session_id=active.id,
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert scripted.rollback_count == 1


def test_get_session_context_maps_missing_or_wrong_owner_to_not_found() -> None:
    scripted = ScriptedSession(None)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).get_session_context(
                user_id=uuid4(),
                session_id=uuid4(),
            )
        )

    assert error.value.code == PRACTICE_SESSION_NOT_FOUND
    assert scripted.rollback_count == 1


def test_get_active_session_context_returns_none_without_active_session() -> None:
    scripted = ScriptedSession(None)

    result = asyncio.run(service(scripted).get_active_session_context(user_id=uuid4()))

    assert result is None
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


def test_get_active_session_context_does_not_reconcile_succeeded_generation() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    payload = generation_payload(role_id=role_id)
    run = generation_run(
        user_id=user_id,
        payload=payload,
        status=AgentRunStatus.SUCCEEDED,
    )
    card = question_card(user_id=user_id, role_id=role_id, run_id=run.id)
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
    )
    scripted = ScriptedSession(active, attempt, run, card)

    result = asyncio.run(service(scripted).get_active_session_context(user_id=user_id))

    assert result is not None
    assert result.attempt is attempt
    assert result.attempt.status == "generatingQuestion"
    assert result.question_card is None
    assert attempt.question_card_id is None
    assert active.version == 1
    assert card.id not in scripted.added
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


def test_get_active_session_context_returns_highest_answering_attempt() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id, version=2)
    payload = generation_payload(role_id=role_id)
    run = generation_run(
        user_id=user_id,
        payload=payload,
        status=AgentRunStatus.SUCCEEDED,
    )
    card = question_card(user_id=user_id, role_id=role_id, run_id=run.id)
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
        status="answering",
        question_card_id=card.id,
    )
    attempt.attempt_number = 2
    scripted = ScriptedSession(active, attempt, run, card, None)

    result = asyncio.run(service(scripted).get_active_session_context(user_id=user_id))

    assert result is not None
    assert result.attempt.attempt_number == 2
    assert result.question_card is card
    assert scripted.commit_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


def test_get_answering_with_main_answer_returns_generating_follow_up() -> None:
    active, attempt, question_run, card = primary_answer_context(version=3)
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.QUEUED,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up,
    )

    result = asyncio.run(
        service(scripted).get_session_context(
            user_id=active.user_id,
            session_id=active.id,
        )
    )

    assert isinstance(result, PracticePrimaryAnswerWorkflowContext)
    assert result.main_answer is answer
    assert result.follow_up_generation_run is follow_up
    assert result.follow_up_decision is None
    assert result.follow_up_question is None
    assert result.attempt.status == "answering"
    assert active.version == 3
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


def test_get_succeeded_follow_up_with_persisted_artifacts_stays_pending() -> None:
    active, attempt, question_run, card = primary_answer_context(version=3)
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    question = follow_up_question(attempt_id=attempt.id, run_id=follow_up.id)
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="askFollowUp",
        question_id=question.id,
    )
    # The artifacts are durable, but GET must not load or reconcile them while
    # the attempt remains in the pre-refresh answering state.
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up,
    )

    result = asyncio.run(
        service(scripted).get_active_session_context(user_id=active.user_id)
    )

    assert isinstance(result, PracticePrimaryAnswerWorkflowContext)
    assert result.follow_up_decision is None
    assert result.follow_up_question is None
    assert result.attempt.status == "answering"
    assert decision.follow_up_question_id == question.id
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


def test_get_answering_follow_up_recovers_canonical_ask_without_locking() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status="answeringFollowUp",
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    question = follow_up_question(attempt_id=attempt.id, run_id=follow_up.id)
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="askFollowUp",
        question_id=question.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up,
        decision,
        question,
    )

    result = asyncio.run(
        service(scripted).get_session_context(
            user_id=active.user_id,
            session_id=active.id,
        )
    )

    assert isinstance(result, PracticePrimaryAnswerWorkflowContext)
    assert result.follow_up_decision is decision
    assert result.follow_up_question is question
    assert result.attempt.status == "answeringFollowUp"
    assert active.version == 4
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


def test_get_evaluating_recovers_complete_without_a_follow_up_question() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status="evaluating",
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="complete",
    )
    evaluation = evaluation_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        decision_id=decision.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up,
        decision,
        None,
        evaluation,
        None,
        None,
    )

    result = asyncio.run(
        service(scripted).get_active_session_context(user_id=active.user_id)
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.follow_up_decision is decision
    assert result.follow_up_question is None
    assert result.attempt.status == "evaluating"
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


@pytest.mark.parametrize(
    ("attempt_status", "decision", "question"),
    [
        ("answeringFollowUp", None, None),
        ("evaluating", None, None),
    ],
)
def test_get_final_follow_up_states_require_canonical_artifacts(
    attempt_status: str,
    decision: PracticeFollowUpDecision | None,
    question: PracticeFollowUpQuestion | None,
) -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status=attempt_status,
    )
    answer = main_answer(attempt_id=attempt.id)
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up,
        decision,
        question,
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).get_session_context(
                user_id=active.user_id,
                session_id=active.id,
            )
        )

    assert error.value.code == PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_get_active_session_context_ignores_completed_session() -> None:
    completed = practice_session(
        user_id=uuid4(),
        role_id=uuid4(),
        status="completed",
    )
    scripted = ScriptedSession(completed)

    result = asyncio.run(
        service(scripted).get_active_session_context(user_id=completed.user_id)
    )

    assert result is None
    assert scripted.rollback_count == 0


def test_get_active_session_context_rejects_malformed_generation_run() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id)
    run = generation_run(
        user_id=user_id,
        payload=generation_payload(role_id=role_id),
    )
    run.agent_id = "resume-parser"
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
    )
    scripted = ScriptedSession(active, attempt, run)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(service(scripted).get_active_session_context(user_id=user_id))

    assert error.value.code == PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
    assert scripted.rollback_count == 1


def test_get_active_session_context_rejects_invalid_question_card_link() -> None:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(user_id=user_id, role_id=role_id, version=2)
    run = generation_run(
        user_id=user_id,
        payload=generation_payload(role_id=role_id),
        status=AgentRunStatus.SUCCEEDED,
    )
    card = question_card(user_id=user_id, role_id=uuid4(), run_id=run.id)
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
        status="answering",
        question_card_id=card.id,
    )
    scripted = ScriptedSession(active, attempt, run, card)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(service(scripted).get_active_session_context(user_id=user_id))

    assert error.value.code == PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
    assert scripted.rollback_count == 1


def test_submit_primary_answer_persists_answer_and_enqueues_follow_up_atomically() -> (
    None
):
    active, attempt, question_run, card = primary_answer_context()
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=uuid4(),
    )
    fake_follow_up = FakeFollowUpGenerationService(follow_up)
    scripted = ScriptedSession(active, attempt, question_run, card, None)

    result = asyncio.run(
        service(scripted, fake_follow_up=fake_follow_up).submit_primary_answer(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=2,
            question_id=card.id,
            content="  I reduced failures by 20%.  ",
        )
    )

    assert result.main_answer.content == "I reduced failures by 20%."
    assert result.main_answer.kind == PracticeAnswerKind.MAIN.value
    assert result.main_answer.order == 1
    assert result.main_answer.follow_up_question_id is None
    assert result.follow_up_generation_run is follow_up
    assert result.follow_up_decision is None
    assert result.follow_up_question is None
    assert active.version == 3
    assert attempt.status == "answering"
    assert attempt.updated_at == NOW
    assert scripted.flush_count == 1
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0
    assert fake_follow_up.calls == [
        {
            "user_id": active.user_id,
            "attempt_id": attempt.id,
            "next_follow_up_order": 1,
            "interaction_language": "en",
            "idempotency_key": practice_follow_up_idempotency_key(
                attempt.id,
                1,
            ),
        }
    ]
    assert len(scripted.added) == 1
    assert isinstance(scripted.added[0], PracticeAnswer)


def test_submit_primary_answer_rolls_back_when_follow_up_enqueue_fails() -> None:
    active, attempt, question_run, card = primary_answer_context()
    fake_follow_up = FakeFollowUpGenerationService(error=RuntimeError("enqueue failed"))
    scripted = ScriptedSession(active, attempt, question_run, card, None)

    with pytest.raises(RuntimeError, match="enqueue failed"):
        asyncio.run(
            service(
                scripted,
                fake_follow_up=fake_follow_up,
            ).submit_primary_answer(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=2,
                question_id=card.id,
                content="A valid answer",
            )
        )

    assert active.version == 2
    assert attempt.status == "answering"
    assert attempt.updated_at == NOW
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_submit_primary_answer_maps_follow_up_state_errors() -> None:
    active, attempt, question_run, card = primary_answer_context()
    fake_follow_up = FakeFollowUpGenerationService(
        error=FollowUpGenerationStateError("follow_up_main_answer_not_ready")
    )
    scripted = ScriptedSession(active, attempt, question_run, card, None)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_follow_up=fake_follow_up,
            ).submit_primary_answer(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=2,
                question_id=card.id,
                content="A valid answer",
            )
        )

    assert error.value.code == PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
    assert error.value.source_code == "follow_up_main_answer_not_ready"
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


@pytest.mark.parametrize(
    ("content", "expected"),
    [
        ("   ", PRACTICE_SESSION_STATE_CONFLICT),
        ("x" * 20_001, PRACTICE_SESSION_STATE_CONFLICT),
    ],
)
def test_submit_primary_answer_rejects_invalid_content(
    content: str,
    expected: str,
) -> None:
    active, attempt, question_run, card = primary_answer_context()
    scripted = ScriptedSession(active, attempt, question_run, card)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).submit_primary_answer(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=2,
                question_id=card.id,
                content=content,
            )
        )

    assert error.value.code == expected
    assert active.version == 2
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_submit_primary_answer_rejects_existing_main_answer_without_overwriting() -> (
    None
):
    active, attempt, question_run, card = primary_answer_context()
    existing = main_answer(attempt_id=attempt.id, content="Original answer")
    scripted = ScriptedSession(active, attempt, question_run, card, existing)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).submit_primary_answer(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=2,
                question_id=card.id,
                content="Replacement answer",
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert existing.content == "Original answer"
    assert active.version == 2
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_submit_primary_answer_replays_the_same_answer_and_run() -> None:
    active, attempt, question_run, card = primary_answer_context(version=3)
    existing = main_answer(attempt_id=attempt.id, content="I reduced failures by 20%.")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        existing,
        follow_up,
    )

    result = asyncio.run(
        service(scripted).submit_primary_answer(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=2,
            question_id=card.id,
            content="  I reduced failures by 20%. ",
        )
    )

    assert result.main_answer is existing
    assert result.follow_up_generation_run is follow_up
    assert result.session.version == 3
    assert result.attempt.status == "answering"
    assert scripted.added == []
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


@pytest.mark.parametrize(
    "mutate",
    [
        lambda run: run.payload.__setitem__("mainAnswerId", str(uuid4())),
        lambda run: run.payload.__setitem__("questionCardId", str(uuid4())),
        lambda run: run.payload.__setitem__("interactionLanguage", "zh-CN"),
    ],
)
def test_submit_primary_answer_replay_mismatch_is_version_conflict(mutate) -> None:
    active, attempt, question_run, card = primary_answer_context(version=3)
    existing = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
    )
    mutate(follow_up)
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        existing,
        follow_up,
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).submit_primary_answer(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=2,
                question_id=card.id,
                content="Stored answer",
            )
        )

    assert error.value.code == PRACTICE_SESSION_VERSION_CONFLICT
    assert active.version == 3
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_submit_primary_answer_rejects_version_gap_greater_than_one() -> None:
    active, attempt, _, _ = primary_answer_context(version=4)
    scripted = ScriptedSession(active, attempt)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).submit_primary_answer(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=2,
                question_id=uuid4(),
                content="Stored answer",
            )
        )

    assert error.value.code == PRACTICE_SESSION_VERSION_CONFLICT
    assert scripted.rollback_count == 1


@pytest.mark.parametrize(
    "run_status",
    [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING],
)
def test_refresh_follow_up_pending_does_not_reconcile(
    run_status: AgentRunStatus,
) -> None:
    active, attempt, question_run, card = primary_answer_context(version=3)
    existing = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
        status=run_status,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        existing,
        follow_up,
    )

    result = asyncio.run(
        service(scripted).refresh_follow_up_generation(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=3,
        )
    )

    assert result.main_answer is existing
    assert result.follow_up_generation_run is follow_up
    assert result.follow_up_decision is None
    assert result.follow_up_question is None
    assert active.version == 3
    assert attempt.status == "answering"
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


def test_refresh_follow_up_failed_raises_stable_error_without_mutation() -> None:
    active, attempt, question_run, card = primary_answer_context(version=3)
    existing = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
        status=AgentRunStatus.FAILED,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        existing,
        follow_up,
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).refresh_follow_up_generation(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=3,
            )
        )

    assert error.value.code == PRACTICE_FOLLOW_UP_GENERATION_FAILED
    assert error.value.source_code == "provider_unavailable"
    assert active.version == 3
    assert attempt.status == "answering"
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_refresh_follow_up_ask_reconciles_canonical_question() -> None:
    active, attempt, question_run, card = primary_answer_context(version=3)
    existing = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    question = follow_up_question(attempt_id=attempt.id, run_id=follow_up.id)
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="askFollowUp",
        question_id=question.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        existing,
        follow_up,
        decision,
        question,
    )
    fake_evaluation = FakeEvaluationGenerationService()

    result = asyncio.run(
        service(
            scripted,
            fake_evaluation=fake_evaluation,
        ).refresh_follow_up_generation(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=3,
        )
    )

    assert result.follow_up_decision is decision
    assert result.follow_up_question is question
    assert result.attempt.status == "answeringFollowUp"
    assert result.session.version == 4
    assert fake_evaluation.calls == []
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


def test_refresh_follow_up_complete_reconciles_to_evaluating_without_question() -> None:
    active, attempt, question_run, card = primary_answer_context(version=3)
    existing = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="complete",
    )
    evaluation = evaluation_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
        decision_id=decision.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        existing,
        follow_up,
        decision,
        None,
    )

    result = asyncio.run(
        service(
            scripted,
            fake_evaluation=FakeEvaluationGenerationService(evaluation),
        ).refresh_follow_up_generation(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=3,
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.follow_up_decision is decision
    assert result.follow_up_question is None
    assert result.attempt.status == "evaluating"
    assert result.session.version == 4
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


def test_refresh_follow_up_requires_decision_and_valid_lineage() -> None:
    active, attempt, question_run, card = primary_answer_context(version=3)
    existing = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        existing,
        follow_up,
        None,
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).refresh_follow_up_generation(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=3,
            )
        )

    assert error.value.code == PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT
    assert active.version == 3
    assert attempt.status == "answering"
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_refresh_follow_up_replays_ask_without_incrementing_again() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status="answeringFollowUp",
    )
    existing = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    question = follow_up_question(attempt_id=attempt.id, run_id=follow_up.id)
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="askFollowUp",
        question_id=question.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        existing,
        follow_up,
        decision,
        question,
    )

    result = asyncio.run(
        service(scripted).refresh_follow_up_generation(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=3,
        )
    )

    assert result.follow_up_question is question
    assert result.attempt.status == "answeringFollowUp"
    assert result.session.version == 4
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


def test_refresh_follow_up_replays_complete_without_incrementing_again() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status="evaluating",
    )
    existing = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="complete",
    )
    evaluation = evaluation_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
        decision_id=decision.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        existing,
        follow_up,
        decision,
        None,
        evaluation,
    )

    result = asyncio.run(
        service(scripted).refresh_follow_up_generation(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=3,
        )
    )

    assert result.follow_up_decision is decision
    assert result.follow_up_question is None
    assert result.attempt.status == "evaluating"
    assert result.session.version == 4
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


def test_refresh_follow_up_rejects_wrong_replay_state_as_version_conflict() -> None:
    active, attempt, _, _ = primary_answer_context(
        version=4,
        attempt_status="answering",
    )
    scripted = ScriptedSession(active, attempt, None)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).refresh_follow_up_generation(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=3,
            )
        )

    assert error.value.code == PRACTICE_SESSION_VERSION_CONFLICT
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_refresh_follow_up_complete_enqueues_evaluation_in_same_transaction() -> None:
    active, attempt, question_run, card = primary_answer_context(version=3)
    existing = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="complete",
    )
    evaluation = evaluation_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
        decision_id=decision.id,
    )
    fake_evaluation = FakeEvaluationGenerationService(evaluation)
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        existing,
        follow_up,
        decision,
        None,
    )

    result = asyncio.run(
        service(
            scripted,
            fake_evaluation=fake_evaluation,
        ).refresh_follow_up_generation(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=3,
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.evaluation_generation_run is evaluation
    assert result.evaluation is None
    assert result.attempt.status == "evaluating"
    assert result.session.version == 4
    assert scripted.flush_count == 1
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0
    assert fake_evaluation.calls == [
        {
            "user_id": active.user_id,
            "attempt_id": attempt.id,
            "interaction_language": "en",
            "follow_up_completion_reason": (
                PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
            ),
            "idempotency_key": practice_evaluation_idempotency_key(attempt.id),
        }
    ]


def test_refresh_follow_up_evaluation_unavailable_rolls_back_state() -> None:
    active, attempt, question_run, card = primary_answer_context(version=3)
    existing = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="complete",
    )
    fake_evaluation = FakeEvaluationGenerationService(
        error=ValueError("missing evaluation model")
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        existing,
        follow_up,
        decision,
        None,
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_evaluation=fake_evaluation,
            ).refresh_follow_up_generation(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=3,
            )
        )

    assert error.value.code == PRACTICE_EVALUATION_GENERATION_UNAVAILABLE
    assert attempt.status == "answering"
    assert active.version == 3
    assert scripted.flush_count == 1
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_refresh_follow_up_evaluation_state_error_maps_without_leaking_source() -> None:
    active, attempt, question_run, card = primary_answer_context(version=3)
    existing = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=existing.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="complete",
    )
    fake_evaluation = FakeEvaluationGenerationService(
        error=EvaluationGenerationStateError("practice_evaluation_context_conflict")
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        existing,
        follow_up,
        decision,
        None,
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_evaluation=fake_evaluation,
            ).refresh_follow_up_generation(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=3,
            )
        )

    assert error.value.code == PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
    assert error.value.source_code == "practice_evaluation_context_conflict"
    assert "context_conflict" not in str(error.value)


@pytest.mark.parametrize(
    "status",
    [
        AgentRunStatus.QUEUED,
        AgentRunStatus.RUNNING,
        AgentRunStatus.FAILED,
    ],
)
def test_get_evaluating_accepts_nonterminal_evaluation_runs(
    status: AgentRunStatus,
) -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status="evaluating",
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="complete",
    )
    evaluation = evaluation_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        decision_id=decision.id,
        status=status,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up,
        decision,
        None,
        evaluation,
        None,
        None,
    )

    result = asyncio.run(
        service(scripted).get_session_context(
            user_id=active.user_id,
            session_id=active.id,
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.evaluation_generation_run is evaluation
    assert result.evaluation is None
    assert active.version == 4
    assert scripted.commit_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


def test_get_evaluating_loads_only_a_canonical_succeeded_artifact() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status="evaluating",
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="complete",
    )
    evaluation_run_value = evaluation_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        decision_id=decision.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    artifact = evaluation_artifact(
        attempt_id=attempt.id,
        run_id=evaluation_run_value.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up,
        decision,
        None,
        evaluation_run_value,
        artifact,
        None,
        None,
    )

    result = asyncio.run(
        service(scripted).get_active_session_context(
            user_id=active.user_id,
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.evaluation is artifact
    assert result.evaluation_generation_run is evaluation_run_value
    assert active.version == 4
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0


@pytest.mark.parametrize(
    "mutate",
    [
        lambda run: setattr(run, "agent_id", "wrong-agent"),
        lambda run: setattr(run, "payload", {"invalid": "payload"}),
        lambda run: run.payload.update({"terminalFollowUpDecisionId": str(uuid4())}),
        lambda run: run.payload.update({"interactionLanguage": "zh-CN"}),
        lambda run: run.payload.update({"followUpQuestion1Id": str(uuid4())}),
    ],
)
def test_get_evaluating_rejects_corrupt_evaluation_lineage(mutate) -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status="evaluating",
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="complete",
    )
    evaluation = evaluation_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        decision_id=decision.id,
    )
    mutate(evaluation)
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up,
        decision,
        None,
        evaluation,
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).get_session_context(
                user_id=active.user_id,
                session_id=active.id,
            )
        )

    assert error.value.code == PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT
    assert active.version == 4
    assert attempt.status == "evaluating"
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


@pytest.mark.parametrize(
    "status",
    [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING],
)
def test_refresh_evaluation_keeps_pending_evaluation_in_evaluating(
    status: AgentRunStatus,
) -> None:
    records = evaluation_pipeline(evaluation_status=status)
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(scripted).refresh_evaluation_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=4,
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.evaluation_generation_run is records["evaluation"]
    assert result.evaluation is None
    assert result.session.version == 4
    assert result.attempt.status == "evaluating"
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


def test_refresh_evaluation_enqueues_review_once_and_keeps_version() -> None:
    records = evaluation_pipeline()
    evaluation = records["evaluation_value"]
    assert isinstance(evaluation, PracticeEvaluation)
    review = review_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
        attempt_id=records["attempt"].id,  # type: ignore[union-attr]
        evaluation_id=evaluation.id,
    )
    fake_review = FakeReviewGenerationService(review)
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(scripted, fake_review=fake_review).refresh_evaluation_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=4,
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.review_generation_run is review
    assert result.review is None
    assert result.recommendation_generation_run is None
    assert result.session.version == 4
    assert result.attempt.status == "evaluating"
    assert fake_review.calls == [
        {
            "user_id": records["active"].user_id,  # type: ignore[union-attr]
            "attempt_id": records["attempt"].id,  # type: ignore[union-attr]
            "interaction_language": "en",
            "idempotency_key": practice_review_idempotency_key(
                records["attempt"].id  # type: ignore[union-attr]
            ),
        }
    ]
    assert scripted.commit_count == 1


@pytest.mark.parametrize(
    "status",
    [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING],
)
def test_refresh_evaluation_keeps_pending_review_in_evaluating(
    status: AgentRunStatus,
) -> None:
    records = evaluation_pipeline(review_status=status)
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(scripted).refresh_evaluation_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=4,
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.evaluation is records["evaluation_value"]
    assert result.review_generation_run is records["review"]
    assert result.review is None
    assert result.recommendation_generation_run is None
    assert result.session.version == 4
    assert result.attempt.status == "evaluating"
    assert scripted.commit_count == 1


def test_refresh_evaluation_enqueues_recommendation_once_and_keeps_version() -> None:
    records = evaluation_pipeline(review_status=AgentRunStatus.SUCCEEDED)
    evaluation = records["evaluation_value"]
    review = records["review_value"]
    assert isinstance(evaluation, PracticeEvaluation)
    assert isinstance(review, PracticeReview)
    recommendation = recommendation_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
        attempt_id=records["attempt"].id,  # type: ignore[union-attr]
        evaluation_id=evaluation.id,
        review_id=review.id,
    )
    fake_recommendation = FakeRecommendationGenerationService(recommendation)
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(
            scripted,
            fake_recommendation=fake_recommendation,
        ).refresh_evaluation_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=4,
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.review is review
    assert result.recommendation_generation_run is recommendation
    assert result.recommendation is None
    assert result.session.version == 4
    assert result.attempt.status == "evaluating"
    assert fake_recommendation.calls[0]["idempotency_key"] == (
        practice_recommendation_idempotency_key(records["attempt"].id)  # type: ignore[union-attr]
    )
    assert scripted.commit_count == 1


@pytest.mark.parametrize(
    "status",
    [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING],
)
def test_refresh_evaluation_keeps_pending_recommendation_in_evaluating(
    status: AgentRunStatus,
) -> None:
    records = evaluation_pipeline(
        review_status=AgentRunStatus.SUCCEEDED,
        recommendation_status=status,
    )
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(scripted).refresh_evaluation_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=4,
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.recommendation_generation_run is records["recommendation"]
    assert result.recommendation is None
    assert result.session.version == 4
    assert result.attempt.status == "evaluating"
    assert scripted.commit_count == 1


@pytest.mark.parametrize(
    ("phase", "status", "expected_code"),
    [
        (
            "evaluation",
            AgentRunStatus.FAILED,
            PRACTICE_EVALUATION_GENERATION_FAILED,
        ),
        (
            "review",
            AgentRunStatus.FAILED,
            PRACTICE_REVIEW_GENERATION_FAILED,
        ),
        (
            "recommendation",
            AgentRunStatus.FAILED,
            PRACTICE_RECOMMENDATION_GENERATION_FAILED,
        ),
    ],
)
def test_refresh_evaluation_maps_each_failed_phase_without_advancing(
    phase: str,
    status: AgentRunStatus,
    expected_code: str,
) -> None:
    records = evaluation_pipeline(
        evaluation_status=status if phase == "evaluation" else AgentRunStatus.SUCCEEDED,
        review_status=(
            status
            if phase == "review"
            else AgentRunStatus.SUCCEEDED
            if phase == "recommendation"
            else None
        ),
        recommendation_status=status if phase == "recommendation" else None,
    )
    scripted = ScriptedSession(*records["scalar_values"])

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).refresh_evaluation_generation(
                user_id=records["active"].user_id,  # type: ignore[union-attr]
                session_id=records["active"].id,  # type: ignore[union-attr]
                expected_version=4,
            )
        )

    assert error.value.code == expected_code
    assert records["active"].version == 4  # type: ignore[union-attr]
    assert records["attempt"].status == "evaluating"  # type: ignore[union-attr]
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


@pytest.mark.parametrize(
    ("phase", "expected_code"),
    [
        ("evaluation", PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT),
        ("review", PRACTICE_REVIEW_GENERATION_STATE_CONFLICT),
        (
            "recommendation",
            PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT,
        ),
    ],
)
def test_refresh_evaluation_rejects_succeeded_run_without_canonical_artifact(
    phase: str,
    expected_code: str,
) -> None:
    records = evaluation_pipeline(
        evaluation_artifact_present=phase != "evaluation",
        review_status=AgentRunStatus.SUCCEEDED if phase != "evaluation" else None,
        review_artifact_present=phase == "recommendation",
        recommendation_status=(
            AgentRunStatus.SUCCEEDED if phase == "recommendation" else None
        ),
        recommendation_artifact_present=False,
    )
    scripted = ScriptedSession(*records["scalar_values"])

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).refresh_evaluation_generation(
                user_id=records["active"].user_id,  # type: ignore[union-attr]
                session_id=records["active"].id,  # type: ignore[union-attr]
                expected_version=4,
            )
        )

    assert error.value.code == expected_code
    assert records["active"].version == 4  # type: ignore[union-attr]
    assert records["attempt"].status == "evaluating"  # type: ignore[union-attr]
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_refresh_evaluation_finalizes_only_after_recommendation_artifact() -> None:
    records = evaluation_pipeline(
        review_status=AgentRunStatus.SUCCEEDED,
        recommendation_status=AgentRunStatus.SUCCEEDED,
        recommendation_action="retryCurrent",
    )
    scripted = ScriptedSession(*records["scalar_values"])
    reference_run = reference_answer_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
    )
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        state=reference_answer_state(
            reference_run,
            PracticeReferenceAnswerLifecycleStatus.REVEALED,
        ),
    )

    result = asyncio.run(
        service(scripted, fake_reference=fake_reference).refresh_evaluation_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=4,
        )
    )

    assert result.attempt.status == "review"
    assert result.attempt.completed_at == NOW
    assert result.session.status == "active"
    assert result.session.version == 5
    assert result.session.completed_at is None
    assert result.session.completion_reason is None
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


def test_refresh_evaluation_guarantees_main_reference_before_review() -> None:
    records = evaluation_pipeline(
        review_status=AgentRunStatus.SUCCEEDED,
        recommendation_status=AgentRunStatus.SUCCEEDED,
    )
    reference_run = reference_answer_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
    )
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        state=reference_answer_state(
            reference_run,
            PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED,
        ),
    )

    first_session = ScriptedSession(*records["scalar_values"])
    first = asyncio.run(
        service(
            first_session,
            fake_reference=fake_reference,
        ).refresh_evaluation_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=4,
        )
    )

    assert isinstance(first, PracticeEvaluationWorkflowContext)
    assert first.attempt.status == "evaluating"
    assert first.session.version == 4
    assert first.attempt.completed_at is None
    assert fake_reference.main_calls == [
        {
            "user_id": records["active"].user_id,  # type: ignore[union-attr]
            "question_card_id": records["card"].id,  # type: ignore[union-attr]
            "idempotency_key": practice_main_reference_answer_idempotency_key(
                records["card"].id  # type: ignore[union-attr]
            ),
        }
    ]

    second_session = ScriptedSession(*records["scalar_values"])
    second = asyncio.run(
        service(
            second_session,
            fake_reference=fake_reference,
        ).refresh_evaluation_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=4,
        )
    )
    assert isinstance(second, PracticeEvaluationWorkflowContext)
    assert len(fake_reference.main_calls) == 1

    fake_reference.states[("main", None)] = reference_answer_state(
        reference_run,
        PracticeReferenceAnswerLifecycleStatus.REVEALED,
    )
    third_session = ScriptedSession(*records["scalar_values"])
    third = asyncio.run(
        service(
            third_session,
            fake_reference=fake_reference,
        ).refresh_evaluation_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=4,
        )
    )

    assert isinstance(third, PracticeReviewWorkflowContext)
    assert third.attempt.status == "review"
    assert third.session.version == 5


def test_refresh_evaluation_enqueues_all_reference_targets_in_stable_order() -> None:
    records = evaluation_pipeline_with_two_follow_ups()
    reference_run = reference_answer_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
    )
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        states={
            ("main", None): reference_answer_state(
                reference_run,
                PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED,
            ),
            ("followUp", records["first_question"].id): reference_answer_state(  # type: ignore[union-attr]
                reference_run,
                PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED,
            ),
            ("followUp", records["second_question"].id): reference_answer_state(  # type: ignore[union-attr]
                reference_run,
                PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED,
            ),
        },
    )
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(
            scripted,
            fake_reference=fake_reference,
        ).refresh_evaluation_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=4,
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.session.version == 4
    assert result.attempt.status == "evaluating"
    assert fake_reference.main_calls[0]["idempotency_key"] == (
        practice_main_reference_answer_idempotency_key(records["card"].id)  # type: ignore[union-attr]
    )
    assert [call["idempotency_key"] for call in fake_reference.follow_up_calls] == [
        practice_follow_up_reference_answer_idempotency_key(
            records["first_question"].id  # type: ignore[union-attr]
        ),
        practice_follow_up_reference_answer_idempotency_key(
            records["second_question"].id  # type: ignore[union-attr]
        ),
    ]
    assert len(fake_reference.main_calls) + len(fake_reference.follow_up_calls) == 3


def test_refresh_evaluation_only_enqueues_missing_reference_target() -> None:
    records = evaluation_pipeline_with_two_follow_ups()
    reference_run = reference_answer_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
    )
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        states={
            ("main", None): reference_answer_state(
                reference_run,
                PracticeReferenceAnswerLifecycleStatus.REVEALED,
            ),
            ("followUp", records["first_question"].id): reference_answer_state(  # type: ignore[union-attr]
                reference_run,
                PracticeReferenceAnswerLifecycleStatus.GENERATING,
            ),
            ("followUp", records["second_question"].id): reference_answer_state(  # type: ignore[union-attr]
                reference_run,
                PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED,
            ),
        },
    )
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(
            scripted,
            fake_reference=fake_reference,
        ).refresh_evaluation_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=4,
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert fake_reference.main_calls == []
    assert [
        call["follow_up_question_id"] for call in fake_reference.follow_up_calls
    ] == [
        records["second_question"].id,  # type: ignore[union-attr]
    ]


def test_refresh_evaluation_allows_unavailable_reference_target_to_reach_review() -> (
    None
):
    records = evaluation_pipeline_with_two_follow_ups()
    reference_run = reference_answer_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
    )
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        states={
            ("main", None): reference_answer_state(
                reference_run,
                PracticeReferenceAnswerLifecycleStatus.REVEALED,
            ),
            ("followUp", records["first_question"].id): reference_answer_state(  # type: ignore[union-attr]
                reference_run,
                PracticeReferenceAnswerLifecycleStatus.UNAVAILABLE,
            ),
            ("followUp", records["second_question"].id): reference_answer_state(  # type: ignore[union-attr]
                reference_run,
                PracticeReferenceAnswerLifecycleStatus.REVEALED,
            ),
        },
    )
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(
            scripted,
            fake_reference=fake_reference,
        ).refresh_evaluation_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=4,
        )
    )

    assert isinstance(result, PracticeReviewWorkflowContext)
    assert result.attempt.status == "review"
    assert result.session.version == 5
    assert fake_reference.main_calls == []
    assert fake_reference.follow_up_calls == []


def test_refresh_evaluation_uses_evaluation_run_created_at_for_ended_early_pending_target() -> (
    None
):
    records = evaluation_pipeline_with_two_follow_ups(ended_early=True)
    cutoff = NOW + timedelta(minutes=2)
    records["evaluation"].created_at = cutoff  # type: ignore[union-attr]
    reference_run = reference_answer_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
    )
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        states={
            ("main", None): reference_answer_state(
                reference_run,
                PracticeReferenceAnswerLifecycleStatus.REVEALED,
            ),
            ("followUp", records["first_question"].id): reference_answer_state(  # type: ignore[union-attr]
                reference_run,
                PracticeReferenceAnswerLifecycleStatus.REVEALED,
            ),
            ("followUp", records["second_question"].id): reference_answer_state(  # type: ignore[union-attr]
                reference_run,
                PracticeReferenceAnswerLifecycleStatus.REVEALED,
            ),
        },
    )
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(
            scripted,
            fake_reference=fake_reference,
        ).refresh_evaluation_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=4,
        )
    )

    assert isinstance(result, PracticeReviewWorkflowContext)
    pending_calls = [
        call
        for call in fake_reference.state_calls
        if call["target_type"] == "followUp"
        and call["follow_up_question_id"] == records["second_question"].id  # type: ignore[union-attr]
    ]
    assert pending_calls
    assert all(call["submitted_at"] == cutoff for call in pending_calls)


def test_refresh_evaluation_maps_reference_resolver_corruption_to_state_conflict() -> (
    None
):
    records = evaluation_pipeline(
        review_status=AgentRunStatus.SUCCEEDED,
        recommendation_status=AgentRunStatus.SUCCEEDED,
    )
    reference_run = reference_answer_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
    )
    scripted = ScriptedSession(*records["scalar_values"])

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_reference=FakeReferenceAnswerGenerationService(
                    run=reference_run,
                    state_error=ReferenceAnswerGenerationStateError(
                        "reference_answer_artifact_conflict"
                    ),
                ),
            ).refresh_evaluation_generation(
                user_id=records["active"].user_id,  # type: ignore[union-attr]
                session_id=records["active"].id,  # type: ignore[union-attr]
                expected_version=4,
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert records["active"].version == 4  # type: ignore[union-attr]
    assert records["attempt"].status == "evaluating"  # type: ignore[union-attr]
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_refresh_evaluation_maps_reference_configuration_failure_without_advancing() -> (
    None
):
    records = evaluation_pipeline(
        review_status=AgentRunStatus.SUCCEEDED,
        recommendation_status=AgentRunStatus.SUCCEEDED,
    )
    reference_run = reference_answer_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
    )
    fake_reference = FakeReferenceAnswerGenerationService(
        run=reference_run,
        state=reference_answer_state(
            reference_run,
            PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED,
        ),
        error=ValueError("missing reference model"),
    )
    scripted = ScriptedSession(*records["scalar_values"])

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_reference=fake_reference,
            ).refresh_evaluation_generation(
                user_id=records["active"].user_id,  # type: ignore[union-attr]
                session_id=records["active"].id,  # type: ignore[union-attr]
                expected_version=4,
            )
        )

    assert error.value.code == PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE
    assert records["active"].version == 4  # type: ignore[union-attr]
    assert records["attempt"].status == "evaluating"  # type: ignore[union-attr]
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


@pytest.mark.parametrize(
    "mutate",
    [
        lambda run: run.payload.update({"attemptId": str(uuid4())}),
        lambda run: run.payload.update({"evaluationId": str(uuid4())}),
        lambda run: run.payload.update({"interactionLanguage": "zh-CN"}),
        lambda run: setattr(run, "idempotency_key", "corrupt-review-key"),
    ],
)
def test_refresh_evaluation_rejects_corrupt_review_lineage_without_reenqueue(
    mutate,
) -> None:
    records = evaluation_pipeline()
    evaluation = records["evaluation_value"]
    assert isinstance(evaluation, PracticeEvaluation)
    corrupt_review = review_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
        attempt_id=records["attempt"].id,  # type: ignore[union-attr]
        evaluation_id=evaluation.id,
    )
    mutate(corrupt_review)
    records["scalar_values"][-2] = corrupt_review
    fake_review = FakeReviewGenerationService()
    scripted = ScriptedSession(*records["scalar_values"])

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted, fake_review=fake_review).refresh_evaluation_generation(
                user_id=records["active"].user_id,  # type: ignore[union-attr]
                session_id=records["active"].id,  # type: ignore[union-attr]
                expected_version=4,
            )
        )

    assert error.value.code == PRACTICE_REVIEW_GENERATION_STATE_CONFLICT
    assert fake_review.calls == []
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


@pytest.mark.parametrize(
    "mutate",
    [
        lambda run: run.payload.update({"attemptId": str(uuid4())}),
        lambda run: run.payload.update({"evaluationId": str(uuid4())}),
        lambda run: run.payload.update({"reviewId": str(uuid4())}),
        lambda run: run.payload.update({"interactionLanguage": "zh-CN"}),
        lambda run: setattr(run, "idempotency_key", "corrupt-recommendation-key"),
    ],
)
def test_refresh_evaluation_rejects_corrupt_recommendation_lineage_without_reenqueue(
    mutate,
) -> None:
    records = evaluation_pipeline(review_status=AgentRunStatus.SUCCEEDED)
    evaluation = records["evaluation_value"]
    review = records["review_value"]
    assert isinstance(evaluation, PracticeEvaluation)
    assert isinstance(review, PracticeReview)
    corrupt_recommendation = recommendation_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
        attempt_id=records["attempt"].id,  # type: ignore[union-attr]
        evaluation_id=evaluation.id,
        review_id=review.id,
    )
    mutate(corrupt_recommendation)
    records["scalar_values"][-1] = corrupt_recommendation
    fake_recommendation = FakeRecommendationGenerationService()
    scripted = ScriptedSession(*records["scalar_values"])

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_recommendation=fake_recommendation,
            ).refresh_evaluation_generation(
                user_id=records["active"].user_id,  # type: ignore[union-attr]
                session_id=records["active"].id,  # type: ignore[union-attr]
                expected_version=4,
            )
        )

    assert error.value.code == PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT
    assert fake_recommendation.calls == []
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


@pytest.mark.parametrize(
    ("factory", "expected_code"),
    [
        ("review", PRACTICE_REVIEW_GENERATION_UNAVAILABLE),
        ("recommendation", PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE),
    ],
)
def test_downstream_enqueue_failure_rolls_back_without_advancing(
    factory: str,
    expected_code: str,
) -> None:
    if factory == "review":
        records = evaluation_pipeline()
        fake_review = FakeReviewGenerationService(error=ValueError("no model"))
        fake_recommendation = None
    else:
        records = evaluation_pipeline(review_status=AgentRunStatus.SUCCEEDED)
        fake_review = None
        fake_recommendation = FakeRecommendationGenerationService(
            error=ValueError("no model")
        )
    scripted = ScriptedSession(*records["scalar_values"])

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_review=fake_review,
                fake_recommendation=fake_recommendation,
            ).refresh_evaluation_generation(
                user_id=records["active"].user_id,  # type: ignore[union-attr]
                session_id=records["active"].id,  # type: ignore[union-attr]
                expected_version=4,
            )
        )

    assert error.value.code == expected_code
    assert records["active"].version == 4  # type: ignore[union-attr]
    assert records["attempt"].status == "evaluating"  # type: ignore[union-attr]
    assert records["evaluation_value"] is not None
    if factory == "recommendation":
        assert records["review_value"] is not None
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_get_evaluating_does_not_reconcile_review_or_recommendation() -> None:
    records = evaluation_pipeline()
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(scripted).get_session_context(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.session.version == 4
    assert result.attempt.status == "evaluating"
    assert result.review_generation_run is None
    assert result.recommendation_generation_run is None
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


def test_get_evaluating_recovers_review_succeeded_without_recommendation() -> None:
    records = evaluation_pipeline(review_status=AgentRunStatus.SUCCEEDED)
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(scripted).get_session_context(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.review is records["review_value"]
    assert result.recommendation_generation_run is None
    assert result.session.version == 4
    assert result.attempt.status == "evaluating"
    assert scripted.commit_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


def test_get_evaluating_does_not_finalize_succeeded_recommendation() -> None:
    records = evaluation_pipeline(
        review_status=AgentRunStatus.SUCCEEDED,
        recommendation_status=AgentRunStatus.SUCCEEDED,
    )
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(scripted).get_session_context(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.recommendation is records["recommendation_value"]
    assert result.session.version == 4
    assert result.attempt.status == "evaluating"
    assert records["attempt"].completed_at is None  # type: ignore[union-attr]
    assert scripted.commit_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


def test_get_review_requires_complete_canonical_lineage_without_writes() -> None:
    records = evaluation_pipeline(
        review_status=AgentRunStatus.SUCCEEDED,
        recommendation_status=AgentRunStatus.SUCCEEDED,
        attempt_status="review",
    )
    records["attempt"].completed_at = NOW  # type: ignore[union-attr]
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(scripted).get_session_context(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
        )
    )

    assert result.attempt.status == "review"
    assert result.session.version == 4
    assert scripted.commit_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


@pytest.mark.parametrize(
    "missing",
    [
        "evaluation_run",
        "evaluation_artifact",
        "review_run",
        "review_artifact",
        "recommendation_run",
        "recommendation_artifact",
    ],
)
def test_final_replay_rejects_incomplete_lineage_as_version_conflict(
    missing: str,
) -> None:
    records = evaluation_pipeline(
        review_status=AgentRunStatus.SUCCEEDED,
        recommendation_status=AgentRunStatus.SUCCEEDED,
        attempt_status="review",
    )
    records["attempt"].completed_at = NOW  # type: ignore[union-attr]
    if missing == "evaluation_run":
        records["scalar_values"][8] = None
    elif missing == "evaluation_artifact":
        records["scalar_values"][9] = None
    elif missing == "review_run":
        records["scalar_values"][10] = None
    elif missing == "review_artifact":
        records["scalar_values"][11] = None
    elif missing == "recommendation_run":
        records["scalar_values"][12] = None
    else:
        records["scalar_values"][13] = None
    scripted = ScriptedSession(*records["scalar_values"])

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).refresh_evaluation_generation(
                user_id=records["active"].user_id,  # type: ignore[union-attr]
                session_id=records["active"].id,  # type: ignore[union-attr]
                expected_version=4,
            )
        )

    assert error.value.code == PRACTICE_SESSION_VERSION_CONFLICT
    assert records["active"].version == 4  # type: ignore[union-attr]
    assert records["attempt"].status == "review"  # type: ignore[union-attr]
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


@pytest.mark.parametrize("corruption", ["evaluationId", "reviewId", "language"])
def test_final_replay_rejects_corrupt_lineage_as_version_conflict(
    corruption: str,
) -> None:
    records = evaluation_pipeline(
        review_status=AgentRunStatus.SUCCEEDED,
        recommendation_status=AgentRunStatus.SUCCEEDED,
        attempt_status="review",
    )
    records["attempt"].completed_at = NOW  # type: ignore[union-attr]
    if corruption == "evaluationId":
        records["scalar_values"][10].payload["evaluationId"] = str(uuid4())
    elif corruption == "reviewId":
        records["scalar_values"][12].payload["reviewId"] = str(uuid4())
    else:
        records["scalar_values"][12].payload["interactionLanguage"] = "zh-CN"
    scripted = ScriptedSession(*records["scalar_values"])

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).refresh_evaluation_generation(
                user_id=records["active"].user_id,  # type: ignore[union-attr]
                session_id=records["active"].id,  # type: ignore[union-attr]
                expected_version=4,
            )
        )

    assert error.value.code == PRACTICE_SESSION_VERSION_CONFLICT
    assert records["active"].version == 4  # type: ignore[union-attr]
    assert records["attempt"].status == "review"  # type: ignore[union-attr]
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


@pytest.mark.parametrize(
    "corruption",
    [
        "evaluation_run",
        "evaluation_artifact",
        "review_run",
        "review_artifact",
        "recommendation_run",
        "recommendation_artifact",
        "wrong_evaluation_id",
        "wrong_review_id",
        "wrong_language",
    ],
)
def test_get_review_rejects_incomplete_or_corrupt_lineage(
    corruption: str,
) -> None:
    records = evaluation_pipeline(
        review_status=AgentRunStatus.SUCCEEDED,
        recommendation_status=AgentRunStatus.SUCCEEDED,
        attempt_status="review",
    )
    records["attempt"].completed_at = NOW  # type: ignore[union-attr]
    if corruption == "evaluation_run":
        records["scalar_values"][8] = None
    elif corruption == "evaluation_artifact":
        records["scalar_values"][9] = None
    elif corruption == "review_run":
        records["scalar_values"][10] = None
        records["scalar_values"][11] = None
    elif corruption == "review_artifact":
        records["scalar_values"][11] = None
    elif corruption == "recommendation_run":
        records["scalar_values"][12] = None
    elif corruption == "recommendation_artifact":
        records["scalar_values"][13] = None
    elif corruption == "wrong_evaluation_id":
        records["scalar_values"][10].payload["evaluationId"] = str(uuid4())
    elif corruption == "wrong_review_id":
        records["scalar_values"][12].payload["reviewId"] = str(uuid4())
    else:
        records["scalar_values"][12].payload["interactionLanguage"] = "zh-CN"
    scripted = ScriptedSession(*records["scalar_values"])

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).get_session_context(
                user_id=records["active"].user_id,  # type: ignore[union-attr]
                session_id=records["active"].id,  # type: ignore[union-attr]
            )
        )

    assert error.value.code in {
        PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT,
        PRACTICE_REVIEW_GENERATION_STATE_CONFLICT,
        PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT,
    }
    assert records["active"].version == 4  # type: ignore[union-attr]
    assert records["attempt"].status == "review"  # type: ignore[union-attr]
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_get_active_review_uses_no_write_locks_or_commit() -> None:
    records = evaluation_pipeline(
        review_status=AgentRunStatus.SUCCEEDED,
        recommendation_status=AgentRunStatus.SUCCEEDED,
        attempt_status="review",
    )
    records["attempt"].completed_at = NOW  # type: ignore[union-attr]
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(scripted).get_active_session_context(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
        )
    )

    assert isinstance(
        result, PracticeEvaluationWorkflowContext | PracticeReviewWorkflowContext
    )
    assert result.attempt.status == "review"
    assert result.session.version == 4
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


def test_submit_follow_up_answer_order1_persists_and_enqueues_order2() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status="answeringFollowUp",
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up_1 = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    question_1 = follow_up_question(
        attempt_id=attempt.id,
        run_id=follow_up_1.id,
    )
    decision_1 = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up_1.id,
        action="askFollowUp",
        question_id=question_1.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up_1,
        decision_1,
        question_1,
    )

    def build_order2(_kwargs: dict[str, object]) -> AgentRun:
        submitted = scripted.added[-1]
        assert isinstance(submitted, PracticeAnswer)
        return follow_up_run(
            user_id=active.user_id,
            attempt_id=attempt.id,
            question_card_id=card.id,
            main_answer_id=answer.id,
            status=AgentRunStatus.QUEUED,
            order=2,
            previous_question_id=question_1.id,
            previous_answer_id=submitted.id,
        )

    fake_follow_up = FakeFollowUpGenerationService(run_factory=build_order2)
    result = asyncio.run(
        service(
            scripted,
            fake_follow_up=fake_follow_up,
        ).submit_follow_up_answer(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
            follow_up_question_id=question_1.id,
            content="  The metric improved.  ",
        )
    )

    submitted = scripted.added[-1]
    assert isinstance(submitted, PracticeAnswer)
    assert submitted.kind == PracticeAnswerKind.FOLLOW_UP.value
    assert submitted.order == 2
    assert submitted.follow_up_question_id == question_1.id
    assert submitted.content == "The metric improved."
    assert result.follow_up_exchanges == (result.follow_up_exchanges[0],)
    assert result.follow_up_exchanges[0].question is question_1
    assert result.follow_up_exchanges[0].answer is submitted
    assert result.follow_up_generation_run is fake_follow_up.run
    assert result.follow_up_generation_run.payload["nextFollowUpOrder"] == 2
    assert result.follow_up_generation_run.payload["previousFollowUpQuestionId"] == str(
        question_1.id
    )
    assert result.follow_up_generation_run.payload["previousFollowUpAnswerId"] == str(
        submitted.id
    )
    assert attempt.status == "answering"
    assert active.version == 5
    assert scripted.flush_count == 1
    assert scripted.commit_count == 1
    assert fake_follow_up.calls[0]["next_follow_up_order"] == 2
    assert fake_follow_up.calls[0]["idempotency_key"] == (
        practice_follow_up_idempotency_key(attempt.id, 2)
    )


def test_submit_follow_up_answer_order1_enqueue_failure_rolls_back() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status="answeringFollowUp",
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up_1 = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    question_1 = follow_up_question(
        attempt_id=attempt.id,
        run_id=follow_up_1.id,
    )
    decision_1 = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up_1.id,
        action="askFollowUp",
        question_id=question_1.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up_1,
        decision_1,
        question_1,
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_follow_up=FakeFollowUpGenerationService(
                    error=ValueError("missing follow-up model")
                ),
            ).submit_follow_up_answer(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
                follow_up_question_id=question_1.id,
                content="The metric improved.",
            )
        )

    assert error.value.code == "practice_follow_up_generation_unavailable"
    assert active.version == 4
    assert attempt.status == "answeringFollowUp"
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1
    assert len(scripted.added) == 1


def test_submit_follow_up_answer_order1_replays_same_answer_and_order2_run() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=5,
        attempt_status="answering",
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up_1 = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    question_1 = follow_up_question(
        attempt_id=attempt.id,
        run_id=follow_up_1.id,
    )
    decision_1 = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up_1.id,
        action="askFollowUp",
        question_id=question_1.id,
    )
    answer_1 = PracticeAnswer(
        id=uuid4(),
        attempt_id=attempt.id,
        kind=PracticeAnswerKind.FOLLOW_UP.value,
        order=2,
        content="The metric improved.",
        follow_up_question_id=question_1.id,
        submitted_at=NOW,
    )
    follow_up_2 = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.QUEUED,
        order=2,
        previous_question_id=question_1.id,
        previous_answer_id=answer_1.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up_1,
        decision_1,
        question_1,
        follow_up_2,
        answer_1,
    )
    fake_follow_up = FakeFollowUpGenerationService()

    result = asyncio.run(
        service(scripted, fake_follow_up=fake_follow_up).submit_follow_up_answer(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
            follow_up_question_id=question_1.id,
            content="  The metric improved. ",
        )
    )

    assert result.follow_up_exchanges[0].answer is answer_1
    assert result.follow_up_generation_run is follow_up_2
    assert result.session.version == 5
    assert result.attempt.status == "answering"
    assert scripted.added == []
    assert fake_follow_up.calls == []


def _order2_refresh_records(
    *,
    attempt_status: str = "answering",
    order2_status: AgentRunStatus = AgentRunStatus.QUEUED,
    order2_action: str | None = None,
    include_order2_question: bool = False,
) -> dict[str, object]:
    active, attempt, question_run, card = primary_answer_context(
        version=5,
        attempt_status=attempt_status,
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up_1 = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    question_1 = follow_up_question(
        attempt_id=attempt.id,
        run_id=follow_up_1.id,
    )
    decision_1 = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up_1.id,
        action="askFollowUp",
        question_id=question_1.id,
    )
    answer_1 = PracticeAnswer(
        id=uuid4(),
        attempt_id=attempt.id,
        kind=PracticeAnswerKind.FOLLOW_UP.value,
        order=2,
        content="The metric improved.",
        follow_up_question_id=question_1.id,
        submitted_at=NOW,
    )
    follow_up_2 = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=order2_status,
        order=2,
        previous_question_id=question_1.id,
        previous_answer_id=answer_1.id,
    )
    question_2 = None
    decision_2 = None
    if order2_action is not None:
        question_2 = follow_up_question(
            attempt_id=attempt.id,
            run_id=follow_up_2.id,
            order=2,
        )
        decision_2 = follow_up_decision(
            attempt_id=attempt.id,
            run_id=follow_up_2.id,
            action=order2_action,
            order=2,
            question_id=question_2.id if order2_action == "askFollowUp" else None,
        )
    scripted_values: list[object] = [
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up_1,
        decision_1,
        question_1,
        follow_up_2,
    ]
    if include_order2_question:
        scripted_values.extend([decision_2, question_2])
    elif order2_action == "complete":
        scripted_values.extend([decision_2, None])
    scripted_values.append(answer_1)
    return {
        "active": active,
        "attempt": attempt,
        "question_run": question_run,
        "card": card,
        "answer": answer,
        "follow_up_1": follow_up_1,
        "question_1": question_1,
        "decision_1": decision_1,
        "answer_1": answer_1,
        "follow_up_2": follow_up_2,
        "question_2": question_2,
        "decision_2": decision_2,
        "scripted_values": scripted_values,
    }


@pytest.mark.parametrize(
    "status",
    [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING],
)
def test_refresh_follow_up_order2_pending_keeps_answering_and_exchanges(
    status: AgentRunStatus,
) -> None:
    records = _order2_refresh_records(order2_status=status)
    scripted = ScriptedSession(*records["scripted_values"])
    result = asyncio.run(
        service(scripted).refresh_follow_up_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=5,
        )
    )

    assert isinstance(result, PracticePrimaryAnswerWorkflowContext)
    assert result.follow_up_generation_run is records["follow_up_2"]
    assert result.follow_up_exchanges[0].question is records["question_1"]
    assert result.follow_up_exchanges[0].answer is records["answer_1"]
    assert result.attempt.status == "answering"
    assert result.session.version == 5
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


def test_refresh_follow_up_order2_failed_maps_stable_error_without_mutation() -> None:
    records = _order2_refresh_records(order2_status=AgentRunStatus.FAILED)
    scripted = ScriptedSession(*records["scripted_values"])

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).refresh_follow_up_generation(
                user_id=records["active"].user_id,  # type: ignore[union-attr]
                session_id=records["active"].id,  # type: ignore[union-attr]
                expected_version=5,
            )
        )

    assert error.value.code == PRACTICE_FOLLOW_UP_GENERATION_FAILED
    assert error.value.source_code == "provider_unavailable"
    assert records["active"].version == 5  # type: ignore[union-attr]
    assert records["attempt"].status == "answering"  # type: ignore[union-attr]
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_refresh_follow_up_order2_ask_q2_advances_to_answering_follow_up() -> None:
    records = _order2_refresh_records(
        order2_status=AgentRunStatus.SUCCEEDED,
        order2_action="askFollowUp",
        include_order2_question=True,
    )
    scripted = ScriptedSession(*records["scripted_values"])
    result = asyncio.run(
        service(scripted).refresh_follow_up_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=5,
        )
    )

    assert isinstance(result, PracticePrimaryAnswerWorkflowContext)
    assert result.follow_up_question is records["question_2"]
    assert result.follow_up_decision is records["decision_2"]
    assert len(result.follow_up_exchanges) == 1
    assert result.attempt.status == "answeringFollowUp"
    assert result.session.version == 6
    assert scripted.commit_count == 1


def test_refresh_follow_up_order2_complete_enqueues_all_answered_evaluation() -> None:
    records = _order2_refresh_records(
        order2_status=AgentRunStatus.SUCCEEDED,
        order2_action="complete",
    )
    evaluation = evaluation_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
        attempt_id=records["attempt"].id,  # type: ignore[union-attr]
        question_card_id=records["card"].id,  # type: ignore[union-attr]
        main_answer_id=records["answer"].id,  # type: ignore[union-attr]
        decision_id=records["decision_2"].id,  # type: ignore[union-attr]
        follow_up_completion_reason=(
            PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
        ),
        follow_up_question_1_id=records["question_1"].id,  # type: ignore[union-attr]
        follow_up_answer_1_id=records["answer_1"].id,  # type: ignore[union-attr]
    )
    scripted = ScriptedSession(*records["scripted_values"])
    fake_evaluation = FakeEvaluationGenerationService(evaluation)
    result = asyncio.run(
        service(
            scripted,
            fake_evaluation=fake_evaluation,
        ).refresh_follow_up_generation(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=5,
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.follow_up_completion_reason == (
        PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
    )
    assert len(result.follow_up_exchanges) == 1
    assert result.evaluation_generation_run is evaluation
    assert result.attempt.status == "evaluating"
    assert result.session.version == 6
    assert fake_evaluation.calls[0]["follow_up_completion_reason"] == (
        PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
    )
    assert scripted.flush_count == 1
    assert scripted.commit_count == 1


def test_submit_follow_up_answer_order2_persists_a2_without_order3_and_starts_evaluation() -> (
    None
):
    records = _order2_refresh_records(
        attempt_status="answeringFollowUp",
        order2_status=AgentRunStatus.SUCCEEDED,
        order2_action="askFollowUp",
        include_order2_question=True,
    )
    scripted = ScriptedSession(*records["scripted_values"])

    def build_evaluation(_kwargs: dict[str, object]) -> AgentRun:
        submitted = scripted.added[-1]
        assert isinstance(submitted, PracticeAnswer)
        return evaluation_run(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            attempt_id=records["attempt"].id,  # type: ignore[union-attr]
            question_card_id=records["card"].id,  # type: ignore[union-attr]
            main_answer_id=records["answer"].id,  # type: ignore[union-attr]
            decision_id=records["decision_2"].id,  # type: ignore[union-attr]
            follow_up_completion_reason=(
                PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
            ),
            follow_up_question_1_id=records["question_1"].id,  # type: ignore[union-attr]
            follow_up_answer_1_id=records["answer_1"].id,  # type: ignore[union-attr]
            follow_up_question_2_id=records["question_2"].id,  # type: ignore[union-attr]
            follow_up_answer_2_id=submitted.id,
        )

    fake_evaluation = FakeEvaluationGenerationService(run_factory=build_evaluation)
    result = asyncio.run(
        service(
            scripted,
            fake_evaluation=fake_evaluation,
        ).submit_follow_up_answer(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=5,
            question_id=records["card"].id,  # type: ignore[union-attr]
            follow_up_question_id=records["question_2"].id,  # type: ignore[union-attr]
            content="  The result was sustained. ",
        )
    )

    submitted = scripted.added[-1]
    assert isinstance(submitted, PracticeAnswer)
    assert submitted.kind == PracticeAnswerKind.FOLLOW_UP.value
    assert submitted.order == 3
    assert submitted.follow_up_question_id == records["question_2"].id
    assert len(result.follow_up_exchanges) == 2
    assert result.follow_up_exchanges[1].answer is submitted
    assert result.follow_up_completion_reason == (
        PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
    )
    assert result.attempt.status == "evaluating"
    assert result.session.version == 6
    assert fake_evaluation.calls[0]["follow_up_completion_reason"] == (
        PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
    )
    assert fake_evaluation.calls[0]["idempotency_key"] == (
        practice_evaluation_idempotency_key(records["attempt"].id)  # type: ignore[union-attr]
    )


def test_submit_follow_up_answer_order2_evaluation_failure_rolls_back() -> None:
    records = _order2_refresh_records(
        attempt_status="answeringFollowUp",
        order2_status=AgentRunStatus.SUCCEEDED,
        order2_action="askFollowUp",
        include_order2_question=True,
    )
    scripted = ScriptedSession(*records["scripted_values"])
    fake_evaluation = FakeEvaluationGenerationService(
        error=ValueError("missing evaluation model")
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_evaluation=fake_evaluation,
            ).submit_follow_up_answer(
                user_id=records["active"].user_id,  # type: ignore[union-attr]
                session_id=records["active"].id,  # type: ignore[union-attr]
                expected_version=5,
                question_id=records["card"].id,  # type: ignore[union-attr]
                follow_up_question_id=records["question_2"].id,  # type: ignore[union-attr]
                content="The result was sustained.",
            )
        )

    assert error.value.code == PRACTICE_EVALUATION_GENERATION_UNAVAILABLE
    assert records["active"].version == 5  # type: ignore[union-attr]
    assert records["attempt"].status == "answeringFollowUp"  # type: ignore[union-attr]
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1
    assert len(scripted.added) == 1


def test_end_follow_ups_order1_starts_ended_early_evaluation() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status="answeringFollowUp",
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    question = follow_up_question(attempt_id=attempt.id, run_id=follow_up.id)
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="askFollowUp",
        question_id=question.id,
    )
    evaluation = evaluation_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        decision_id=decision.id,
        follow_up_completion_reason=(
            PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
        ),
        unanswered_follow_up_question_id=question.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up,
        decision,
        question,
    )
    fake_evaluation = FakeEvaluationGenerationService(evaluation)

    result = asyncio.run(
        service(
            scripted,
            fake_evaluation=fake_evaluation,
        ).end_follow_ups(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
            follow_up_question_id=question.id,
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.attempt.status == "evaluating"
    assert result.session.version == 5
    assert result.follow_up_completion_reason == (
        PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
    )
    assert result.follow_up_question is question
    assert result.follow_up_exchanges == ()
    assert result.follow_up_decision is decision
    assert result.evaluation_generation_run is evaluation
    assert scripted.added == []
    assert fake_evaluation.calls[0]["follow_up_completion_reason"] == (
        PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
    )
    assert fake_evaluation.calls[0]["idempotency_key"] == (
        practice_evaluation_idempotency_key(attempt.id)
    )


def test_end_follow_ups_order2_freezes_q1_a1_and_pending_q2() -> None:
    records = _order2_refresh_records(
        attempt_status="answeringFollowUp",
        order2_status=AgentRunStatus.SUCCEEDED,
        order2_action="askFollowUp",
        include_order2_question=True,
    )
    evaluation = evaluation_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
        attempt_id=records["attempt"].id,  # type: ignore[union-attr]
        question_card_id=records["card"].id,  # type: ignore[union-attr]
        main_answer_id=records["answer"].id,  # type: ignore[union-attr]
        decision_id=records["decision_2"].id,  # type: ignore[union-attr]
        follow_up_completion_reason=(
            PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
        ),
        follow_up_question_1_id=records["question_1"].id,  # type: ignore[union-attr]
        follow_up_answer_1_id=records["answer_1"].id,  # type: ignore[union-attr]
        unanswered_follow_up_question_id=(
            records["question_2"].id  # type: ignore[union-attr]
        ),
    )
    scripted = ScriptedSession(*records["scripted_values"])
    result = asyncio.run(
        service(
            scripted,
            fake_evaluation=FakeEvaluationGenerationService(evaluation),
        ).end_follow_ups(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=5,
            question_id=records["card"].id,  # type: ignore[union-attr]
            follow_up_question_id=records["question_2"].id,  # type: ignore[union-attr]
        )
    )

    assert result.attempt.status == "evaluating"
    assert result.session.version == 6
    assert result.follow_up_question is records["question_2"]
    assert len(result.follow_up_exchanges) == 1
    assert result.follow_up_exchanges[0].question is records["question_1"]
    assert result.follow_up_exchanges[0].answer is records["answer_1"]
    assert result.follow_up_completion_reason == (
        PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
    )
    assert len(scripted.added) == 0


def test_end_follow_ups_replays_the_same_ended_early_evaluation_run() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=5,
        attempt_status="evaluating",
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    question = follow_up_question(attempt_id=attempt.id, run_id=follow_up.id)
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="askFollowUp",
        question_id=question.id,
    )
    evaluation = evaluation_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        decision_id=decision.id,
        follow_up_completion_reason=(
            PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
        ),
        unanswered_follow_up_question_id=question.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up,
        decision,
        question,
        evaluation,
    )

    result = asyncio.run(
        service(scripted).end_follow_ups(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
            follow_up_question_id=question.id,
        )
    )

    assert result.evaluation_generation_run is evaluation
    assert result.session.version == 5
    assert result.attempt.status == "evaluating"
    assert result.follow_up_question is question
    assert scripted.commit_count == 1
    assert scripted.added == []


@pytest.mark.parametrize(
    "attempt_status",
    ["generatingQuestion", "evaluating", "review"],
)
def test_end_follow_ups_rejects_invalid_attempt_status(
    attempt_status: str,
) -> None:
    active, attempt, _question_run, card = primary_answer_context(
        version=4,
        attempt_status=attempt_status,
    )
    scripted = ScriptedSession(active, attempt)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).end_follow_ups(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
                follow_up_question_id=uuid4(),
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT


def test_end_follow_ups_rejects_non_answering_follow_up_state() -> None:
    active, attempt, _question_run, card = primary_answer_context(
        version=4,
        attempt_status="answering",
    )
    scripted = ScriptedSession(active, attempt)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).end_follow_ups(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
                follow_up_question_id=uuid4(),
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert active.version == 4
    assert attempt.status == "answering"
    assert scripted.commit_count == 0


def test_end_follow_ups_rolls_back_when_evaluation_is_unavailable() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status="answeringFollowUp",
    )
    answer = main_answer(attempt_id=attempt.id, content="Stored answer")
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    question = follow_up_question(attempt_id=attempt.id, run_id=follow_up.id)
    decision = follow_up_decision(
        attempt_id=attempt.id,
        run_id=follow_up.id,
        action="askFollowUp",
        question_id=question.id,
    )
    scripted = ScriptedSession(
        active,
        attempt,
        question_run,
        card,
        answer,
        follow_up,
        decision,
        question,
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_evaluation=FakeEvaluationGenerationService(
                    error=ValueError("missing evaluation model")
                ),
            ).end_follow_ups(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
                follow_up_question_id=question.id,
            )
        )

    assert error.value.code == PRACTICE_EVALUATION_GENERATION_UNAVAILABLE
    assert active.version == 4
    assert attempt.status == "answeringFollowUp"
    assert scripted.flush_count == 1
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_submit_follow_up_answer_order2_replays_evaluating_snapshot() -> None:
    records = _order2_refresh_records(
        attempt_status="evaluating",
        order2_status=AgentRunStatus.SUCCEEDED,
        order2_action="askFollowUp",
        include_order2_question=True,
    )
    records["active"].version = 6  # type: ignore[union-attr]
    answer_2 = PracticeAnswer(
        id=uuid4(),
        attempt_id=records["attempt"].id,  # type: ignore[union-attr]
        kind=PracticeAnswerKind.FOLLOW_UP.value,
        order=3,
        content="The result was sustained.",
        follow_up_question_id=records["question_2"].id,  # type: ignore[union-attr]
        submitted_at=NOW,
    )
    evaluation = evaluation_run(
        user_id=records["active"].user_id,  # type: ignore[union-attr]
        attempt_id=records["attempt"].id,  # type: ignore[union-attr]
        question_card_id=records["card"].id,  # type: ignore[union-attr]
        main_answer_id=records["answer"].id,  # type: ignore[union-attr]
        decision_id=records["decision_2"].id,  # type: ignore[union-attr]
        follow_up_completion_reason=(
            PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
        ),
        follow_up_question_1_id=records["question_1"].id,  # type: ignore[union-attr]
        follow_up_answer_1_id=records["answer_1"].id,  # type: ignore[union-attr]
        follow_up_question_2_id=records["question_2"].id,  # type: ignore[union-attr]
        follow_up_answer_2_id=answer_2.id,
    )
    scripted = ScriptedSession(
        *records["scripted_values"][:-1],
        evaluation,
        records["scripted_values"][-1],
        answer_2,
    )

    result = asyncio.run(
        service(scripted).submit_follow_up_answer(
            user_id=records["active"].user_id,  # type: ignore[union-attr]
            session_id=records["active"].id,  # type: ignore[union-attr]
            expected_version=5,
            question_id=records["card"].id,  # type: ignore[union-attr]
            follow_up_question_id=records["question_2"].id,  # type: ignore[union-attr]
            content="The result was sustained.",
        )
    )

    assert isinstance(result, PracticeEvaluationWorkflowContext)
    assert result.evaluation_generation_run is evaluation
    assert result.follow_up_exchanges[1].answer is answer_2
    assert result.attempt.status == "evaluating"
    assert result.session.version == 6
    assert scripted.added == []


def _continue_review_records(action: str) -> dict[str, object]:
    records = evaluation_pipeline(
        review_status=AgentRunStatus.SUCCEEDED,
        recommendation_status=AgentRunStatus.SUCCEEDED,
        recommendation_action=action,
        attempt_status="review",
    )
    attempt = records["attempt"]
    assert isinstance(attempt, PracticeAttempt)
    attempt.completed_at = NOW
    return records


def _retry_review_records(action: str) -> dict[str, object]:
    records = _continue_review_records(action)
    active = records["active"]
    attempt = records["attempt"]
    question_run = records["question_run"]
    assert isinstance(active, PracticeSession)
    assert isinstance(attempt, PracticeAttempt)
    assert isinstance(question_run, AgentRun)
    active.version = 4
    attempt.completed_at = NOW - timedelta(minutes=5)
    question_run.idempotency_key = practice_question_generation_idempotency_key(
        active.id,
        attempt.id,
    )
    return records


def _retry_final_review_records() -> dict[str, object]:
    records = _retry_review_records("nextQuestion")
    active = records["active"]
    original = records["attempt"]
    question_run = records["question_run"]
    card = records["card"]
    original_answer = records["answer"]
    original_follow_up = records["follow_up"]
    original_decision = records["decision"]
    original_evaluation = records["evaluation"]
    original_evaluation_value = records["evaluation_value"]
    original_review = records["review"]
    original_review_value = records["review_value"]
    original_recommendation = records["recommendation"]
    original_recommendation_value = records["recommendation_value"]
    assert isinstance(active, PracticeSession)
    assert isinstance(original, PracticeAttempt)
    assert isinstance(question_run, AgentRun)
    assert isinstance(card, QuestionCard)
    original.status = PracticeAttemptStatus.COMPLETED.value

    retry_attempt = PracticeAttempt(
        id=uuid4(),
        user_id=active.user_id,
        session_id=active.id,
        attempt_number=2,
        question_type=original.question_type,
        difficulty=original.difficulty,
        status=PracticeAttemptStatus.REVIEW.value,
        question_generation_run_id=None,
        question_card_id=card.id,
        retry_of_attempt_id=original.id,
        created_at=NOW,
        updated_at=NOW,
        completed_at=NOW,
    )
    answer = main_answer(
        attempt_id=retry_attempt.id,
        content="The retry answer is canonical.",
    )
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=retry_attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    decision = follow_up_decision(
        attempt_id=retry_attempt.id,
        run_id=follow_up.id,
        action="complete",
    )
    evaluation = evaluation_run(
        user_id=active.user_id,
        attempt_id=retry_attempt.id,
        question_card_id=card.id,
        main_answer_id=answer.id,
        decision_id=decision.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    evaluation_value = evaluation_artifact(
        attempt_id=retry_attempt.id,
        run_id=evaluation.id,
    )
    review = review_run(
        user_id=active.user_id,
        attempt_id=retry_attempt.id,
        evaluation_id=evaluation_value.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    review_value = review_artifact(
        attempt_id=retry_attempt.id,
        run_id=review.id,
    )
    recommendation = recommendation_run(
        user_id=active.user_id,
        attempt_id=retry_attempt.id,
        evaluation_id=evaluation_value.id,
        review_id=review_value.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    recommendation_value = recommendation_artifact(
        attempt_id=retry_attempt.id,
        run_id=recommendation.id,
        action="nextQuestion",
    )
    return {
        "active": active,
        "attempt": retry_attempt,
        "original": original,
        "question_run": question_run,
        "card": card,
        "answer": answer,
        "follow_up": follow_up,
        "decision": decision,
        "evaluation": evaluation,
        "evaluation_value": evaluation_value,
        "review": review,
        "review_value": review_value,
        "recommendation": recommendation,
        "recommendation_value": recommendation_value,
        "scalar_values": [
            active,
            retry_attempt,
            original,
            question_run,
            card,
            card,
            answer,
            follow_up,
            decision,
            None,
            evaluation,
            evaluation_value,
            review,
            review_value,
            recommendation,
            recommendation_value,
        ],
        "completed_loader_scalar_values": [
            question_run,
            card,
            original_answer,
            original_follow_up,
            original_decision,
            None,
            original_evaluation,
            original_evaluation_value,
            original_review,
            original_review_value,
            original_recommendation,
            original_recommendation_value,
        ],
    }


@pytest.mark.parametrize("recommendation_action", ["retryCurrent", "nextQuestion"])
def test_retry_current_question_reuses_reviewed_question_without_generation(
    recommendation_action: str,
) -> None:
    records = _retry_review_records(recommendation_action)
    active = records["active"]
    attempt = records["attempt"]
    question_run = records["question_run"]
    card = records["card"]
    assert isinstance(active, PracticeSession)
    assert isinstance(attempt, PracticeAttempt)
    assert isinstance(question_run, AgentRun)
    assert isinstance(card, QuestionCard)
    completed_at = attempt.completed_at
    scripted = ScriptedSession(
        *records["scalar_values"],
        question_run,
        card,
    )
    fake_generation = FakeGenerationService()

    result = asyncio.run(
        service(
            scripted,
            fake_generation=fake_generation,
        ).retry_current_question(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=active.version,
            question_id=card.id,
        )
    )

    assert attempt.status == "completed"
    assert attempt.completed_at == completed_at
    assert result.attempt.attempt_number == 2
    assert result.attempt.status == "answering"
    assert result.attempt.question_card_id == card.id
    assert result.attempt.question_generation_run_id is None
    assert result.attempt.retry_of_attempt_id == attempt.id
    assert result.attempt.question_type == attempt.question_type
    assert result.attempt.difficulty == attempt.difficulty
    assert result.question_card is card
    assert result.question_generation_run is question_run
    assert active.status == "active"
    assert active.version == 5
    assert active.completed_at is None
    assert active.completion_reason is None
    assert fake_generation.calls == []
    assert scripted.added == [result.attempt]
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


def _retry_source_records() -> tuple[
    PracticeSession,
    PracticeAttempt,
    PracticeAttempt,
    PracticeAttempt,
    AgentRun,
    QuestionCard,
]:
    active, original, question_run, card = primary_answer_context(
        version=5,
        attempt_status="completed",
    )
    original.completed_at = NOW - timedelta(minutes=10)
    question_run.status = AgentRunStatus.SUCCEEDED
    question_run.idempotency_key = practice_question_generation_idempotency_key(
        active.id,
        original.id,
    )
    retry_one = PracticeAttempt(
        id=uuid4(),
        user_id=active.user_id,
        session_id=active.id,
        attempt_number=2,
        question_type=original.question_type,
        difficulty=original.difficulty,
        status="completed",
        question_generation_run_id=None,
        question_card_id=card.id,
        retry_of_attempt_id=original.id,
        created_at=NOW,
        updated_at=NOW,
        completed_at=NOW - timedelta(minutes=5),
    )
    retry_two = PracticeAttempt(
        id=uuid4(),
        user_id=active.user_id,
        session_id=active.id,
        attempt_number=3,
        question_type=original.question_type,
        difficulty=original.difficulty,
        status="answering",
        question_generation_run_id=None,
        question_card_id=card.id,
        retry_of_attempt_id=retry_one.id,
        created_at=NOW,
        updated_at=NOW,
        completed_at=None,
    )
    return active, original, retry_one, retry_two, question_run, card


def test_retry_question_source_resolver_reaches_original_source_and_stable_key() -> (
    None
):
    active, original, retry_one, retry_two, question_run, card = _retry_source_records()
    scripted = ScriptedSession(retry_one, original, question_run, card)

    source = asyncio.run(
        service(scripted)._load_question_source(
            active,
            retry_two,
            for_update=False,
            require_succeeded=True,
        )
    )

    assert source.attempt is original
    assert source.generation_run is question_run
    assert source.question_card is card
    assert question_run.idempotency_key == (
        practice_question_generation_idempotency_key(active.id, original.id)
    )
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


@pytest.mark.parametrize(
    "corruption",
    [
        "parent_missing",
        "parent_user",
        "parent_session",
        "wrong_number",
        "wrong_card",
        "wrong_type",
        "wrong_difficulty",
        "child_generation_run",
        "source_not_succeeded",
        "source_key",
        "source_role",
        "source_language",
        "source_question_type",
        "source_difficulty",
        "card_source_run",
        "cycle",
    ],
)
def test_retry_question_source_resolver_rejects_corruption(
    corruption: str,
) -> None:
    active, original, retry_one, retry_two, question_run, card = _retry_source_records()
    scalar_values: list[object]
    if corruption == "parent_missing":
        scalar_values = [None]
    elif corruption == "parent_user":
        retry_one.user_id = uuid4()
        scalar_values = [retry_one]
    elif corruption == "parent_session":
        retry_one.session_id = uuid4()
        scalar_values = [retry_one]
    elif corruption == "wrong_number":
        retry_two.attempt_number = 4
        scalar_values = [retry_one]
    elif corruption == "wrong_card":
        retry_one.question_card_id = uuid4()
        scalar_values = [retry_one]
    elif corruption == "wrong_type":
        retry_one.question_type = "behavioral"
        scalar_values = [retry_one]
    elif corruption == "wrong_difficulty":
        retry_one.difficulty = "pressure"
        scalar_values = [retry_one]
    elif corruption == "child_generation_run":
        retry_two.question_generation_run_id = question_run.id
        scalar_values = []
    elif corruption == "source_not_succeeded":
        question_run.status = AgentRunStatus.QUEUED
        scalar_values = [retry_one, original, question_run, card]
    elif corruption == "source_key":
        question_run.idempotency_key = "wrong-source-key"
        scalar_values = [retry_one, original, question_run, card]
    elif corruption == "source_role":
        question_run.payload["roleId"] = str(uuid4())
        scalar_values = [retry_one, original, question_run, card]
    elif corruption == "source_language":
        question_run.payload["interactionLanguage"] = "zh-CN"
        scalar_values = [retry_one, original, question_run, card]
    elif corruption == "source_question_type":
        question_run.payload["questionType"] = "behavioral"
        scalar_values = [retry_one, original, question_run, card]
    elif corruption == "source_difficulty":
        question_run.payload["difficulty"] = "pressure"
        scalar_values = [retry_one, original, question_run, card]
    elif corruption == "card_source_run":
        card.source_agent_run_id = uuid4()
        scalar_values = [retry_one, original, question_run, card]
    elif corruption == "cycle":
        retry_one.retry_of_attempt_id = retry_two.id
        scalar_values = [retry_one, retry_two]
    else:
        raise AssertionError(f"unexpected corruption: {corruption}")

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(ScriptedSession(*scalar_values))._load_question_source(
                active,
                retry_two,
                for_update=False,
                require_succeeded=True,
            )
        )

    assert error.value.code == PRACTICE_QUESTION_GENERATION_STATE_CONFLICT


def test_retry_current_question_replays_without_duplicate_attempt_or_version() -> None:
    records = _retry_review_records("nextQuestion")
    active = records["active"]
    original = records["attempt"]
    question_run = records["question_run"]
    card = records["card"]
    assert isinstance(active, PracticeSession)
    assert isinstance(original, PracticeAttempt)
    assert isinstance(question_run, AgentRun)
    assert isinstance(card, QuestionCard)
    original.status = "completed"
    original.completed_at = NOW - timedelta(minutes=5)
    retry_attempt = PracticeAttempt(
        id=uuid4(),
        user_id=active.user_id,
        session_id=active.id,
        attempt_number=2,
        question_type=original.question_type,
        difficulty=original.difficulty,
        status="answering",
        question_generation_run_id=None,
        question_card_id=card.id,
        retry_of_attempt_id=original.id,
        created_at=NOW,
        updated_at=NOW,
        completed_at=None,
    )
    active.version = 5
    scalar_values = [
        active,
        retry_attempt,
        original,
        records["question_run"],
        records["card"],
        records["answer"],
        records["follow_up"],
        records["decision"],
        None,
        records["evaluation"],
        records["evaluation_value"],
        records["review"],
        records["review_value"],
        records["recommendation"],
        records["recommendation_value"],
        original,
        question_run,
        card,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    ]

    class ReplayScriptedSession(ScriptedSession):
        def __init__(self, *values: object) -> None:
            super().__init__(*values)
            self._scalars_calls = 0

        async def scalars(self, statement: Any) -> Any:
            self._scalars_calls += 1
            if self._scalars_calls > 4:
                self.statements.append(statement)

                class EmptyResult:
                    def all(self) -> list[object]:
                        return []

                return EmptyResult()
            return await super().scalars(statement)

    scripted = ReplayScriptedSession(*scalar_values)
    result = asyncio.run(
        service(scripted).retry_current_question(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
        )
    )

    assert result.attempt is retry_attempt
    assert result.question_generation_run is question_run
    assert result.question_card is card
    assert active.version == 5
    assert scripted.added == []
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


def test_get_retry_question_is_a_pure_read_and_returns_canonical_source() -> None:
    active, original, _retry_one, retry_two, question_run, card = (
        _retry_source_records()
    )
    retry_two.attempt_number = 2
    retry_two.retry_of_attempt_id = original.id
    original.status = "completed"
    scripted = ScriptedSession(
        active,
        retry_two,
        original,
        question_run,
        card,
        card,
        None,
    )

    result = asyncio.run(
        service(scripted).get_session_context(
            user_id=active.user_id,
            session_id=active.id,
        )
    )

    assert isinstance(result, PracticeSessionWorkflowContext)
    assert result.attempt is retry_two
    assert result.question_card is card
    assert result.question_generation_run is question_run
    assert active.version == 5
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0
    assert all(
        getattr(statement, "_for_update_arg", None) is None
        for statement in scripted.statements
    )


def test_submit_primary_answer_on_retry_uses_retry_attempt_and_new_follow_up_key() -> (
    None
):
    active, original, _retry_one, retry_attempt, question_run, card = (
        _retry_source_records()
    )
    retry_attempt.attempt_number = 2
    retry_attempt.retry_of_attempt_id = original.id
    original.status = "completed"
    follow_up = follow_up_run(
        user_id=active.user_id,
        attempt_id=retry_attempt.id,
        question_card_id=card.id,
        main_answer_id=uuid4(),
    )
    scripted = ScriptedSession(
        active,
        retry_attempt,
        original,
        question_run,
        card,
        card,
        None,
    )
    fake_follow_up = FakeFollowUpGenerationService(follow_up)

    result = asyncio.run(
        service(
            scripted,
            fake_follow_up=fake_follow_up,
        ).submit_primary_answer(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=5,
            question_id=card.id,
            content="The retry answer has new evidence.",
        )
    )

    assert result.attempt is retry_attempt
    assert result.main_answer.attempt_id == retry_attempt.id
    assert result.follow_up_generation_run is follow_up
    assert fake_follow_up.calls[0]["attempt_id"] == retry_attempt.id
    assert fake_follow_up.calls[0]["idempotency_key"] == (
        practice_follow_up_idempotency_key(retry_attempt.id, 1)
    )
    assert active.version == 6
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


def _next_question_run_factory(kwargs: dict[str, object]) -> AgentRun:
    user_id = kwargs["user_id"]
    role_id = kwargs["target_role_id"]
    question_type = kwargs["question_type"]
    difficulty = kwargs["difficulty"]
    idempotency_key = kwargs["idempotency_key"]
    assert isinstance(user_id, UUID)
    assert isinstance(role_id, UUID)
    assert isinstance(question_type, QuestionCardQuestionType)
    assert isinstance(difficulty, QuestionCardDifficulty)
    assert isinstance(idempotency_key, str)
    run = generation_run(
        user_id=user_id,
        payload=generation_payload(
            role_id=role_id,
            question_type=question_type,
            difficulty=difficulty,
        ),
    )
    run.idempotency_key = idempotency_key
    return run


def _early_end_scalar_values(
    active: PracticeSession,
    attempt: PracticeAttempt,
    question_run: AgentRun,
    card: QuestionCard,
    *extra: object,
) -> list[object]:
    question_run.idempotency_key = practice_question_generation_idempotency_key(
        active.id,
        attempt.id,
    )
    return [active, attempt, question_run, card, *extra, *([None] * 8)]


def test_end_session_early_ends_unanswered_question_without_artifacts() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status=PracticeAttemptStatus.ANSWERING.value,
    )
    scripted = ScriptedSession(
        *_early_end_scalar_values(active, attempt, question_run, card)
    )
    fake_generation = FakeGenerationService()
    fake_follow_up = FakeFollowUpGenerationService()
    fake_evaluation = FakeEvaluationGenerationService()
    fake_review = FakeReviewGenerationService()
    fake_recommendation = FakeRecommendationGenerationService()

    result = asyncio.run(
        service(
            scripted,
            fake_generation=fake_generation,
            fake_follow_up=fake_follow_up,
            fake_evaluation=fake_evaluation,
            fake_review=fake_review,
            fake_recommendation=fake_recommendation,
        ).end_session_early(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=active.version,
            question_id=card.id,
        )
    )

    assert isinstance(result, PracticeEndedEarlySessionWorkflowContext)
    assert result.session is active
    assert result.unfinished_attempt is attempt
    assert result.question_context.attempt is attempt
    assert result.question_context.question_card is card
    assert result.question_context.question_generation_run is question_run
    assert result.completed_attempt_review_contexts == ()
    assert active.status == PracticeSessionStatus.COMPLETED.value
    assert (
        active.completion_reason
        == PracticeSessionCompletionReason.USER_ENDED_EARLY.value
    )
    assert active.completed_at == NOW
    assert active.version == 5
    assert attempt.status == PracticeAttemptStatus.ENDED_EARLY.value
    assert attempt.completed_at == NOW
    assert attempt.updated_at == NOW
    assert scripted.added == []
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0
    assert fake_generation.calls == []
    assert fake_follow_up.calls == []
    assert fake_evaluation.calls == []
    assert fake_review.calls == []
    assert fake_recommendation.calls == []


def test_end_session_early_rejects_db_answering_with_main_answer_and_follow_up_run() -> (
    None
):
    records = evaluation_pipeline(attempt_status=PracticeAttemptStatus.ANSWERING.value)
    active = records["active"]
    attempt = records["attempt"]
    card = records["card"]
    assert isinstance(active, PracticeSession)
    assert isinstance(attempt, PracticeAttempt)
    assert isinstance(card, QuestionCard)
    question_run = records["question_run"]
    assert isinstance(question_run, AgentRun)
    question_run.idempotency_key = practice_question_generation_idempotency_key(
        active.id,
        attempt.id,
    )
    scripted = ScriptedSession(*records["scalar_values"])
    fake_follow_up = FakeFollowUpGenerationService()

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted, fake_follow_up=fake_follow_up).end_session_early(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=active.version,
                question_id=card.id,
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert active.status == PracticeSessionStatus.ACTIVE.value
    assert active.version == 4
    assert active.completed_at is None
    assert active.completion_reason is None
    assert attempt.status == PracticeAttemptStatus.ANSWERING.value
    assert attempt.completed_at is None
    assert scripted.added == []
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1
    assert fake_follow_up.calls == []


@pytest.mark.parametrize(
    ("session_status", "attempt_status", "question_matches"),
    [
        (PracticeSessionStatus.ACTIVE.value, "generatingQuestion", True),
        (PracticeSessionStatus.ACTIVE.value, "answeringFollowUp", True),
        (PracticeSessionStatus.ACTIVE.value, "evaluating", True),
        (PracticeSessionStatus.ACTIVE.value, "review", True),
        (PracticeSessionStatus.COMPLETED.value, "answering", True),
        (PracticeSessionStatus.ACTIVE.value, "answering", False),
    ],
)
def test_end_session_early_rejects_non_answering_or_invalid_session_state(
    session_status: str,
    attempt_status: str,
    question_matches: bool,
) -> None:
    active, attempt, _question_run, card = primary_answer_context(
        version=4,
        attempt_status=attempt_status,
    )
    active.status = session_status
    if session_status == PracticeSessionStatus.COMPLETED.value:
        active.completed_at = NOW
        active.completion_reason = (
            PracticeSessionCompletionReason.REVIEW_COMPLETED.value
        )
    scripted = ScriptedSession(active, attempt)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).end_session_early(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=active.version,
                question_id=card.id if question_matches else uuid4(),
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert active.version == 4
    assert attempt.status == attempt_status
    assert scripted.added == []
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_end_session_early_replays_without_version_or_timestamp_changes() -> None:
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status=PracticeAttemptStatus.ANSWERING.value,
    )
    first_scripted = ScriptedSession(
        *_early_end_scalar_values(active, attempt, question_run, card)
    )
    first = asyncio.run(
        service(first_scripted).end_session_early(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
        )
    )
    session_completed_at = first.session.completed_at
    session_updated_at = first.session.updated_at
    attempt_completed_at = first.unfinished_attempt.completed_at
    attempt_updated_at = first.unfinished_attempt.updated_at

    replay_scripted = ScriptedSession(
        *_early_end_scalar_values(active, attempt, question_run, card)
    )
    clock_calls = 0

    def clock() -> datetime:
        nonlocal clock_calls
        clock_calls += 1
        return NOW + timedelta(minutes=1)

    replay = asyncio.run(
        PracticeSessionService(
            replay_scripted,
            clock=clock,
        ).end_session_early(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
        )
    )

    assert replay.unfinished_attempt is attempt
    assert replay.question_context.question_card is card
    assert replay.session.version == 5
    assert replay.session.completed_at == session_completed_at
    assert replay.session.updated_at == session_updated_at
    assert replay.unfinished_attempt.completed_at == attempt_completed_at
    assert replay.unfinished_attempt.updated_at == attempt_updated_at
    assert clock_calls == 0
    assert replay_scripted.added == []
    assert replay_scripted.commit_count == 1
    assert replay_scripted.rollback_count == 0


def test_end_session_early_replay_rejects_wrong_question_or_new_response_artifact() -> (
    None
):
    active, attempt, question_run, card = primary_answer_context(
        version=4,
        attempt_status=PracticeAttemptStatus.ANSWERING.value,
    )
    first_scripted = ScriptedSession(
        *_early_end_scalar_values(active, attempt, question_run, card)
    )
    asyncio.run(
        service(first_scripted).end_session_early(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
        )
    )

    for question_id, extra in (
        (uuid4(), ()),
        (card.id, (main_answer(attempt_id=attempt.id),)),
    ):
        replay_scripted = ScriptedSession(
            *_early_end_scalar_values(
                active,
                attempt,
                question_run,
                card,
                *extra,
            )
        )
        with pytest.raises(PracticeSessionStateError) as error:
            asyncio.run(
                service(replay_scripted).end_session_early(
                    user_id=active.user_id,
                    session_id=active.id,
                    expected_version=4,
                    question_id=question_id,
                )
            )
        assert error.value.code == PRACTICE_SESSION_VERSION_CONFLICT
        assert replay_scripted.added == []
        assert replay_scripted.commit_count == 0
        assert replay_scripted.rollback_count == 1


@pytest.mark.parametrize("recommendation_action", ["nextQuestion", "retryCurrent"])
def test_continue_to_next_question_completes_review_and_enqueues_new_attempt(
    recommendation_action: str,
) -> None:
    records = _continue_review_records(recommendation_action)
    active = records["active"]
    attempt = records["attempt"]
    card = records["card"]
    assert isinstance(active, PracticeSession)
    assert isinstance(attempt, PracticeAttempt)
    assert isinstance(card, QuestionCard)
    completed_at = attempt.completed_at
    fake_generation = FakeGenerationService(run_factory=_next_question_run_factory)
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(scripted, fake_generation=fake_generation).continue_to_next_question(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=active.version,
            question_id=card.id,
        )
    )

    assert result.session is active
    assert result.session.status == "active"
    assert result.session.version == 5
    assert result.session.completed_at is None
    assert result.session.completion_reason is None
    assert attempt.status == "completed"
    assert attempt.completed_at == completed_at
    assert result.attempt.attempt_number == 2
    assert result.attempt.status == "generatingQuestion"
    assert result.attempt.question_type == "projectDeepDive"
    assert result.attempt.difficulty == "basic"
    assert result.attempt.retry_of_attempt_id is None
    assert (
        result.attempt.question_generation_run_id == result.question_generation_run.id
    )
    assert result.attempt.completed_at is None
    assert result.question_card is None
    assert fake_generation.calls[0] == {
        "user_id": active.user_id,
        "target_role_id": active.target_role_id,
        "question_type": QuestionCardQuestionType.PROJECT_DEEP_DIVE,
        "difficulty": QuestionCardDifficulty.BASIC,
        "interaction_language": active.language,
        "idempotency_key": practice_question_generation_idempotency_key(
            active.id,
            result.attempt.id,
        ),
    }
    assert scripted.flush_count == 2
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


def test_continue_to_next_question_replays_lost_response_without_new_attempt() -> None:
    records = _continue_review_records("nextQuestion")
    active = records["active"]
    old_attempt = records["attempt"]
    card = records["card"]
    assert isinstance(active, PracticeSession)
    assert isinstance(old_attempt, PracticeAttempt)
    assert isinstance(card, QuestionCard)
    first_scripted = ScriptedSession(*records["scalar_values"])
    first = asyncio.run(
        service(
            first_scripted,
            fake_generation=FakeGenerationService(
                run_factory=_next_question_run_factory,
            ),
        ).continue_to_next_question(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
        )
    )
    new_attempt = first.attempt
    new_run = first.question_generation_run

    replay_scripted = ScriptedSession(
        active,
        new_attempt,
        old_attempt,
        records["question_run"],
        records["card"],
        records["answer"],
        records["follow_up"],
        records["decision"],
        None,
        records["evaluation"],
        records["evaluation_value"],
        records["review"],
        records["review_value"],
        records["recommendation"],
        records["recommendation_value"],
        new_run,
    )
    replay = asyncio.run(
        service(replay_scripted).continue_to_next_question(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
        )
    )

    assert replay.attempt is new_attempt
    assert replay.question_generation_run is new_run
    assert replay.session.version == 5
    assert replay_scripted.added == []
    assert replay_scripted.commit_count == 1
    assert replay_scripted.rollback_count == 0


def test_continue_to_next_question_enqueue_failure_rolls_back_review_transition() -> (
    None
):
    records = _continue_review_records("retryCurrent")
    active = records["active"]
    attempt = records["attempt"]
    card = records["card"]
    assert isinstance(active, PracticeSession)
    assert isinstance(attempt, PracticeAttempt)
    assert isinstance(card, QuestionCard)
    scripted = ScriptedSession(*records["scalar_values"])
    fake_generation = FakeGenerationService(error=ValueError("missing model"))

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_generation=fake_generation,
            ).continue_to_next_question(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
            )
        )

    assert error.value.code == PRACTICE_QUESTION_GENERATION_UNAVAILABLE
    assert error.value.source_code == "question_generation_unavailable"
    assert active.version == 4
    assert attempt.status == "review"
    assert attempt.completed_at == NOW
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


@pytest.mark.parametrize(
    ("session_status", "attempt_status", "question_matches"),
    [
        ("completed", "review", True),
        ("active", "answering", True),
        ("active", "review", False),
    ],
)
def test_continue_to_next_question_rejects_invalid_entry_state(
    session_status: str,
    attempt_status: str,
    question_matches: bool,
) -> None:
    active, attempt, _question_run, card = primary_answer_context(
        version=4,
        attempt_status=attempt_status,
    )
    active.status = session_status
    attempt.completed_at = NOW
    scripted = ScriptedSession(active, attempt)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).continue_to_next_question(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id if question_matches else uuid4(),
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert scripted.added == []
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_continue_to_next_question_maps_generation_prerequisite_failure() -> None:
    records = _continue_review_records("nextQuestion")
    active = records["active"]
    attempt = records["attempt"]
    card = records["card"]
    assert isinstance(active, PracticeSession)
    assert isinstance(attempt, PracticeAttempt)
    assert isinstance(card, QuestionCard)
    scripted = ScriptedSession(*records["scalar_values"])
    fake_generation = FakeGenerationService(
        error=QuestionGenerationStateError(
            "question_generation_matching_analysis_stale"
        )
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(
                scripted,
                fake_generation=fake_generation,
            ).continue_to_next_question(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
            )
        )

    assert error.value.code == PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED
    assert error.value.source_code == "question_generation_matching_analysis_stale"
    assert active.version == 4
    assert attempt.status == "review"
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_continue_to_next_question_maps_empty_llm_configuration() -> None:
    records = _continue_review_records("nextQuestion")
    active = records["active"]
    attempt = records["attempt"]
    card = records["card"]
    assert isinstance(active, PracticeSession)
    assert isinstance(attempt, PracticeAttempt)
    assert isinstance(card, QuestionCard)
    scripted = ScriptedSession(*records["scalar_values"])
    domain = PracticeSessionService(
        scripted,  # type: ignore[arg-type]
        llm_model="",
        clock=lambda: NOW,
    )

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            domain.continue_to_next_question(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=card.id,
            )
        )

    assert error.value.code == PRACTICE_QUESTION_GENERATION_UNAVAILABLE
    assert error.value.source_code == "question_generation_unavailable"
    assert active.version == 4
    assert attempt.status == "review"
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def _continue_replay_scripted_session(
    records: dict[str, object],
    *,
    active: PracticeSession,
    previous_attempt: PracticeAttempt,
    next_attempt: PracticeAttempt,
    next_run: AgentRun,
) -> ScriptedSession:
    return ScriptedSession(
        active,
        next_attempt,
        previous_attempt,
        records["question_run"],
        records["card"],
        records["answer"],
        records["follow_up"],
        records["decision"],
        None,
        records["evaluation"],
        records["evaluation_value"],
        records["review"],
        records["review_value"],
        records["recommendation"],
        records["recommendation_value"],
        next_run,
    )


@pytest.mark.parametrize(
    "corruption",
    [
        "wrong_number",
        "retry_of",
        "wrong_type",
        "wrong_difficulty",
        "missing_run",
        "wrong_run_key",
        "wrong_run_payload",
        "old_not_completed",
        "old_question_mismatch",
    ],
)
def test_continue_to_next_question_rejects_corrupt_replay(
    corruption: str,
) -> None:
    records = _continue_review_records("nextQuestion")
    active = records["active"]
    previous_attempt = records["attempt"]
    card = records["card"]
    assert isinstance(active, PracticeSession)
    assert isinstance(previous_attempt, PracticeAttempt)
    assert isinstance(card, QuestionCard)
    first_scripted = ScriptedSession(*records["scalar_values"])
    first = asyncio.run(
        service(
            first_scripted,
            fake_generation=FakeGenerationService(
                run_factory=_next_question_run_factory,
            ),
        ).continue_to_next_question(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
            question_id=card.id,
        )
    )
    next_attempt = first.attempt
    next_run = first.question_generation_run
    question_id = card.id
    if corruption == "wrong_number":
        next_attempt.attempt_number = 3
    elif corruption == "retry_of":
        next_attempt.retry_of_attempt_id = uuid4()
    elif corruption == "wrong_type":
        next_attempt.question_type = "behavioral"
    elif corruption == "wrong_difficulty":
        next_attempt.difficulty = "advanced"
    elif corruption == "missing_run":
        next_attempt.question_generation_run_id = None
    elif corruption == "wrong_run_key":
        next_run.idempotency_key = "wrong-key"
    elif corruption == "wrong_run_payload":
        next_run.payload = {
            **next_run.payload,
            "roleId": str(uuid4()),
        }
    elif corruption == "old_not_completed":
        previous_attempt.status = "review"
    elif corruption == "old_question_mismatch":
        question_id = uuid4()
    else:
        raise AssertionError(f"unexpected corruption: {corruption}")

    replay_scripted = _continue_replay_scripted_session(
        records,
        active=active,
        previous_attempt=previous_attempt,
        next_attempt=next_attempt,
        next_run=next_run,
    )
    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(replay_scripted).continue_to_next_question(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
                question_id=question_id,
            )
        )

    assert error.value.code == PRACTICE_SESSION_VERSION_CONFLICT
    assert active.version == 5
    assert replay_scripted.added == []
    assert replay_scripted.commit_count == 0
    assert replay_scripted.rollback_count == 1


@pytest.mark.parametrize("recommendation_action", ["retryCurrent", "nextQuestion"])
def test_complete_session_after_review_completes_canonical_review(
    recommendation_action: str,
) -> None:
    records = _continue_review_records(recommendation_action)
    active = records["active"]
    attempt = records["attempt"]
    assert isinstance(active, PracticeSession)
    assert isinstance(attempt, PracticeAttempt)
    previous_attempt_completed_at = attempt.completed_at
    fake_generation = FakeGenerationService()
    fake_follow_up = FakeFollowUpGenerationService()
    fake_evaluation = FakeEvaluationGenerationService()
    fake_review = FakeReviewGenerationService()
    fake_recommendation = FakeRecommendationGenerationService()
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(
            scripted,
            fake_generation=fake_generation,
            fake_follow_up=fake_follow_up,
            fake_evaluation=fake_evaluation,
            fake_review=fake_review,
            fake_recommendation=fake_recommendation,
        ).complete_session_after_review(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=active.version,
        )
    )

    assert isinstance(result, PracticeCompletedSessionWorkflowContext)
    assert result.session is active
    assert result.final_attempt is attempt
    assert result.final_review_context.attempt is attempt
    assert result.session.status == "completed"
    assert result.session.completion_reason == (
        PracticeSessionCompletionReason.REVIEW_COMPLETED.value
    )
    assert result.session.completed_at == NOW
    assert result.session.version == 5
    assert result.final_attempt.status == "completed"
    assert result.final_attempt.completed_at == previous_attempt_completed_at
    assert result.final_attempt.updated_at == NOW
    assert scripted.added == []
    assert scripted.flush_count == 0
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0
    assert fake_generation.calls == []
    assert fake_follow_up.calls == []
    assert fake_evaluation.calls == []
    assert fake_review.calls == []
    assert fake_recommendation.calls == []


@pytest.mark.parametrize(
    ("session_status", "attempt_status"),
    [
        ("completed", "review"),
        ("active", "generatingQuestion"),
        ("active", "answering"),
        ("active", "answeringFollowUp"),
        ("active", "evaluating"),
    ],
)
def test_complete_session_after_review_rejects_invalid_entry_state(
    session_status: str,
    attempt_status: str,
) -> None:
    active, attempt, _question_run, _card = primary_answer_context(
        version=4,
        attempt_status=attempt_status,
    )
    active.status = session_status
    if session_status == "completed":
        active.completed_at = NOW
        active.completion_reason = (
            PracticeSessionCompletionReason.REVIEW_COMPLETED.value
        )
    attempt.completed_at = NOW
    scripted = ScriptedSession(active, attempt)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).complete_session_after_review(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
            )
        )

    assert error.value.code == PRACTICE_SESSION_STATE_CONFLICT
    assert active.status == session_status
    assert active.version == 4
    assert attempt.status == attempt_status
    assert scripted.added == []
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


@pytest.mark.parametrize(
    "corruption",
    ["missing_evaluation", "missing_review", "missing_recommendation", "wrong_source"],
)
def test_complete_session_after_review_rejects_corrupt_pipeline_without_mutation(
    corruption: str,
) -> None:
    records = _continue_review_records("nextQuestion")
    active = records["active"]
    attempt = records["attempt"]
    question_run = records["question_run"]
    assert isinstance(active, PracticeSession)
    assert isinstance(attempt, PracticeAttempt)
    assert isinstance(question_run, AgentRun)
    scalar_values = list(records["scalar_values"])  # type: ignore[arg-type]
    if corruption == "missing_evaluation":
        scalar_values[9] = None
    elif corruption == "missing_review":
        scalar_values[11] = None
    elif corruption == "missing_recommendation":
        scalar_values[13] = None
    elif corruption == "wrong_source":
        question_run.payload = {
            **question_run.payload,
            "roleId": str(uuid4()),
        }
    else:
        raise AssertionError(f"unexpected corruption: {corruption}")
    scripted = ScriptedSession(*scalar_values)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).complete_session_after_review(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
            )
        )

    assert error.value.code in {
        PRACTICE_SESSION_STATE_CONFLICT,
        PRACTICE_QUESTION_GENERATION_STATE_CONFLICT,
        PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT,
        PRACTICE_REVIEW_GENERATION_STATE_CONFLICT,
        PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT,
    }
    assert active.status == "active"
    assert active.version == 4
    assert active.completed_at is None
    assert active.completion_reason is None
    assert attempt.status == "review"
    assert attempt.completed_at == NOW
    assert scripted.added == []
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_complete_session_after_review_replays_canonical_completed_session() -> None:
    records = _continue_review_records("retryCurrent")
    active = records["active"]
    attempt = records["attempt"]
    assert isinstance(active, PracticeSession)
    assert isinstance(attempt, PracticeAttempt)
    active.status = "completed"
    active.version = 5
    active.completed_at = NOW + timedelta(minutes=1)
    active.completion_reason = PracticeSessionCompletionReason.REVIEW_COMPLETED.value
    previous_session_completed_at = active.completed_at
    previous_session_updated_at = active.updated_at
    previous_attempt_completed_at = attempt.completed_at
    attempt.status = "completed"
    clock_calls = 0

    def clock() -> datetime:
        nonlocal clock_calls
        clock_calls += 1
        return NOW + timedelta(minutes=2)

    scripted = ScriptedSession(*records["scalar_values"])
    result = asyncio.run(
        PracticeSessionService(
            scripted,  # type: ignore[arg-type]
            clock=clock,
        ).complete_session_after_review(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
        )
    )

    assert result.session is active
    assert result.final_attempt is attempt
    assert result.session.status == "completed"
    assert result.session.version == 5
    assert result.session.completed_at == previous_session_completed_at
    assert result.session.updated_at == previous_session_updated_at
    assert result.final_attempt.status == "completed"
    assert result.final_attempt.completed_at == previous_attempt_completed_at
    assert clock_calls == 0
    assert scripted.added == []
    assert scripted.commit_count == 1
    assert scripted.rollback_count == 0


@pytest.mark.parametrize(
    "corruption",
    [
        "wrong_reason",
        "completed_at_null",
        "naive_completed_at",
        "wrong_version",
        "final_attempt_status",
        "final_attempt_completed_at_null",
        "missing_evaluation",
        "missing_review",
        "missing_recommendation",
        "wrong_source",
    ],
)
def test_complete_session_after_review_rejects_corrupt_replay(
    corruption: str,
) -> None:
    records = _continue_review_records("nextQuestion")
    active = records["active"]
    attempt = records["attempt"]
    question_run = records["question_run"]
    assert isinstance(active, PracticeSession)
    assert isinstance(attempt, PracticeAttempt)
    assert isinstance(question_run, AgentRun)
    active.status = "completed"
    active.version = 5
    active.completed_at = NOW + timedelta(minutes=1)
    active.completion_reason = PracticeSessionCompletionReason.REVIEW_COMPLETED.value
    attempt.status = "completed"
    scalar_values = list(records["scalar_values"])  # type: ignore[arg-type]
    if corruption == "wrong_reason":
        active.completion_reason = "userEndedEarly"
    elif corruption == "completed_at_null":
        active.completed_at = None
    elif corruption == "naive_completed_at":
        active.completed_at = datetime(2026, 8, 10, 10, 1)
    elif corruption == "wrong_version":
        active.version = 7
    elif corruption == "final_attempt_status":
        attempt.status = "review"
    elif corruption == "final_attempt_completed_at_null":
        attempt.completed_at = None
    elif corruption == "missing_evaluation":
        scalar_values[9] = None
    elif corruption == "missing_review":
        scalar_values[11] = None
    elif corruption == "missing_recommendation":
        scalar_values[13] = None
    elif corruption == "wrong_source":
        question_run.payload = {
            **question_run.payload,
            "roleId": str(uuid4()),
        }
    else:
        raise AssertionError(f"unexpected corruption: {corruption}")
    scripted = ScriptedSession(*scalar_values)

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(scripted).complete_session_after_review(
                user_id=active.user_id,
                session_id=active.id,
                expected_version=4,
            )
        )

    assert error.value.code == PRACTICE_SESSION_VERSION_CONFLICT
    assert active.version in {5, 7}
    assert attempt.status in {"completed", "review"}
    assert scripted.added == []
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 1


def test_get_active_session_context_ignores_completed_session_after_completion() -> (
    None
):
    scripted = ScriptedSession(None)
    result = asyncio.run(service(scripted).get_active_session_context(user_id=uuid4()))

    assert result is None
    assert scripted.commit_count == 0
    assert scripted.rollback_count == 0


def test_complete_session_after_review_accepts_a_single_completed_attempt() -> None:
    records = _continue_review_records("nextQuestion")
    active = records["active"]
    attempt = records["attempt"]
    assert isinstance(active, PracticeSession)
    assert isinstance(attempt, PracticeAttempt)
    scripted = ScriptedSession(*records["scalar_values"])

    result = asyncio.run(
        service(scripted).complete_session_after_review(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
        )
    )

    assert result.final_attempt is attempt
    assert result.final_attempt.attempt_number == 1
    assert result.final_attempt.status == PracticeAttemptStatus.COMPLETED.value
    assert result.session.status == "completed"
    assert result.session.version == 5


class _RetryFinalCompletionSession(ScriptedSession):
    def __init__(
        self,
        scalar_values: list[object],
        completed_loader_scalar_values: list[object],
        original_attempt_id: UUID,
    ) -> None:
        super().__init__(*scalar_values)
        self.completed_loader_scalar_values = completed_loader_scalar_values
        self.original_attempt_id = original_attempt_id
        self.completed_loader_started = False

    async def scalars(self, statement: Any) -> Any:
        if (
            statement.column_descriptions[0].get("entity") is PracticeAttempt
            and not self.completed_loader_started
        ):
            self.scalar_values.extend(self.completed_loader_scalar_values)
            self.completed_loader_started = True
        result = await super().scalars(statement)
        if self.completed_loader_started and statement.column_descriptions[0].get(
            "entity"
        ) in {
            AgentRun,
            PracticeAnswer,
            PracticeFollowUpDecision,
            PracticeFollowUpQuestion,
        }:
            values = [
                value
                for value in result.all()
                if (
                    str(
                        value.payload.get("attemptId")
                        if isinstance(value, AgentRun)
                        else value.attempt_id
                    )
                    == str(self.original_attempt_id)
                )
            ]

            class Result:
                def all(self) -> list[object]:
                    return values

            return Result()
        return result


def test_complete_session_after_review_accepts_retry_final_attempt_without_run_id() -> (
    None
):
    records = _retry_final_review_records()
    active = records["active"]
    original = records["original"]
    retry_attempt = records["attempt"]
    assert isinstance(active, PracticeSession)
    assert isinstance(original, PracticeAttempt)
    assert isinstance(retry_attempt, PracticeAttempt)
    scripted = _RetryFinalCompletionSession(
        records["scalar_values"],  # type: ignore[arg-type]
        records["completed_loader_scalar_values"],  # type: ignore[arg-type]
        original.id,
    )

    result = asyncio.run(
        service(scripted).complete_session_after_review(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=4,
        )
    )

    assert result.final_attempt is retry_attempt
    assert result.final_attempt.retry_of_attempt_id == original.id
    assert result.final_attempt.question_generation_run_id is None
    assert result.final_attempt.status == PracticeAttemptStatus.COMPLETED.value
    assert original.status == PracticeAttemptStatus.COMPLETED.value
    assert result.session.status == "completed"
    assert result.session.version == 5
