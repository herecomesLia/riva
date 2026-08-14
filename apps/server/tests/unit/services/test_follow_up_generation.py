import asyncio
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

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
    FollowUpQuestionOutput,
    FollowUpRunPayload,
)
from riva.services.follow_up_generation import (
    FOLLOW_UP_GENERATION_CONTEXT_CONFLICT,
    FOLLOW_UP_PREVIOUS_EXCHANGE_NOT_READY,
    FollowUpGenerationService,
    FollowUpGenerationStateError,
)


NOW = datetime(2026, 8, 11, 9, 30, tzinfo=UTC)


class ScriptedSession:
    def __init__(self, *scalar_values: object) -> None:
        self.scalar_values = list(scalar_values)
        self.statements: list[Any] = []
        self.added: list[object] = []
        self.commit_count = 0
        self.rollback_count = 0

    async def scalar(self, statement: Any) -> object:
        self.statements.append(statement)
        if not self.scalar_values:
            raise AssertionError("unexpected scalar query")
        return self.scalar_values.pop(0)

    def add(self, value: object) -> None:
        self.added.append(value)

    async def commit(self) -> None:
        self.commit_count += 1

    async def rollback(self) -> None:
        self.rollback_count += 1


class FakeAgentRunService:
    def __init__(self, run: AgentRun) -> None:
        self.run = run
        self.calls: list[dict[str, object]] = []

    async def enqueue_in_transaction(self, **kwargs: object) -> AgentRun:
        self.calls.append(kwargs)
        return self.run


def context_graph(
    *,
    with_previous_exchange: bool = False,
) -> tuple[
    PracticeSession,
    PracticeAttempt,
    QuestionCard,
    PracticeAnswer,
    PracticeFollowUpQuestion | None,
    PracticeAnswer | None,
]:
    user_id = uuid4()
    session = PracticeSession(
        id=uuid4(),
        user_id=user_id,
        target_role_id=uuid4(),
        language="en",
        version=1,
        status="active",
        initial_question_type="behavioral",
        initial_difficulty="basic",
        source="personalized",
        started_at=NOW,
        created_at=NOW,
        updated_at=NOW,
    )
    attempt = PracticeAttempt(
        id=uuid4(),
        user_id=user_id,
        session_id=session.id,
        attempt_number=1,
        question_type="behavioral",
        difficulty="basic",
        status="answering",
        question_card_id=uuid4(),
        created_at=NOW,
        updated_at=NOW,
    )
    card = QuestionCard(
        id=cast(UUID, attempt.question_card_id),
        user_id=user_id,
        target_role_id=session.target_role_id,
        profile_id=uuid4(),
        source_agent_run_id=uuid4(),
        matching_analysis_run_id=uuid4(),
        language="en",
        question_type="behavioral",
        difficulty="basic",
        prompt="Tell me about the result.",
        assessed_capabilities=["Ownership"],
        recommended_materials=[],
        answer_hints=["Use a metric."],
        answer_framework=["Context", "Result"],
        follow_up_directions=["Probe attribution."],
        scoring_focus=["Evidence"],
        profile_version=1,
        job_description_version=1,
        job_description_analysis_version=1,
    )
    main_answer = PracticeAnswer(
        id=uuid4(),
        attempt_id=attempt.id,
        kind="main",
        order=1,
        content="I owned the rollout and reduced failures.",
        submitted_at=NOW,
    )
    previous_question: PracticeFollowUpQuestion | None = None
    previous_answer: PracticeAnswer | None = None
    if with_previous_exchange:
        previous_question = PracticeFollowUpQuestion(
            id=uuid4(),
            attempt_id=attempt.id,
            source_agent_run_id=uuid4(),
            order=1,
            prompt="What metric improved?",
            focus="Attribution",
            answer_hints=["Name the metric."],
            answer_framework=["Baseline", "Result"],
            created_at=NOW,
        )
        previous_answer = PracticeAnswer(
            id=uuid4(),
            attempt_id=attempt.id,
            kind="followUp",
            order=2,
            content="Failure rate fell by 20%.",
            follow_up_question_id=previous_question.id,
            submitted_at=NOW,
        )
    return (
        session,
        attempt,
        card,
        main_answer,
        previous_question,
        previous_answer,
    )


