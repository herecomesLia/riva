import asyncio
from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import pytest

from riva.agents.practice_review import PracticeReviewAgent
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeEvaluation,
    PracticeReview,
)
from riva.schemas.practice_review import (
    PracticeReviewOutput,
    ReviewRunPayload,
)
from riva.services.review_generation import (
    INVALID_PRACTICE_REVIEW_RUN,
    PRACTICE_REVIEW_ARTIFACT_CONFLICT,
    PRACTICE_REVIEW_CONTEXT_CONFLICT,
    PRACTICE_REVIEW_EVALUATION_CONTEXT_INVALID,
    PRACTICE_REVIEW_EVALUATION_NOT_READY,
    ReviewGenerationService,
    ReviewGenerationStateError,
    practice_review_idempotency_key,
)
from tests.unit.services.test_evaluation_generation import (
    ScriptedSession,
    context_graph,
    follow_up_source_runs,
    noop_competency_ingestion_service_factory,
    run_for,
)
from tests.unit.services.test_evaluation_generation import (
    valid_output as valid_evaluation_output,
)

NOW = datetime(2026, 8, 12, 9, 30, tzinfo=UTC)


class FakeAgentRunService:
    def __init__(self, run: AgentRun) -> None:
        self.run = run
        self.calls: list[dict[str, object]] = []

    async def enqueue_in_transaction(self, **kwargs: object) -> AgentRun:
        self.calls.append(kwargs)
        return self.run


def review_output(*, overall: str = "FIRST") -> PracticeReviewOutput:
    return PracticeReviewOutput.model_validate(
        {
            "overallPerformance": overall,
            "highlights": ["Clear ownership"],
            "mainIssues": ["Attribution needs more evidence"],
            "improvementSuggestions": ["Name the baseline and result"],
            "reusableAnswerStructure": ["Context", "Evidence", "Result"],
            "exposedWeaknesses": ["Attribution evidence"],
        }
    )


def review_context(
    shape: str = "none",
) -> tuple[
    AgentRun,
    object,
    object,
    object,
    object,
    list[object],
    list[object],
    list[object],
    list[AgentRun],
    PracticeEvaluation,
]:
    session, attempt, card, main, questions, follow_answers, decisions = context_graph(
        shape
    )
    evaluation_run = run_for(
        session,
        attempt,
        card,
        main,
        questions,
        follow_answers,
        decisions,
        reason="noFollowUpRequired" if shape == "none" else "allAnswered",
    )
    evaluation_run.status = AgentRunStatus.SUCCEEDED
    evaluation_run.started_at = NOW
    evaluation_run.finished_at = NOW
    evaluation_run.provider = "evaluation-provider"
    evaluation_run.input_tokens = 10
    evaluation_run.output_tokens = 8
    evaluation_run.result = {"overallScore": 80}

    evaluation_output = valid_evaluation_output()
    evaluation = PracticeEvaluation(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=evaluation_run.id,
        overall_score=evaluation_output.overall_score,
        dimension_scores=evaluation_output.model_dump(mode="json", by_alias=True)[
            "dimensionScores"
        ],
        focus_assessments=evaluation_output.model_dump(mode="json", by_alias=True)[
            "focusAssessments"
        ],
        evaluated_at=NOW,
    )
    source_runs = follow_up_source_runs(
        attempt,
        session,
        card,
        main,
        questions,
        follow_answers,
        decisions,
    )
    return (
        evaluation_run,
        session,
        attempt,
        card,
        main,
        questions,
        follow_answers,
        decisions,
        source_runs,
        evaluation,
    )


def review_run(
    evaluation_run: AgentRun,
    attempt_id,
    evaluation_id,
    *,
    status: AgentRunStatus = AgentRunStatus.RUNNING,
) -> AgentRun:
    payload = ReviewRunPayload(
        attempt_id=attempt_id,
        evaluation_id=evaluation_id,
        interaction_language="en",
    )
    return AgentRun(
        id=uuid4(),
        user_id=evaluation_run.user_id,
        agent_id="practice-reviewer",
        prompt_id=PracticeReviewAgent.agent_id,
        prompt_version=PracticeReviewAgent.agent_version,
        output_schema_id=PracticeReviewAgent.output_schema_id,
        status=status,
        payload=payload.model_dump(mode="json", by_alias=True),
        idempotency_key=practice_review_idempotency_key(attempt_id),
        attempt_count=1,
        max_attempts=3,
        model="review-test-model",
        lease_token=uuid4() if status is AgentRunStatus.RUNNING else None,
    )


