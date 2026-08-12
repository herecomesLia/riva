import asyncio
from datetime import UTC, datetime
from typing import Any, cast
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
    PracticeSession,
    QuestionCard,
)
from riva.prompts import PRACTICE_EVALUATION_PROMPT
from riva.schemas.evaluation import (
    EvaluationRunPayload,
    PracticeEvaluationOutput,
)
from riva.services.evaluation_generation import (
    PRACTICE_EVALUATION_ARTIFACT_CONFLICT,
    PRACTICE_EVALUATION_CONTEXT_CONFLICT,
    EvaluationGenerationService,
    EvaluationGenerationStateError,
    practice_evaluation_idempotency_key,
)


NOW = datetime(2026, 8, 11, 9, 30, tzinfo=UTC)


class ScalarResult:
    def __init__(self, values: list[object]) -> None:
        self.values = values

    def all(self) -> list[object]:
        return self.values


class ScriptedSession:
    def __init__(
        self,
        *,
        scalar_values: list[object],
        scalars_values: list[list[object]],
    ) -> None:
        self.scalar_values = list(scalar_values)
        self.scalars_values = list(scalars_values)
        self.statements: list[Any] = []
        self.added: list[object] = []
        self.commit_count = 0
        self.rollback_count = 0

    async def scalar(self, statement: Any) -> object:
        self.statements.append(statement)
        if not self.scalar_values:
            raise AssertionError("unexpected scalar query")
        return self.scalar_values.pop(0)

    async def scalars(self, statement: Any) -> ScalarResult:
        self.statements.append(statement)
        if not self.scalars_values:
            raise AssertionError("unexpected scalars query")
        return ScalarResult(self.scalars_values.pop(0))

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
    shape: str,
) -> tuple[
    PracticeSession,
    PracticeAttempt,
    QuestionCard,
    PracticeAnswer,
    list[PracticeFollowUpQuestion],
    list[PracticeAnswer],
    list[PracticeFollowUpDecision],
]:
    user_id = uuid4()
    session = PracticeSession(
        id=uuid4(),
        user_id=user_id,
        target_role_id=uuid4(),
        language="en",
        version=7,
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
        status="evaluating",
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
        scoring_focus=["Evidence", "Attribution"],
        profile_version=3,
        job_description_version=4,
        job_description_analysis_version=5,
    )
    main_answer = PracticeAnswer(
        id=uuid4(),
        attempt_id=attempt.id,
        kind="main",
        order=1,
        content="I owned the rollout and reduced failures.",
        submitted_at=NOW,
    )

    questions: list[PracticeFollowUpQuestion] = []
    follow_up_answers: list[PracticeAnswer] = []
    decisions = [
        PracticeFollowUpDecision(
            id=uuid4(),
            attempt_id=attempt.id,
            source_agent_run_id=uuid4(),
            order=1,
            action="complete" if shape == "none" else "askFollowUp",
            follow_up_question_id=None,
            created_at=NOW,
        )
    ]
    if shape != "none":
        for order in range(1, 3 if shape == "two" else 2):
            question = PracticeFollowUpQuestion(
                id=uuid4(),
                attempt_id=attempt.id,
                source_agent_run_id=uuid4(),
                order=order,
                prompt=f"What evidence supports point {order}?",
                focus=f"Evidence {order}",
                answer_hints=["Name the measure."],
                answer_framework=["Baseline", "Result"],
                created_at=NOW,
            )
            answer = PracticeAnswer(
                id=uuid4(),
                attempt_id=attempt.id,
                kind="followUp",
                order=order + 1,
                content=f"The metric improved for point {order}.",
                follow_up_question_id=question.id,
                submitted_at=NOW,
            )
            questions.append(question)
            follow_up_answers.append(answer)
            if order == 1:
                decisions[0].follow_up_question_id = question.id

        decisions.append(
            PracticeFollowUpDecision(
                id=uuid4(),
                attempt_id=attempt.id,
                source_agent_run_id=uuid4(),
                order=2,
                action="complete" if shape == "one" else "askFollowUp",
                follow_up_question_id=(
                    None if shape == "one" else questions[1].id
                ),
                created_at=NOW,
            )
        )
    return (
        session,
        attempt,
        card,
        main_answer,
        questions,
        follow_up_answers,
        decisions,
    )