def run_for(
    session: PracticeSession,
    attempt: PracticeAttempt,
    card: QuestionCard,
    main_answer: PracticeAnswer,
    *,
    order: int = 1,
    previous_question: PracticeFollowUpQuestion | None = None,
    previous_answer: PracticeAnswer | None = None,
) -> AgentRun:
    payload = FollowUpRunPayload(
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=main_answer.id,
        interaction_language=session.language,
        next_follow_up_order=order,
        previous_follow_up_question_id=(
            previous_question.id if previous_question is not None else None
        ),
        previous_follow_up_answer_id=(
            previous_answer.id if previous_answer is not None else None
        ),
    )
    return AgentRun(
        id=uuid4(),
        user_id=attempt.user_id,
        agent_id="follow-up-generator",
        prompt_id=FOLLOW_UP_PROMPT.prompt_id,
        prompt_version=FOLLOW_UP_PROMPT.version,
        output_schema_id=FOLLOW_UP_PROMPT.output_schema_id,
        payload=payload.model_dump(mode="json", by_alias=True),
        idempotency_key="practice-attempt-follow-up",
        attempt_count=1,
        max_attempts=3,
        model="test-model",
    )


def test_enqueue_order_one_freezes_ids_without_committing_transaction_variant() -> None:
    session, attempt, card, main_answer, _, _ = context_graph()
    expected_run = run_for(session, attempt, card, main_answer)
    agent_runs = FakeAgentRunService(expected_run)
    db = ScriptedSession(attempt, session, attempt, card, main_answer, None)
    service = FollowUpGenerationService(
        db,  # type: ignore[arg-type]
        llm_model="test-model",
        agent_run_service_factory=lambda _session: agent_runs,  # type: ignore[arg-type]
    )

    result = asyncio.run(
        service.enqueue_generation_in_transaction(
            user_id=attempt.user_id,
            attempt_id=attempt.id,
            next_follow_up_order=1,
            interaction_language="en",
            idempotency_key="practice-attempt-follow-up",
        )
    )

    assert result is expected_run
    assert db.commit_count == 0
    assert agent_runs.calls[0]["max_attempts"] == 3
    assert agent_runs.calls[0]["agent_id"] == "follow-up-generator"
    assert agent_runs.calls[0]["prompt_id"] == FOLLOW_UP_PROMPT.prompt_id
    assert agent_runs.calls[0]["payload"] == expected_run.payload


def test_enqueue_wrapper_commits_and_order_two_freezes_previous_ids() -> None:
    session, attempt, card, main_answer, previous_question, previous_answer = (
        context_graph(with_previous_exchange=True)
    )
    expected_run = run_for(
        session,
        attempt,
        card,
        main_answer,
        order=2,
        previous_question=previous_question,
        previous_answer=previous_answer,
    )
    agent_runs = FakeAgentRunService(expected_run)
    db = ScriptedSession(
        attempt,
        session,
        attempt,
        card,
        main_answer,
        previous_question,
        previous_answer,
    )
    service = FollowUpGenerationService(
        db,  # type: ignore[arg-type]
        llm_model="test-model",
        agent_run_service_factory=lambda _session: agent_runs,  # type: ignore[arg-type]
    )

    result = asyncio.run(
        service.enqueue_generation(
            user_id=attempt.user_id,
            attempt_id=attempt.id,
            next_follow_up_order=2,
            interaction_language="en",
            idempotency_key="practice-attempt-follow-up-2",
        )
    )

    assert result is expected_run
    assert db.commit_count == 1
    payload = cast(dict[str, object], agent_runs.calls[0]["payload"])
    assert payload["previousFollowUpQuestionId"] == str(previous_question.id)
    assert payload["previousFollowUpAnswerId"] == str(previous_answer.id)


def test_load_input_rebuilds_only_frozen_interaction_context() -> None:
    session, attempt, card, main_answer, _, _ = context_graph()
    run = run_for(session, attempt, card, main_answer)
    db = ScriptedSession(attempt, session, card, main_answer, None)

    result = asyncio.run(
        FollowUpGenerationService(db, llm_model="test-model").load_generation_input(
            run
        )
    )

    assert result.question.prompt == card.prompt
    assert result.main_answer.content == main_answer.content
    assert result.previous_follow_ups == []
    assert db.commit_count == 1
    assert all("career_profiles" not in str(statement) for statement in db.statements)