def scripted_review_session(
    values: tuple[object, ...],
    *,
    for_update: bool,
    source_runs: list[AgentRun],
    evaluation: PracticeEvaluation,
    existing_scalars: list[object] | None = None,
) -> ScriptedSession:
    (
        evaluation_run,
        practice_session,
        attempt,
        card,
        main,
        questions,
        follow_answers,
        decisions,
        _source_runs,
        _evaluation,
    ) = values
    scalar_values: list[object] = [attempt, practice_session]
    if for_update:
        scalar_values.append(attempt)
    scalar_values.extend([evaluation, evaluation_run, attempt, practice_session, card])
    scalar_values.extend(existing_scalars or [])
    return ScriptedSession(
        scalar_values=scalar_values,
        scalars_values=[
            [main, *follow_answers],
            questions,
            decisions,
            source_runs,
        ],
    )


def service_context(
    shape: str = "none",
    *,
    for_update: bool,
    existing_scalars: list[object] | None = None,
) -> tuple[
    ReviewGenerationService,
    ScriptedSession,
    AgentRun,
    object,
    object,
    PracticeEvaluation,
]:
    values = review_context(shape)
    (
        evaluation_run,
        session,
        attempt,
        _card,
        _main,
        _questions,
        _answers,
        _decisions,
        source_runs,
        evaluation,
    ) = values
    db = scripted_review_session(
        values,
        for_update=for_update,
        source_runs=source_runs,
        evaluation=evaluation,
        existing_scalars=existing_scalars,
    )
    review = review_run(evaluation_run, attempt.id, evaluation.id)
    service = ReviewGenerationService(
        db,  # type: ignore[arg-type]
        llm_model="review-test-model",
        competency_ingestion_service_factory=(
            noop_competency_ingestion_service_factory
        ),
        clock=lambda: NOW,
    )
    return service, db, review, session, attempt, evaluation


def test_enqueue_in_transaction_freezes_only_attempt_evaluation_and_language() -> None:
    service, db, run, session, attempt, evaluation = service_context(for_update=True)
    expected_run = AgentRun(
        id=uuid4(),
        user_id=attempt.user_id,
        agent_id="practice-reviewer",
        prompt_id=PracticeReviewAgent.agent_id,
        prompt_version=PracticeReviewAgent.agent_version,
        output_schema_id=PracticeReviewAgent.output_schema_id,
        status=AgentRunStatus.QUEUED,
        payload={},
        idempotency_key=practice_review_idempotency_key(attempt.id),
        attempt_count=0,
        max_attempts=3,
        model="review-test-model",
    )
    fake_run_service = FakeAgentRunService(expected_run)
    service.agent_run_service_factory = lambda _session: cast(object, fake_run_service)  # type: ignore[assignment]

    result = asyncio.run(
        service.enqueue_generation_in_transaction(
            user_id=attempt.user_id,
            attempt_id=attempt.id,
            interaction_language="en",
            idempotency_key=practice_review_idempotency_key(attempt.id),
        )
    )

    assert result is expected_run
    assert db.commit_count == 0
    assert db.rollback_count == 0
    call = fake_run_service.calls[0]
    assert call["agent_id"] == "practice-reviewer"
    assert call["prompt_id"] == PracticeReviewAgent.agent_id
    assert call["prompt_version"] == PracticeReviewAgent.agent_version
    assert call["output_schema_id"] == PracticeReviewAgent.output_schema_id
    assert call["max_attempts"] == 3
    assert call["idempotency_key"] == practice_review_idempotency_key(attempt.id)
    assert call["payload"] == {
        "attemptId": str(attempt.id),
        "evaluationId": str(evaluation.id),
        "interactionLanguage": "en",
    }
    assert session.version == 7


def test_enqueue_wrapper_commits_and_rejects_noncanonical_key() -> None:
    service, db, _run, _session, attempt, _evaluation = service_context(for_update=True)
    expected_run = AgentRun(
        id=uuid4(),
        user_id=attempt.user_id,
        agent_id="practice-reviewer",
        prompt_id=PracticeReviewAgent.agent_id,
        prompt_version=PracticeReviewAgent.agent_version,
        output_schema_id=PracticeReviewAgent.output_schema_id,
        status=AgentRunStatus.QUEUED,
        payload={},
        idempotency_key=practice_review_idempotency_key(attempt.id),
        attempt_count=0,
        max_attempts=3,
        model="review-test-model",
    )
    fake_run_service = FakeAgentRunService(expected_run)
    service.agent_run_service_factory = lambda _session: cast(object, fake_run_service)  # type: ignore[assignment]

    asyncio.run(
        service.enqueue_generation(
            user_id=attempt.user_id,
            attempt_id=attempt.id,
            interaction_language="en",
            idempotency_key=practice_review_idempotency_key(attempt.id),
        )
    )
    assert db.commit_count == 1

    with pytest.raises(ReviewGenerationStateError) as exc_info:
        asyncio.run(
            ReviewGenerationService(
                db, llm_model="review-test-model"
            ).enqueue_generation_in_transaction(
                user_id=attempt.user_id,
                attempt_id=attempt.id,
                interaction_language="en",
                idempotency_key="practice-attempt:wrong:review",
            )
        )
    assert exc_info.value.code == PRACTICE_REVIEW_CONTEXT_CONFLICT