def run_for(
    session: PracticeSession,
    attempt: PracticeAttempt,
    card: QuestionCard,
    main_answer: PracticeAnswer,
    questions: list[PracticeFollowUpQuestion],
    follow_up_answers: list[PracticeAnswer],
    decisions: list[PracticeFollowUpDecision],
    *,
    reason: str,
) -> AgentRun:
    first = (questions[0], follow_up_answers[0]) if questions else None
    second = (questions[1], follow_up_answers[1]) if len(questions) > 1 else None
    payload = EvaluationRunPayload(
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=main_answer.id,
        interaction_language=session.language,
        follow_up_completion_reason=reason,
        terminal_follow_up_decision_id=decisions[-1].id,
        follow_up_question_1_id=first[0].id if first else None,
        follow_up_answer_1_id=first[1].id if first else None,
        follow_up_question_2_id=second[0].id if second else None,
        follow_up_answer_2_id=second[1].id if second else None,
    )
    return AgentRun(
        id=uuid4(),
        user_id=attempt.user_id,
        agent_id="practice-evaluator",
        prompt_id=PRACTICE_EVALUATION_PROMPT.prompt_id,
        prompt_version=PRACTICE_EVALUATION_PROMPT.version,
        output_schema_id=PRACTICE_EVALUATION_PROMPT.output_schema_id,
        status=AgentRunStatus.RUNNING,
        payload=payload.model_dump(
            mode="json",
            by_alias=True,
            exclude_none=True,
        ),
        idempotency_key=practice_evaluation_idempotency_key(attempt.id),
        attempt_count=1,
        max_attempts=3,
        model="test-model",
    )


def session_for_context(
    attempt: PracticeAttempt,
    practice_session: PracticeSession,
    card: QuestionCard,
    answers: list[PracticeAnswer],
    questions: list[PracticeFollowUpQuestion],
    decisions: list[PracticeFollowUpDecision],
    *,
    for_update: bool = False,
    extra_scalars: list[object] | None = None,
) -> ScriptedSession:
    scalar_values = [attempt, practice_session]
    if for_update:
        scalar_values.append(attempt)
    scalar_values.extend([card, *(extra_scalars or [])])
    return ScriptedSession(
        scalar_values=scalar_values,
        scalars_values=[
            answers,
            questions,
            decisions,
        ],
    )


def valid_output(*, score: int = 80) -> PracticeEvaluationOutput:
    return PracticeEvaluationOutput.model_validate(
        {
            "overallScore": score,
            "dimensionScores": [
                {
                    "dimension": dimension,
                    "score": score,
                    "explanation": f"Evidence supports {dimension}.",
                }
                for dimension in (
                    "relevance",
                    "structure",
                    "specificity",
                    "communication",
                )
            ],
            "focusAssessments": [
                {
                    "focusIndex": 0,
                    "status": "demonstrated",
                    "explanation": "The answer provides evidence.",
                },
                {
                    "focusIndex": 1,
                    "status": "partial",
                    "explanation": "The answer provides partial evidence.",
                },
            ],
        }
    )


def load_context_values(shape: str) -> tuple[AgentRun, tuple[object, ...]]:
    session, attempt, card, main, questions, follow_answers, decisions = (
        context_graph(shape)
    )
    reason = "noFollowUpRequired" if shape == "none" else "allAnswered"
    run = run_for(
        session,
        attempt,
        card,
        main,
        questions,
        follow_answers,
        decisions,
        reason=reason,
    )
    return run, (
        session,
        attempt,
        card,
        main,
        questions,
        follow_answers,
        decisions,
    )