def test_persist_success_recovers_first_artifact_without_comparing_retry_output() -> None:
    session, attempt, card, main_answer, _, _ = context_graph()
    run = run_for(session, attempt, card, main_answer)
    first = FollowUpQuestionOutput(
        action="askFollowUp",
        prompt="First canonical question",
        focus="Attribution",
        answer_hints=["Metric"],
        answer_framework=["Baseline", "Result"],
    )
    first_db = ScriptedSession(
        attempt,
        session,
        attempt,
        card,
        main_answer,
        None,
        None,
    )
    service = FollowUpGenerationService(
        first_db,
        llm_model="test-model",
        clock=lambda: NOW,
    )
    persisted = asyncio.run(service.persist_success(run, first))
    question = cast(PracticeFollowUpQuestion, first_db.added[0])
    decision = cast(PracticeFollowUpDecision, first_db.added[1])
    assert question.answer_hints_revealed is False
    assert question.answer_framework_revealed is False

    retry_db = ScriptedSession(
        attempt,
        session,
        attempt,
        card,
        main_answer,
        None,
        decision,
        question,
    )
    retry_output = FollowUpCompleteOutput(action="complete")
    recovered = asyncio.run(
        FollowUpGenerationService(
            retry_db,
            llm_model="test-model",
            clock=lambda: NOW,
        ).persist_success(run, retry_output)
    )

    assert persisted == first
    assert recovered == first
    assert retry_db.added == []


def test_persist_success_complete_creates_only_a_decision() -> None:
    session, attempt, card, main_answer, _, _ = context_graph()
    run = run_for(session, attempt, card, main_answer)
    db = ScriptedSession(
        attempt,
        session,
        attempt,
        card,
        main_answer,
        None,
        None,
    )

    output = asyncio.run(
        FollowUpGenerationService(
            db,
            llm_model="test-model",
            clock=lambda: NOW,
        ).persist_success(run, FollowUpCompleteOutput(action="complete"))
    )

    assert output == FollowUpCompleteOutput(action="complete")
    assert len(db.added) == 1
    assert isinstance(db.added[0], PracticeFollowUpDecision)
    assert db.added[0].follow_up_question_id is None


def test_context_mismatch_uses_safe_stable_error_code() -> None:
    session, attempt, card, main_answer, _, _ = context_graph()
    run = run_for(session, attempt, card, main_answer)
    db = ScriptedSession(attempt, session, card, main_answer, None)

    with pytest.raises(FollowUpGenerationStateError) as exc_info:
        run.payload = {
            **run.payload,
            "interactionLanguage": "zh-CN",
        }
        asyncio.run(
            FollowUpGenerationService(db, llm_model="test-model").load_generation_input(
                run
            )
        )

    assert exc_info.value.code == FOLLOW_UP_GENERATION_CONTEXT_CONFLICT
    assert "I owned" not in str(exc_info.value)


def test_order_two_requires_explicit_previous_exchange() -> None:
    session, attempt, card, main_answer, _, _ = context_graph()
    missing_question = PracticeFollowUpQuestion(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=uuid4(),
        order=1,
        prompt="Missing from database",
        focus="Focus",
        answer_hints=[],
        answer_framework=[],
        created_at=NOW,
    )
    missing_answer = PracticeAnswer(
        id=uuid4(),
        attempt_id=attempt.id,
        kind="followUp",
        order=2,
        content="Missing from database",
        follow_up_question_id=missing_question.id,
        submitted_at=NOW,
    )
    run = run_for(
        session,
        attempt,
        card,
        main_answer,
        order=2,
        previous_question=missing_question,
        previous_answer=missing_answer,
    )

    with pytest.raises(FollowUpGenerationStateError) as exc_info:
        asyncio.run(
            FollowUpGenerationService(
                ScriptedSession(attempt, session, card, main_answer, None),  # type: ignore[arg-type]
                llm_model="test-model",
            ).load_generation_input(run)
        )

    assert exc_info.value.code == FOLLOW_UP_PREVIOUS_EXCHANGE_NOT_READY