def test_load_reconstructs_review_input_from_evaluation_lineage_without_commit() -> (
    None
):
    service, db, run, _session, attempt, _evaluation = service_context(for_update=False)

    result = asyncio.run(service.load_generation_input_in_transaction(run))

    assert result.interaction_language == "en"
    assert result.main_answer.content == "I owned the rollout and reduced failures."
    assert result.follow_up_exchanges == []
    assert result.evaluation.overall_score == 80
    assert db.commit_count == 0
    assert db.rollback_count == 0
    assert attempt.status == "evaluating"


def test_enqueue_requires_owned_attempt_active_session_and_evaluating_status() -> None:
    service, db, _run, session, attempt, _evaluation = service_context(for_update=True)

    db.scalar_values = [None]
    with pytest.raises(ReviewGenerationStateError) as missing:
        asyncio.run(
            service.enqueue_generation_in_transaction(
                user_id=attempt.user_id,
                attempt_id=attempt.id,
                interaction_language="en",
                idempotency_key=practice_review_idempotency_key(attempt.id),
            )
        )
    assert missing.value.code == "practice_review_attempt_not_found"

    db.scalar_values = [None]
    with pytest.raises(ReviewGenerationStateError) as wrong_owner:
        asyncio.run(
            service.enqueue_generation_in_transaction(
                user_id=uuid4(),
                attempt_id=attempt.id,
                interaction_language="en",
                idempotency_key=practice_review_idempotency_key(attempt.id),
            )
        )
    assert wrong_owner.value.code == "practice_review_attempt_not_found"

    db.scalar_values = [attempt, session]
    session.status = "completed"
    with pytest.raises(ReviewGenerationStateError) as inactive:
        asyncio.run(
            service.enqueue_generation_in_transaction(
                user_id=attempt.user_id,
                attempt_id=attempt.id,
                interaction_language="en",
                idempotency_key=practice_review_idempotency_key(attempt.id),
            )
        )
    assert inactive.value.code == "practice_review_session_not_active"

    session.status = "active"
    attempt.status = "answering"
    db.scalar_values = [attempt, session, attempt]
    with pytest.raises(ReviewGenerationStateError) as phase:
        asyncio.run(
            service.enqueue_generation_in_transaction(
                user_id=attempt.user_id,
                attempt_id=attempt.id,
                interaction_language="en",
                idempotency_key=practice_review_idempotency_key(attempt.id),
            )
        )
    assert phase.value.code == PRACTICE_REVIEW_CONTEXT_CONFLICT


@pytest.mark.parametrize(
    ("mutation", "expected"),
    [
        ("missing", PRACTICE_REVIEW_EVALUATION_NOT_READY),
        ("queued", PRACTICE_REVIEW_EVALUATION_NOT_READY),
        ("running", PRACTICE_REVIEW_EVALUATION_NOT_READY),
        ("failed", PRACTICE_REVIEW_EVALUATION_NOT_READY),
        ("metadata", PRACTICE_REVIEW_EVALUATION_CONTEXT_INVALID),
        ("key", PRACTICE_REVIEW_EVALUATION_CONTEXT_INVALID),
        ("language", PRACTICE_REVIEW_EVALUATION_CONTEXT_INVALID),
    ],
)
def test_enqueue_validates_canonical_evaluation_provenance(
    mutation: str,
    expected: str,
) -> None:
    service, db, _run, _session, attempt, evaluation = service_context(for_update=True)
    session = cast(object, db.scalar_values[1])
    evaluation_run = cast(AgentRun, db.scalar_values[4])
    if mutation == "missing":
        db.scalar_values = [attempt, session, attempt, None]
    elif mutation == "queued":
        evaluation_run.status = AgentRunStatus.QUEUED
    elif mutation == "running":
        evaluation_run.status = AgentRunStatus.RUNNING
    elif mutation == "failed":
        evaluation_run.status = AgentRunStatus.FAILED
    elif mutation == "metadata":
        evaluation_run.prompt_id = "wrong-prompt"
    elif mutation == "key":
        evaluation_run.idempotency_key = "wrong-evaluation-key"
    elif mutation == "language":
        session.language = "zh-CN"  # type: ignore[attr-defined]

    with pytest.raises(ReviewGenerationStateError) as exc_info:
        asyncio.run(
            service.enqueue_generation_in_transaction(
                user_id=attempt.user_id,
                attempt_id=attempt.id,
                interaction_language="en",
                idempotency_key=practice_review_idempotency_key(attempt.id),
            )
        )

    assert exc_info.value.code == expected
    assert db.commit_count == 0
    assert evaluation.attempt_id == attempt.id