@pytest.mark.parametrize(
    ("shape", "reason", "exchange_count"),
    [
        ("none", "noFollowUpRequired", 0),
        ("one", "allAnswered", 1),
        ("two", "allAnswered", 2),
    ],
)
def test_enqueue_freezes_the_complete_evaluation_graph(
    shape: str,
    reason: str,
    exchange_count: int,
) -> None:
    run, values = load_context_values(shape)
    session, attempt, card, main, questions, follow_answers, decisions = values
    expected_run_service = FakeAgentRunService(run)
    db = session_for_context(
        attempt,
        session,
        card,
        [main, *follow_answers],
        questions,
        decisions,
        for_update=True,
    )
    service = EvaluationGenerationService(
        db,  # type: ignore[arg-type]
        llm_model="test-model",
        agent_run_service_factory=(
            lambda _session: expected_run_service  # type: ignore[arg-type]
        ),
    )

    result = asyncio.run(
        service.enqueue_generation_in_transaction(
            user_id=attempt.user_id,
            attempt_id=attempt.id,
            interaction_language="en",
            follow_up_completion_reason=reason,  # type: ignore[arg-type]
            idempotency_key=practice_evaluation_idempotency_key(attempt.id),
        )
    )

    assert result is run
    assert db.commit_count == 0
    assert expected_run_service.calls[0]["max_attempts"] == 3
    assert expected_run_service.calls[0]["agent_id"] == "practice-evaluator"
    assert expected_run_service.calls[0]["prompt_id"] == (
        PRACTICE_EVALUATION_PROMPT.prompt_id
    )
    payload = cast(dict[str, object], expected_run_service.calls[0]["payload"])
    assert payload == run.payload
    assert len([key for key in payload if "Answer" in key or "Question" in key]) == (
        2 * exchange_count + 1
    )
    assert [
        statement.column_descriptions[0]["entity"]
        for statement in db.statements
        if statement.column_descriptions
    ] == [
        PracticeAttempt,
        PracticeSession,
        PracticeAttempt,
        QuestionCard,
        PracticeAnswer,
        PracticeFollowUpQuestion,
        PracticeFollowUpDecision,
    ]


def test_enqueue_wrapper_commits_and_idempotency_key_is_stable() -> None:
    run, values = load_context_values("none")
    session, attempt, card, main, questions, follow_answers, decisions = values
    expected_run_service = FakeAgentRunService(run)
    db = session_for_context(
        attempt,
        session,
        card,
        [main],
        questions,
        decisions,
        for_update=True,
    )
    service = EvaluationGenerationService(
        db,  # type: ignore[arg-type]
        llm_model="test-model",
        agent_run_service_factory=(
            lambda _session: expected_run_service  # type: ignore[arg-type]
        ),
    )

    result = asyncio.run(
        service.enqueue_generation(
            user_id=attempt.user_id,
            attempt_id=attempt.id,
            interaction_language="en",
            follow_up_completion_reason="noFollowUpRequired",  # type: ignore[arg-type]
            idempotency_key=practice_evaluation_idempotency_key(attempt.id),
        )
    )

    assert result is run
    assert db.commit_count == 1
    assert practice_evaluation_idempotency_key(attempt.id) == (
        f"practice-attempt:{attempt.id}:evaluation"
    )


def test_load_rebuilds_input_from_frozen_ids() -> None:
    run, values = load_context_values("one")
    session, attempt, card, main, questions, follow_answers, decisions = values
    db = session_for_context(
        attempt,
        session,
        card,
        [main, *follow_answers],
        questions,
        decisions,
        for_update=False,
    )

    result = asyncio.run(
        EvaluationGenerationService(
            db  # type: ignore[arg-type]
        ).load_generation_input(run)
    )

    assert result.main_answer.content == main.content
    assert result.follow_up_exchanges[0].prompt == questions[0].prompt
    assert result.follow_up_exchanges[0].answer == follow_answers[0].content
    assert result.follow_up_completion_reason.value == "allAnswered"
    assert db.commit_count == 1


def test_persist_success_writes_one_canonical_artifact_without_status_mutation(
) -> None:
    run, values = load_context_values("none")
    session, attempt, card, main, questions, follow_answers, decisions = values
    db = session_for_context(
        attempt,
        session,
        card,
        [main],
        questions,
        decisions,
        for_update=True,
        extra_scalars=[None, None],
    )
    output = valid_output()

    result = asyncio.run(
        EvaluationGenerationService(
            db,  # type: ignore[arg-type]
            clock=lambda: NOW,
        ).persist_success(run, output)
    )

    assert result == output
    assert len(db.added) == 1
    evaluation = db.added[0]
    assert isinstance(evaluation, PracticeEvaluation)
    assert evaluation.attempt_id == attempt.id
    assert evaluation.source_agent_run_id == run.id
    assert evaluation.overall_score == 80
    assert attempt.status == "evaluating"
    assert session.version == 7
    assert db.commit_count == 1


