import asyncio
from datetime import UTC, datetime
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
from riva.schemas.practice_review import ReviewRunPayload
from riva.schemas.practice_sessions import PracticeSessionSelection
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.schemas.question_generation import QuestionGenerationRunPayload
from riva.services.practice_sessions import (
    PRACTICE_FOLLOW_UP_GENERATION_FAILED,
    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT,
    PRACTICE_EVALUATION_GENERATION_STATE_CONFLICT,
    PRACTICE_EVALUATION_GENERATION_UNAVAILABLE,
    PRACTICE_EVALUATION_GENERATION_FAILED,
    PRACTICE_RECOMMENDATION_GENERATION_FAILED,
    PRACTICE_RECOMMENDATION_GENERATION_STATE_CONFLICT,
    PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE,
    PRACTICE_QUESTION_GENERATION_FAILED,
    PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED,
    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT,
    PRACTICE_SESSION_ALREADY_ACTIVE,
    PRACTICE_SESSION_NOT_FOUND,
    PRACTICE_SESSION_SOURCE_UNAVAILABLE,
    PRACTICE_SESSION_STATE_CONFLICT,
    PRACTICE_SESSION_VERSION_CONFLICT,
    PRACTICE_REVIEW_GENERATION_FAILED,
    PRACTICE_REVIEW_GENERATION_STATE_CONFLICT,
    PRACTICE_REVIEW_GENERATION_UNAVAILABLE,
    PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE,
    PracticePrimaryAnswerWorkflowContext,
    PracticeEvaluationWorkflowContext,
    PracticeReviewWorkflowContext,
    PracticeSessionService,
    PracticeSessionStateError,
    practice_follow_up_idempotency_key,
)
from riva.services.evaluation_generation import (
    EvaluationGenerationStateError,
    practice_evaluation_idempotency_key,
)
from riva.services.follow_up_generation import FollowUpGenerationStateError
from riva.services.recommendation_generation import (
    practice_recommendation_idempotency_key,
)
from riva.services.review_generation import practice_review_idempotency_key
from riva.services.question_generation import QuestionGenerationStateError


NOW = datetime(2026, 8, 10, 10, 0, tzinfo=UTC)


class ScriptedSession:
    def __init__(self, *scalar_values: object) -> None:
        self.scalar_values = list(scalar_values)
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
            and not (
                entity is AgentRun
                and value.agent_id != "follow-up-generator"
            )
        ]

        class Result:
            def all(self) -> list[object]:
                return values

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
        result={"prompt": "persisted"}
        if status is AgentRunStatus.SUCCEEDED
        else None,
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
        result={"action": "complete"}
        if status is AgentRunStatus.SUCCEEDED
        else None,
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
) -> AgentRun:
    payload = EvaluationRunPayload(
        attempt_id=attempt_id,
        question_card_id=question_card_id,
        main_answer_id=main_answer_id,
        interaction_language="en",
        follow_up_completion_reason=(
            follow_up_completion_reason
        ),
        terminal_follow_up_decision_id=decision_id,
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
            NOW
            if status in {AgentRunStatus.SUCCEEDED, AgentRunStatus.FAILED}
            else None
        ),
        provider="fake" if status is AgentRunStatus.SUCCEEDED else None,
        model="test-model",
        input_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        output_tokens=1 if status is AgentRunStatus.SUCCEEDED else None,
        result={"overallScore": 80}
        if status is AgentRunStatus.SUCCEEDED
        else None,
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
        idempotency_key=idempotency_key
        or practice_review_idempotency_key(attempt_id),
        attempt_count=0 if status is AgentRunStatus.QUEUED else 1,
        max_attempts=3,
        available_at=NOW,
        started_at=None if status is AgentRunStatus.QUEUED else NOW,
        finished_at=(
            NOW
            if status in {AgentRunStatus.SUCCEEDED, AgentRunStatus.FAILED}
            else None
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
            NOW
            if status in {AgentRunStatus.SUCCEEDED, AgentRunStatus.FAILED}
            else None
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
) -> PracticeSessionService:
    fake_generation = fake_generation or FakeGenerationService()
    fake_follow_up = fake_follow_up or FakeFollowUpGenerationService()
    fake_evaluation = fake_evaluation or FakeEvaluationGenerationService()
    fake_review = fake_review or FakeReviewGenerationService()
    fake_recommendation = fake_recommendation or FakeRecommendationGenerationService()
    return PracticeSessionService(
        session,  # type: ignore[arg-type]
        llm_model="test-model",
        question_generation_service_factory=lambda _session, **kwargs: fake_generation,  # type: ignore[arg-type]
        follow_up_generation_service_factory=lambda _session, **kwargs: fake_follow_up,  # type: ignore[arg-type]
        evaluation_generation_service_factory=lambda _session, **kwargs: fake_evaluation,  # type: ignore[arg-type]
        review_generation_service_factory=lambda _session, **kwargs: fake_review,  # type: ignore[arg-type]
        recommendation_generation_service_factory=lambda _session, **kwargs: fake_recommendation,  # type: ignore[arg-type]
        clock=lambda: NOW,
    )


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
        if evaluation_artifact_present
        and evaluation_status is AgentRunStatus.SUCCEEDED
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
        ("saved", PRACTICE_SESSION_SOURCE_UNAVAILABLE),
        ("history", PRACTICE_SESSION_SOURCE_UNAVAILABLE),
    ],
)
def test_start_session_rejects_unavailable_sources(
    source: str,
    expected: str,
) -> None:
    session = ScriptedSession()

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(session).start_session(
                user_id=uuid4(),
                selection=selection(source=source),
                interaction_language="en",
            )
        )

    assert error.value.code == expected
    assert session.rollback_count == 1


