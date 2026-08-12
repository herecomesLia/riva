import asyncio
from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import pytest

from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeEvaluation,
    PracticeRecommendation,
    PracticeReview,
)
from riva.prompts import PRACTICE_RECOMMENDATION_PROMPT, PRACTICE_REVIEW_PROMPT
from riva.schemas.practice_recommendation import (
    PracticeNextQuestionRecommendation,
    PracticeRecommendationOutput,
    PracticeRetryCurrentRecommendation,
    RecommendationRunPayload,
)
from riva.schemas.practice_review import ReviewRunPayload
from riva.services.recommendation_generation import (
    INVALID_PRACTICE_RECOMMENDATION_RUN,
    PRACTICE_RECOMMENDATION_ARTIFACT_CONFLICT,
    PRACTICE_RECOMMENDATION_CONTEXT_CONFLICT,
    PRACTICE_RECOMMENDATION_REVIEW_NOT_READY,
    RecommendationGenerationService,
    RecommendationGenerationStateError,
    practice_recommendation_idempotency_key,
)
from tests.unit.services.test_evaluation_generation import (
    ScriptedSession,
    context_graph,
    follow_up_source_runs,
    run_for,
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


def recommendation_output(
    *,
    action: str = "retryCurrent",
    reason: str = "The current answer still has a key evidence gap.",
) -> PracticeRecommendationOutput:
    if action == "retryCurrent":
        return PracticeRetryCurrentRecommendation(
            action="retryCurrent",
            reason=reason,
        )
    return PracticeNextQuestionRecommendation.model_validate(
        {
            "action": "nextQuestion",
            "reason": reason,
            "nextQuestion": {
                "questionType": "behavioral",
                "difficulty": "basic",
                "focusAreas": ["Attribution evidence"],
            },
        }
    )


def recommendation_context(
    *,
    for_update: bool,
    existing_scalars: list[object] | None = None,
    review_status: AgentRunStatus = AgentRunStatus.SUCCEEDED,
) -> tuple[
    RecommendationGenerationService,
    ScriptedSession,
    AgentRun,
    object,
    object,
    PracticeEvaluation,
    PracticeReview,
]:
    (
        evaluation_run,
        practice_session,
        attempt,
        card,
        main,
        questions,
        follow_answers,
        decisions,
        source_runs,
        evaluation,
    ) = _evaluation_context()
    review_run = AgentRun(
        id=uuid4(),
        user_id=attempt.user_id,
        agent_id="practice-reviewer",
        prompt_id=PRACTICE_REVIEW_PROMPT.prompt_id,
        prompt_version=PRACTICE_REVIEW_PROMPT.version,
        output_schema_id=PRACTICE_REVIEW_PROMPT.output_schema_id,
        status=review_status,
        payload=ReviewRunPayload(
            attempt_id=attempt.id,
            evaluation_id=evaluation.id,
            interaction_language="en",
        ).model_dump(mode="json", by_alias=True),
        idempotency_key=f"practice-attempt:{attempt.id}:review",
        attempt_count=1,
        max_attempts=3,
        model="review-test-model",
        lease_token=uuid4() if review_status is AgentRunStatus.RUNNING else None,
    )
    review = PracticeReview(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=review_run.id,
        overall_performance="The answer has a clear evidence gap.",
        highlights=["Ownership is clear."],
        main_issues=["Attribution needs evidence."],
        improvement_suggestions=["Name the baseline and result."],
        reusable_answer_structure=["Context", "Evidence", "Result"],
        exposed_weaknesses=["Attribution evidence"],
        reviewed_at=NOW,
    )

    scalar_values: list[object] = [attempt, practice_session]
    if for_update:
        scalar_values.append(attempt)
    scalar_values.extend([review, review_run])
    if review_status is AgentRunStatus.SUCCEEDED:
        scalar_values.extend(
            [
                evaluation,
                attempt,
                practice_session,
                evaluation,
                evaluation_run,
                attempt,
                practice_session,
                card,
            ]
        )
    scalar_values.extend(existing_scalars or [])
    db = ScriptedSession(
        scalar_values=scalar_values,
        scalars_values=[
            [main, *follow_answers],
            questions,
            decisions,
            source_runs,
        ],
    )
    db.recommendation_review_run = review_run
    db.recommendation_evaluation_run = evaluation_run
    db.recommendation_card = card
    db.recommendation_scalars_values = [
        [main, *follow_answers],
        questions,
        decisions,
        source_runs,
    ]
    run = AgentRun(
        id=uuid4(),
        user_id=attempt.user_id,
        agent_id="practice-recommender",
        prompt_id=PRACTICE_RECOMMENDATION_PROMPT.prompt_id,
        prompt_version=PRACTICE_RECOMMENDATION_PROMPT.version,
        output_schema_id=PRACTICE_RECOMMENDATION_PROMPT.output_schema_id,
        status=AgentRunStatus.RUNNING,
        payload=RecommendationRunPayload(
            attempt_id=attempt.id,
            evaluation_id=evaluation.id,
            review_id=review.id,
            interaction_language="en",
        ).model_dump(mode="json", by_alias=True),
        idempotency_key=practice_recommendation_idempotency_key(attempt.id),
        attempt_count=1,
        max_attempts=3,
        model="recommendation-test-model",
        lease_token=uuid4(),
    )
    service = RecommendationGenerationService(
        db,  # type: ignore[arg-type]
        llm_model="recommendation-test-model",
        clock=lambda: NOW,
    )
    return service, db, run, practice_session, attempt, evaluation, review


def _evaluation_context():
    (
        practice_session,
        attempt,
        card,
        main,
        questions,
        follow_answers,
        decisions,
    ) = context_graph("none")
    evaluation_run = run_for(
        practice_session,
        attempt,
        card,
        main,
        questions,
        follow_answers,
        decisions,
        reason="noFollowUpRequired",
    )
    evaluation_run.status = AgentRunStatus.SUCCEEDED
    evaluation_run.started_at = NOW
    evaluation_run.finished_at = NOW
    evaluation_run.provider = "evaluation-provider"
    evaluation_run.input_tokens = 10
    evaluation_run.output_tokens = 8
    output = valid_evaluation_output()
    evaluation = PracticeEvaluation(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=evaluation_run.id,
        overall_score=output.overall_score,
        dimension_scores=output.model_dump(mode="json", by_alias=True)[
            "dimensionScores"
        ],
        focus_assessments=output.model_dump(mode="json", by_alias=True)[
            "focusAssessments"
        ],
        evaluated_at=NOW,
    )
    return (
        evaluation_run,
        practice_session,
        attempt,
        card,
        main,
        questions,
        follow_answers,
        decisions,
        follow_up_source_runs(
            attempt,
            practice_session,
            card,
            main,
            questions,
            follow_answers,
            decisions,
        ),
        evaluation,
    )


def test_enqueue_freezes_evaluation_review_and_language_ids() -> None:
    service, db, _run, session, attempt, evaluation, review = (
        recommendation_context(for_update=True)
    )
    expected_run = AgentRun(
        id=uuid4(),
        user_id=attempt.user_id,
        agent_id="practice-recommender",
        prompt_id=PRACTICE_RECOMMENDATION_PROMPT.prompt_id,
        prompt_version=PRACTICE_RECOMMENDATION_PROMPT.version,
        output_schema_id=PRACTICE_RECOMMENDATION_PROMPT.output_schema_id,
        status=AgentRunStatus.QUEUED,
        payload={},
        idempotency_key=practice_recommendation_idempotency_key(attempt.id),
        attempt_count=0,
        max_attempts=3,
        model="recommendation-test-model",
    )
    fake = FakeAgentRunService(expected_run)
    service.agent_run_service_factory = lambda _session: cast(
        object, fake
    )  # type: ignore[assignment]

    result = asyncio.run(
        service.enqueue_generation_in_transaction(
            user_id=attempt.user_id,
            attempt_id=attempt.id,
            interaction_language="en",
            idempotency_key=practice_recommendation_idempotency_key(attempt.id),
        )
    )

    assert result is expected_run
    assert fake.calls[0]["payload"] == {
        "attemptId": str(attempt.id),
        "evaluationId": str(evaluation.id),
        "reviewId": str(review.id),
        "interactionLanguage": "en",
    }
    assert fake.calls[0]["max_attempts"] == 3
    assert session.version == 7
    assert attempt.status == "evaluating"
    assert db.commit_count == 0


def test_load_reconstructs_recommendation_input_without_raw_answer_chain() -> None:
    service, db, run, _session, _attempt, _evaluation, review = (
        recommendation_context(for_update=False)
    )

    result = asyncio.run(service.load_generation_input_in_transaction(run))

    assert not hasattr(result, "main_answer")
    assert not hasattr(result, "follow_up_exchanges")
    assert result.review.overall_performance == review.overall_performance
    assert result.evaluation.overall_score == 80
    assert db.commit_count == 0


def test_persist_retry_then_retrying_with_next_question_keeps_first_artifact() -> None:
    service, db, run, _session, attempt, _evaluation, _review = (
        recommendation_context(
            for_update=True,
            existing_scalars=[None, None],
        )
    )
    first = recommendation_output()

    result = asyncio.run(service.persist_success(run, first))

    assert result == first
    artifact = db.added[0]
    assert isinstance(artifact, PracticeRecommendation)
    assert artifact.action == "retryCurrent"
    assert artifact.next_question_type is None
    assert artifact.next_difficulty is None
    assert artifact.focus_areas == []

    # A lease-expiry retry uses the same frozen run and finds the first source
    # artifact, even when the second provider response chooses nextQuestion.
    db.scalar_values = [
        attempt,
        _session,
        attempt,
        _review,
        db.recommendation_review_run,
        _evaluation,
        attempt,
        _session,
        _evaluation,
        db.recommendation_evaluation_run,
        attempt,
        _session,
        db.recommendation_card,
        artifact,
    ]
    db.scalars_values = db.recommendation_scalars_values.copy()

    retry_result = asyncio.run(
        service.persist_success(
            run,
            recommendation_output(action="nextQuestion"),
        )
    )

    assert isinstance(retry_result, PracticeRetryCurrentRecommendation)
    assert retry_result.reason == first.reason
    assert db.added == [artifact]
    assert attempt.status == "evaluating"


def test_persist_rejects_next_question_v1_contract_mismatch() -> None:
    service, db, run, _session, _attempt, _evaluation, _review = (
        recommendation_context(
            for_update=True,
            existing_scalars=[None, None],
        )
    )
    invalid = PracticeNextQuestionRecommendation.model_validate(
        {
            "action": "nextQuestion",
            "reason": "Switch to a different type.",
            "nextQuestion": {
                "questionType": "motivation",
                "difficulty": "pressure",
                "focusAreas": ["invented weakness"],
            },
        }
    )

    with pytest.raises(RecommendationGenerationStateError) as captured:
        asyncio.run(service.persist_success(run, invalid))

    assert captured.value.code == PRACTICE_RECOMMENDATION_ARTIFACT_CONFLICT
    assert db.added == []


def test_enqueue_rejects_transient_review_artifact() -> None:
    service, db, _run, _session, attempt, _evaluation, _review = (
        recommendation_context(
            for_update=True,
            review_status=AgentRunStatus.QUEUED,
        )
    )

    with pytest.raises(RecommendationGenerationStateError) as captured:
        asyncio.run(
            service.enqueue_generation_in_transaction(
                user_id=attempt.user_id,
                attempt_id=attempt.id,
                interaction_language="en",
                idempotency_key=practice_recommendation_idempotency_key(
                    attempt.id
                ),
            )
        )

    assert captured.value.code == PRACTICE_RECOMMENDATION_REVIEW_NOT_READY
    assert db.commit_count == 0


def test_recommendation_run_metadata_and_key_are_canonical() -> None:
    service, db, run, _session, _attempt, _evaluation, _review = (
        recommendation_context(for_update=False)
    )
    run.agent_id = "practice-reviewer"

    with pytest.raises(RecommendationGenerationStateError) as captured:
        asyncio.run(service.load_generation_input(run))

    assert captured.value.code == INVALID_PRACTICE_RECOMMENDATION_RUN
    assert db.rollback_count == 1

    service, db, run, _session, attempt, _evaluation, _review = (
        recommendation_context(for_update=False)
    )
    run.idempotency_key = "wrong-key"

    with pytest.raises(RecommendationGenerationStateError) as captured:
        asyncio.run(service.load_generation_input(run))

    assert captured.value.code == PRACTICE_RECOMMENDATION_CONTEXT_CONFLICT
    assert db.rollback_count == 1