def test_retry_with_same_source_run_returns_first_canonical_artifact() -> None:
    run, values = load_context_values("none")
    session, attempt, card, main, questions, follow_answers, decisions = values
    first = valid_output(score=61)
    stored = PracticeEvaluation(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=run.id,
        overall_score=first.overall_score,
        dimension_scores=first.model_dump(mode="json", by_alias=True)[
            "dimensionScores"
        ],
        focus_assessments=first.model_dump(mode="json", by_alias=True)[
            "focusAssessments"
        ],
        evaluated_at=NOW,
    )
    db = session_for_context(
        attempt,
        session,
        card,
        [main],
        questions,
        decisions,
        for_update=True,
        extra_scalars=[stored],
    )

    result = asyncio.run(
        EvaluationGenerationService(db).persist_success(  # type: ignore[arg-type]
            run,
            cast(PracticeEvaluationOutput, object()),
        )
    )

    assert result == first
    assert db.added == []
    assert db.commit_count == 1


def test_different_source_run_cannot_take_over_existing_attempt_artifact() -> None:
    run, values = load_context_values("none")
    session, attempt, card, main, questions, follow_answers, decisions = values
    existing = PracticeEvaluation(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=uuid4(),
        overall_score=80,
        dimension_scores=valid_output().model_dump(mode="json", by_alias=True)[
            "dimensionScores"
        ],
        focus_assessments=valid_output().model_dump(mode="json", by_alias=True)[
            "focusAssessments"
        ],
        evaluated_at=NOW,
    )
    db = session_for_context(
        attempt,
        session,
        card,
        [main],
        questions,
        decisions,
        for_update=True,
        extra_scalars=[None, existing],
    )

    with pytest.raises(EvaluationGenerationStateError) as exc_info:
        asyncio.run(
            EvaluationGenerationService(db).persist_success(  # type: ignore[arg-type]
                run,
                valid_output(),
            )
        )

    assert exc_info.value.code == PRACTICE_EVALUATION_ARTIFACT_CONFLICT
    assert db.added == []


def test_frozen_main_answer_mismatch_is_a_context_conflict() -> None:
    run, values = load_context_values("none")
    session, attempt, card, main, questions, follow_answers, decisions = values
    payload = EvaluationRunPayload.model_validate(run.payload)
    run.payload = {
        **payload.model_dump(mode="json", by_alias=True),
        "mainAnswerId": str(uuid4()),
    }
    db = session_for_context(
        attempt,
        session,
        card,
        [main],
        questions,
        decisions,
        for_update=False,
    )

    with pytest.raises(EvaluationGenerationStateError) as exc_info:
        asyncio.run(
            EvaluationGenerationService(
                db  # type: ignore[arg-type]
            ).load_generation_input(run)
        )

    assert exc_info.value.code == PRACTICE_EVALUATION_CONTEXT_CONFLICT


def test_malformed_persisted_artifact_is_not_replaced_on_retry() -> None:
    run, values = load_context_values("none")
    session, attempt, card, main, questions, follow_answers, decisions = values
    malformed = PracticeEvaluation(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=run.id,
        overall_score=80,
        dimension_scores=[],
        focus_assessments=[],
        evaluated_at=NOW,
    )
    db = session_for_context(
        attempt,
        session,
        card,
        [main],
        questions,
        decisions,
        for_update=True,
        extra_scalars=[malformed],
    )

    with pytest.raises(EvaluationGenerationStateError) as exc_info:
        asyncio.run(
            EvaluationGenerationService(db).persist_success(  # type: ignore[arg-type]
                run,
                valid_output(),
            )
        )

    assert exc_info.value.code == PRACTICE_EVALUATION_ARTIFACT_CONFLICT