def test_start_session_rejects_weakness_prioritization_until_history_exists() -> None:
    session = ScriptedSession()

    with pytest.raises(PracticeSessionStateError) as error:
        asyncio.run(
            service(session).start_session(
                user_id=uuid4(),
                selection=selection(prioritize_weaknesses=True),
                interaction_language="en",
            )
        )

    assert error.value.code == PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE
    assert session.rollback_count == 1


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
                (
                    practice_session(user_id=uuid4(), role_id=uuid4(), version=3),
                ),
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

    result = asyncio.run(
        service(scripted).get_active_session_context(user_id=uuid4())
    )

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

    result = asyncio.run(
        service(scripted).get_active_session_context(user_id=user_id)
    )

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

    result = asyncio.run(
        service(scripted).get_active_session_context(user_id=user_id)
    )

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
        asyncio.run(
            service(scripted).get_active_session_context(user_id=user_id)
        )

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
        asyncio.run(
            service(scripted).get_active_session_context(user_id=user_id)
        )

    assert error.value.code == PRACTICE_QUESTION_GENERATION_STATE_CONFLICT
    assert scripted.rollback_count == 1


def test_submit_primary_answer_persists_answer_and_enqueues_follow_up_atomically() -> None:
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
    fake_follow_up = FakeFollowUpGenerationService(
        error=RuntimeError("enqueue failed")
    )
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
        error=FollowUpGenerationStateError(
            "follow_up_main_answer_not_ready"
        )
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


def test_submit_primary_answer_rejects_existing_main_answer_without_overwriting() -> None:
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
        error=EvaluationGenerationStateError(
            "practice_evaluation_context_conflict"
        )
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
        lambda run: run.payload.update(
            {"terminalFollowUpDecisionId": str(uuid4())}
        ),
        lambda run: run.payload.update({"interactionLanguage": "zh-CN"}),
        lambda run: run.payload.update(
            {"followUpQuestion1Id": str(uuid4())}
        ),
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

    result = asyncio.run(
        service(scripted).refresh_evaluation_generation(
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
    "missing", ["evaluation_run", "evaluation_artifact", "review_run", "review_artifact", "recommendation_run", "recommendation_artifact"],
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

    assert isinstance(result, PracticeEvaluationWorkflowContext | PracticeReviewWorkflowContext)
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
    assert result.follow_up_exchanges == (
        result.follow_up_exchanges[0],
    )
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


def test_submit_follow_up_answer_order2_persists_a2_without_order3_and_starts_evaluation() -> None:
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

    fake_evaluation = FakeEvaluationGenerationService(
        run_factory=build_evaluation
    )
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