def test_review_payload_evaluation_id_is_not_replaced_by_attempt_artifact() -> None:
    service, db, run, _session, attempt, _evaluation = service_context(for_update=False)
    payload = ReviewRunPayload.model_validate(run.payload)
    run.payload = {
        **payload.model_dump(mode="json", by_alias=True),
        "evaluationId": str(uuid4()),
    }
    db.scalar_values = [attempt, _session, None]

    with pytest.raises(ReviewGenerationStateError) as exc_info:
        asyncio.run(service.load_generation_input(run))

    assert exc_info.value.code == PRACTICE_REVIEW_CONTEXT_CONFLICT
    assert db.rollback_count == 1


def test_persist_success_creates_exact_canonical_review_without_session_mutation() -> (
    None
):
    service, db, run, session, attempt, evaluation = service_context(
        for_update=True,
        existing_scalars=[None, None],
    )
    output = review_output()

    result = asyncio.run(service.persist_success(run, output))

    assert result == output
    assert len(db.added) == 1
    review = db.added[0]
    assert isinstance(review, PracticeReview)
    assert review.attempt_id == attempt.id
    assert review.source_agent_run_id == run.id
    assert review.overall_performance == "FIRST"
    assert review.highlights == ["Clear ownership"]
    assert review.reviewed_at == NOW
    assert attempt.status == "evaluating"
    assert session.version == 7
    assert evaluation.attempt_id == attempt.id
    assert db.commit_count == 1


def test_persist_retry_returns_first_source_run_artifact_without_validating_second_output() -> (
    None
):
    service, db, run, _session, attempt, _evaluation = service_context(
        for_update=True,
    )
    existing = PracticeReview(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=run.id,
        overall_performance="FIRST",
        highlights=["First highlight"],
        main_issues=[],
        improvement_suggestions=[],
        reusable_answer_structure=[],
        exposed_weaknesses=[],
        reviewed_at=NOW,
    )
    db.scalar_values.append(existing)

    result = asyncio.run(
        service.persist_success(run, cast(PracticeReviewOutput, object()))
    )

    assert result.overall_performance == "FIRST"
    assert result.highlights == ["First highlight"]
    assert db.added == []
    assert db.commit_count == 1


def test_persist_different_source_run_cannot_take_over_attempt() -> None:
    service, db, run, _session, attempt, _evaluation = service_context(
        for_update=True,
    )
    existing = PracticeReview(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=uuid4(),
        overall_performance="FIRST",
        highlights=[],
        main_issues=[],
        improvement_suggestions=[],
        reusable_answer_structure=[],
        exposed_weaknesses=[],
        reviewed_at=NOW,
    )
    db.scalar_values.extend([None, existing])

    with pytest.raises(ReviewGenerationStateError) as exc_info:
        asyncio.run(service.persist_success(run, review_output(overall="SECOND")))

    assert exc_info.value.code == PRACTICE_REVIEW_ARTIFACT_CONFLICT
    assert db.added == []


def test_malformed_persisted_review_is_an_artifact_conflict() -> None:
    service, db, run, _session, attempt, _evaluation = service_context(
        for_update=True,
    )
    malformed = PracticeReview(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=run.id,
        overall_performance="",
        highlights=["ok", 3],  # type: ignore[list-item]
        main_issues=[],
        improvement_suggestions=[],
        reusable_answer_structure=[],
        exposed_weaknesses=[],
        reviewed_at=NOW,
    )
    db.scalar_values.append(malformed)

    with pytest.raises(ReviewGenerationStateError) as exc_info:
        asyncio.run(service.persist_success(run, review_output()))

    assert exc_info.value.code == PRACTICE_REVIEW_ARTIFACT_CONFLICT


@pytest.mark.parametrize(
    "field",
    ["agent_id", "prompt_id", "prompt_version", "output_schema_id"],
)
def test_review_run_metadata_must_be_canonical(field: str) -> None:
    service, _db, run, _session, _attempt, _evaluation = service_context(
        for_update=False
    )
    setattr(run, field, "wrong")

    with pytest.raises(ReviewGenerationStateError) as exc_info:
        asyncio.run(service.load_generation_input(run))

    assert exc_info.value.code == INVALID_PRACTICE_REVIEW_RUN


def test_review_run_idempotency_key_must_be_canonical_on_load() -> None:
    service, db, run, _session, _attempt, _evaluation = service_context(
        for_update=False
    )
    run.idempotency_key = "practice-attempt:other:review"

    with pytest.raises(ReviewGenerationStateError) as exc_info:
        asyncio.run(service.load_generation_input(run))

    assert exc_info.value.code == PRACTICE_REVIEW_CONTEXT_CONFLICT
    assert db.rollback_count == 1
