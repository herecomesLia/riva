import asyncio
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

from riva.core.errors import APIError
from riva.models import AgentRunStatus, PracticeAnswer
from riva.schemas.evaluation import PracticeEvaluationFollowUpCompletionReason
from riva.schemas.practice_reference_answer import (
    PracticeFollowUpReferenceAnswerOutput,
    PracticeMainReferenceAnswerOutput,
    PracticeReferenceAnswerTargetType,
)
from riva.services.practice_api import (
    PRACTICE_EVALUATION_GENERATION_UNAVAILABLE,
    PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE,
    PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE,
    PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE,
    PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
    PRACTICE_REVIEW_GENERATION_UNAVAILABLE,
    PracticeAPIService,
    build_practice_follow_up_reference_answer_response,
    build_practice_completed_session_response,
    build_practice_follow_up_question_response,
    build_practice_main_reference_answer_response,
    build_practice_question_response,
)
from riva.services.practice_sessions import (
    PRACTICE_EVALUATION_GENERATION_UNAVAILABLE as PRACTICE_EVALUATION_STATE_UNAVAILABLE,
    PRACTICE_EVALUATION_GENERATION_FAILED,
    PRACTICE_FOLLOW_UP_GENERATION_FAILED,
    PRACTICE_RECOMMENDATION_GENERATION_FAILED,
    PRACTICE_QUESTION_GENERATION_FAILED,
    PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED,
    PRACTICE_REVIEW_GENERATION_FAILED,
    PRACTICE_SESSION_NOT_FOUND,
    PRACTICE_SESSION_STATE_CONFLICT,
    PracticeAnsweredFollowUpExchangeContext,
    PracticeCompletedSessionWorkflowContext,
    PracticeEvaluationWorkflowContext,
    PracticePrimaryAnswerWorkflowContext,
    PracticeReviewWorkflowContext,
    PracticeSessionStateError,
    PracticeSessionWorkflowContext,
)
from riva.services.reference_answer_generation import (
    PracticeReferenceAnswerLifecycleStatus,
    PracticeReferenceAnswerWorkflowState,
)
from riva.schemas.practice_sessions import (
    ContinuePracticeQuestionRequest,
    CurrentPracticeSessionResponse,
    EndPracticeFollowUpsRequest,
    RefreshPracticeEvaluationRequest,
    RefreshPracticeFollowUpGenerationRequest,
    RefreshPracticeQuestionGenerationRequest,
    PracticeFollowUpReferenceAnswerRequest,
    PracticeQuestionReferenceAnswerRequest,
    RevealPracticeFollowUpGuidanceRequest,
    RevealPracticeQuestionGuidanceRequest,
    RetryPracticeQuestionRequest,
    SetPracticeQuestionSavedRequest,
    SetPracticeQuestionWeakRequest,
    StartPracticeSessionRequest,
    SubmitFollowUpAnswerRequest,
    SubmitPrimaryAnswerRequest,
)
from tests.unit.services.test_practice_sessions import (
    follow_up_decision,
    follow_up_question,
    follow_up_run,
    generation_payload,
    generation_run,
    main_answer,
    primary_answer_context,
    practice_attempt,
    practice_session,
    question_card,
    selection,
    evaluation_artifact,
    evaluation_run,
    recommendation_artifact,
    recommendation_run,
    review_artifact,
    review_run,
)


class FakePracticeSessionService:
    def __init__(
        self,
        *,
        context: PracticeSessionWorkflowContext | PracticePrimaryAnswerWorkflowContext,
        error: PracticeSessionStateError | None = None,
    ) -> None:
        self.context = context
        self.current_context = context
        self.error = error
        self.calls: list[tuple[str, object]] = []

    async def start_session(self, **kwargs: object) -> PracticeSessionWorkflowContext:
        self.calls.append(("start", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def refresh_question_generation(
        self,
        **kwargs: object,
    ) -> PracticeSessionWorkflowContext:
        self.calls.append(("refresh", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def continue_to_next_question(
        self,
        **kwargs: object,
    ) -> PracticeSessionWorkflowContext:
        self.calls.append(("continue", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def retry_current_question(
        self,
        **kwargs: object,
    ) -> PracticeSessionWorkflowContext:
        self.calls.append(("retry", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def set_question_saved(self, **kwargs: object):
        self.calls.append(("set_saved", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def set_question_weak(self, **kwargs: object):
        self.calls.append(("set_weak", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def reveal_question_hint(self, **kwargs: object):
        self.calls.append(("reveal_hint", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def reveal_question_framework(self, **kwargs: object):
        self.calls.append(("reveal_framework", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def reveal_follow_up_hint(self, **kwargs: object):
        self.calls.append(("reveal_follow_up_hint", kwargs))
        if self.error is not None:
            raise self.error
        assert isinstance(self.context, PracticePrimaryAnswerWorkflowContext)
        return self.context

    async def reveal_follow_up_framework(self, **kwargs: object):
        self.calls.append(("reveal_follow_up_framework", kwargs))
        if self.error is not None:
            raise self.error
        assert isinstance(self.context, PracticePrimaryAnswerWorkflowContext)
        return self.context

    async def submit_primary_answer(
        self,
        **kwargs: object,
    ) -> PracticePrimaryAnswerWorkflowContext:
        self.calls.append(("submit", kwargs))
        if self.error is not None:
            raise self.error
        assert isinstance(self.context, PracticePrimaryAnswerWorkflowContext)
        return self.context

    async def submit_follow_up_answer(
        self,
        **kwargs: object,
    ) -> PracticePrimaryAnswerWorkflowContext:
        self.calls.append(("submit_follow_up", kwargs))
        if self.error is not None:
            raise self.error
        assert isinstance(self.context, PracticePrimaryAnswerWorkflowContext)
        return self.context

    async def end_follow_ups(
        self,
        **kwargs: object,
    ) -> PracticeEvaluationWorkflowContext:
        self.calls.append(("end_follow_ups", kwargs))
        if self.error is not None:
            raise self.error
        assert isinstance(self.context, PracticeEvaluationWorkflowContext)
        return self.context

    async def refresh_follow_up_generation(
        self,
        **kwargs: object,
    ) -> PracticePrimaryAnswerWorkflowContext:
        self.calls.append(("refresh_follow_up", kwargs))
        if self.error is not None:
            raise self.error
        assert isinstance(self.context, PracticePrimaryAnswerWorkflowContext)
        return self.context

    async def refresh_evaluation_generation(
        self,
        **kwargs: object,
    ) -> PracticeSessionWorkflowContext:
        self.calls.append(("refresh_evaluation", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def request_question_reference_answer(
        self,
        **kwargs: object,
    ) -> PracticeSessionWorkflowContext:
        self.calls.append(("request_reference", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def refresh_question_reference_answer(
        self,
        **kwargs: object,
    ) -> PracticeSessionWorkflowContext:
        self.calls.append(("refresh_reference", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def request_follow_up_reference_answer(
        self,
        **kwargs: object,
    ) -> PracticeSessionWorkflowContext:
        self.calls.append(("request_follow_up_reference", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def refresh_follow_up_reference_answer(
        self,
        **kwargs: object,
    ) -> PracticeSessionWorkflowContext:
        self.calls.append(("refresh_follow_up_reference", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def get_session_context(
        self,
        **kwargs: object,
    ) -> PracticeSessionWorkflowContext:
        self.calls.append(("get", kwargs))
        if self.error is not None:
            raise self.error
        return self.context

    async def get_active_session_context(
        self,
        **kwargs: object,
    ) -> PracticeSessionWorkflowContext | None:
        self.calls.append(("current", kwargs))
        if self.error is not None:
            raise self.error
        return self.current_context


def context(*, answering: bool) -> PracticeSessionWorkflowContext:
    user_id = uuid4()
    role_id = uuid4()
    active = practice_session(
        user_id=user_id,
        role_id=role_id,
        version=2 if answering else 1,
    )
    payload = generation_payload(role_id=role_id)
    run = generation_run(
        user_id=user_id,
        payload=payload,
        status=AgentRunStatus.SUCCEEDED if answering else AgentRunStatus.QUEUED,
    )
    card = (
        question_card(user_id=user_id, role_id=role_id, run_id=run.id)
        if answering
        else None
    )
    attempt = practice_attempt(
        user_id=user_id,
        session_id=active.id,
        run_id=run.id,
        status="answering" if answering else "generatingQuestion",
        question_card_id=card.id if card is not None else None,
    )
    return PracticeSessionWorkflowContext(active, attempt, run, card)


def primary_context(
    *,
    attempt_status: str = "answering",
    version: int = 3,
    action: str | None = None,
) -> PracticePrimaryAnswerWorkflowContext:
    active, attempt, question_run, card = primary_answer_context(
        version=version,
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
    decision = None
    question = None
    if action == "askFollowUp":
        question = follow_up_question(attempt_id=attempt.id, run_id=follow_up.id)
        decision = follow_up_decision(
            attempt_id=attempt.id,
            run_id=follow_up.id,
            action=action,
            question_id=question.id,
        )
    elif action == "complete":
        decision = follow_up_decision(
            attempt_id=attempt.id,
            run_id=follow_up.id,
            action=action,
        )
    return PracticePrimaryAnswerWorkflowContext(
        session=active,
        attempt=attempt,
        question_card=card,
        main_answer=answer,
        follow_up_generation_run=follow_up,
        follow_up_decision=decision,
        follow_up_question=question,
        follow_up_completion_reason=(
            PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
            if action == "complete"
            else None
        ),
    )


def context_with_answered_exchanges(
    *,
    attempt_status: str,
    version: int,
    exchange_count: int,
    current_order: int | None = None,
) -> PracticePrimaryAnswerWorkflowContext:
    primary = primary_context(
        attempt_status=attempt_status,
        version=version,
        action=None,
    )
    exchanges: list[PracticeAnsweredFollowUpExchangeContext] = []
    questions = []
    for order in range(1, exchange_count + 1):
        question = follow_up_question(
            attempt_id=primary.attempt.id,
            run_id=primary.follow_up_generation_run.id,
            order=order,
        )
        answer = PracticeAnswer(
            id=uuid4(),
            attempt_id=primary.attempt.id,
            kind="followUp",
            order=order + 1,
            content=f"Follow-up answer {order}",
            follow_up_question_id=question.id,
            submitted_at=primary.session.updated_at,
        )
        questions.append(question)
        exchanges.append(
            PracticeAnsweredFollowUpExchangeContext(
                question=question,
                answer=answer,
            )
        )

    current_question = None
    current_decision = None
    completion_reason = None
    if current_order is not None:
        current_question = follow_up_question(
            attempt_id=primary.attempt.id,
            run_id=primary.follow_up_generation_run.id,
            order=current_order,
        )
        current_decision = follow_up_decision(
            attempt_id=primary.attempt.id,
            run_id=primary.follow_up_generation_run.id,
            action="askFollowUp",
            question_id=current_question.id,
            order=current_order,
        )
    elif exchange_count:
        completion_reason = PracticeEvaluationFollowUpCompletionReason.ALL_ANSWERED
        terminal_question = questions[-1] if exchange_count == 2 else None
        current_decision = follow_up_decision(
            attempt_id=primary.attempt.id,
            run_id=primary.follow_up_generation_run.id,
            action="askFollowUp" if exchange_count == 2 else "complete",
            question_id=terminal_question.id if terminal_question else None,
            order=2,
        )

    return replace(
        primary,
        follow_up_decision=current_decision,
        follow_up_question=current_question,
        follow_up_exchanges=tuple(exchanges),
        follow_up_completion_reason=completion_reason,
    )


def review_context(
    *,
    action: str = "retryCurrent",
) -> PracticeReviewWorkflowContext:
    primary = primary_context(
        attempt_status="review",
        version=5,
        action="complete",
    )
    evaluation_run_value = evaluation_run(
        user_id=primary.session.user_id,
        attempt_id=primary.attempt.id,
        question_card_id=primary.question_card.id,
        main_answer_id=primary.main_answer.id,
        decision_id=primary.follow_up_decision.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    evaluation = evaluation_artifact(
        attempt_id=primary.attempt.id,
        run_id=evaluation_run_value.id,
    )
    review_run_value = review_run(
        user_id=primary.session.user_id,
        attempt_id=primary.attempt.id,
        evaluation_id=evaluation.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    review = review_artifact(
        attempt_id=primary.attempt.id,
        run_id=review_run_value.id,
    )
    recommendation_run_value = recommendation_run(
        user_id=primary.session.user_id,
        attempt_id=primary.attempt.id,
        evaluation_id=evaluation.id,
        review_id=review.id,
        status=AgentRunStatus.SUCCEEDED,
    )
    recommendation = recommendation_artifact(
        attempt_id=primary.attempt.id,
        run_id=recommendation_run_value.id,
        action=action,
    )
    primary.attempt.completed_at = primary.session.updated_at
    return PracticeReviewWorkflowContext(
        session=primary.session,
        attempt=primary.attempt,
        question_card=primary.question_card,
        main_answer=primary.main_answer,
        follow_up_generation_run=primary.follow_up_generation_run,
        follow_up_decision=primary.follow_up_decision,
        follow_up_question=None,
        follow_up_completion_reason=(
            PracticeEvaluationFollowUpCompletionReason.NO_FOLLOW_UP_REQUIRED
        ),
        evaluation_generation_run=evaluation_run_value,
        evaluation=evaluation,
        review_generation_run=review_run_value,
        review=review,
        recommendation_generation_run=recommendation_run_value,
        recommendation=recommendation,
    )


def ended_early_evaluation_context(
    *,
    exchange_count: int = 0,
) -> PracticeEvaluationWorkflowContext:
    primary = context_with_answered_exchanges(
        attempt_status="evaluating",
        version=5,
        exchange_count=exchange_count,
        current_order=exchange_count + 1,
    )
    assert primary.follow_up_decision is not None
    assert primary.follow_up_question is not None
    run = evaluation_run(
        user_id=primary.session.user_id,
        attempt_id=primary.attempt.id,
        question_card_id=primary.question_card.id,
        main_answer_id=primary.main_answer.id,
        decision_id=primary.follow_up_decision.id,
        follow_up_completion_reason=PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY,
        unanswered_follow_up_question_id=primary.follow_up_question.id,
        follow_up_question_1_id=(
            primary.follow_up_exchanges[0].question.id
            if exchange_count == 1
            else None
        ),
        follow_up_answer_1_id=(
            primary.follow_up_exchanges[0].answer.id
            if exchange_count == 1
            else None
        ),
    )
    return PracticeEvaluationWorkflowContext(
        session=primary.session,
        attempt=primary.attempt,
        question_card=primary.question_card,
        main_answer=primary.main_answer,
        follow_up_generation_run=primary.follow_up_generation_run,
        follow_up_decision=primary.follow_up_decision,
        follow_up_question=primary.follow_up_question,
        follow_up_exchanges=primary.follow_up_exchanges,
        follow_up_completion_reason=PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY,
        evaluation_generation_run=run,
        evaluation=None,
    )


def start_request() -> StartPracticeSessionRequest:
    return StartPracticeSessionRequest.model_validate(
        selection(target_role_id=uuid4()).model_dump(mode="json")
    )


def reference_answer_state(
    status: PracticeReferenceAnswerLifecycleStatus,
    *,
    target_type: PracticeReferenceAnswerTargetType,
    viewed_before_submission: bool = False,
    generated_at: datetime = datetime(2026, 8, 14, 9, 30, tzinfo=UTC),
) -> PracticeReferenceAnswerWorkflowState:
    if status is PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED:
        return PracticeReferenceAnswerWorkflowState(
            status=status,
            generation_run=None,
            artifact=None,
            output=None,
            viewed_before_submission=False,
        )

    output = (
        PracticeMainReferenceAnswerOutput(
            targetType="main",
            kind="personalizedExample",
            answer="A grounded main answer.",
            keyPoints=["State the decision.", "Connect the evidence."],
            commonMistakes=["Inventing a metric."],
        )
        if target_type is PracticeReferenceAnswerTargetType.MAIN
        else PracticeFollowUpReferenceAnswerOutput(
            targetType="followUp",
            kind="personalizedSupplement",
            addressedGap="Connect the decision to the result.",
            answer="A grounded follow-up answer.",
            keyPoints=["Name the baseline.", "Connect the result."],
            commonMistakes=["Claiming team impact as personal impact."],
        )
    )
    return PracticeReferenceAnswerWorkflowState(
        status=status,
        generation_run=object(),
        artifact=SimpleNamespace(generated_at=generated_at)
        if status is PracticeReferenceAnswerLifecycleStatus.REVEALED
        else None,
        output=output
        if status is PracticeReferenceAnswerLifecycleStatus.REVEALED
        else None,
        viewed_before_submission=(
            viewed_before_submission
            if status is PracticeReferenceAnswerLifecycleStatus.REVEALED
            else False
        ),
    )


class FakeReferenceAnswerGenerationService:
    def __init__(
        self,
        state: PracticeReferenceAnswerWorkflowState,
        follow_up_state: PracticeReferenceAnswerWorkflowState | None = None,
    ) -> None:
        self.state = state
        self.follow_up_state = follow_up_state or state
        self.main_calls: list[dict[str, object]] = []
        self.follow_up_calls: list[dict[str, object]] = []

    async def get_main_generation_state(self, **kwargs: object):
        self.main_calls.append(kwargs)
        return self.state

    async def get_follow_up_generation_state(self, **kwargs: object):
        self.follow_up_calls.append(kwargs)
        return self.follow_up_state


def test_reference_answer_converters_map_all_lifecycle_states_without_raw_fields() -> None:
    for status in (
        PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED,
        PracticeReferenceAnswerLifecycleStatus.GENERATING,
        PracticeReferenceAnswerLifecycleStatus.UNAVAILABLE,
    ):
        state = reference_answer_state(
            status,
            target_type=PracticeReferenceAnswerTargetType.MAIN,
            viewed_before_submission=True,
        )
        response = build_practice_main_reference_answer_response(state)
        assert response.status == status.value
        assert response.content is None
        assert response.viewed_before_submission is False

    generated_at = datetime(2026, 8, 14, 10, 15, tzinfo=UTC)
    main_revealed = build_practice_main_reference_answer_response(
        reference_answer_state(
            PracticeReferenceAnswerLifecycleStatus.REVEALED,
            target_type=PracticeReferenceAnswerTargetType.MAIN,
            viewed_before_submission=True,
            generated_at=generated_at,
        )
    )
    assert main_revealed.status == "revealed"
    assert main_revealed.content is not None
    assert main_revealed.content.generated_at == generated_at
    assert main_revealed.content.answer == "A grounded main answer."
    assert main_revealed.viewed_before_submission is True

    follow_up_revealed = build_practice_follow_up_reference_answer_response(
        reference_answer_state(
            PracticeReferenceAnswerLifecycleStatus.REVEALED,
            target_type=PracticeReferenceAnswerTargetType.FOLLOW_UP,
            generated_at=generated_at,
        )
    )
    assert follow_up_revealed.status == "revealed"
    assert follow_up_revealed.content is not None
    assert follow_up_revealed.content.addressed_gap == (
        "Connect the decision to the result."
    )
    assert follow_up_revealed.content.generated_at == generated_at


def test_ordinary_mutation_and_current_session_hydrate_reference_state() -> None:
    domain = FakePracticeSessionService(context=context(answering=True))
    state = reference_answer_state(
        PracticeReferenceAnswerLifecycleStatus.GENERATING,
        target_type=PracticeReferenceAnswerTargetType.MAIN,
    )
    resolver = FakeReferenceAnswerGenerationService(state)
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
        reference_answer_generation_service_factory=lambda *_args, **_kwargs: resolver,
    )
    question_id = domain.context.question_card.id

    saved = asyncio.run(
        service.set_question_saved(
            user_id=domain.context.session.user_id,
            session_id=domain.context.session.id,
            payload=SetPracticeQuestionSavedRequest(
                version=domain.context.session.version,
                question_id=question_id,
                is_saved=True,
            ),
        )
    )
    current = asyncio.run(
        service.get_current_session(user_id=domain.context.session.user_id)
    )

    assert saved.status == "answering"
    assert saved.question.reference_answer.status == "generating"
    assert current.session is not None
    assert current.session.question.reference_answer.status == "generating"
    assert len(resolver.main_calls) == 2
    assert all(call["question_card_id"] == question_id for call in resolver.main_calls)


def test_failed_reference_state_hydrates_as_unavailable_without_internal_fields() -> None:
    domain = FakePracticeSessionService(context=context(answering=True))
    resolver = FakeReferenceAnswerGenerationService(
        reference_answer_state(
            PracticeReferenceAnswerLifecycleStatus.UNAVAILABLE,
            target_type=PracticeReferenceAnswerTargetType.MAIN,
        )
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
        reference_answer_generation_service_factory=lambda *_args, **_kwargs: resolver,
    )

    response = asyncio.run(
        service.get_current_session(user_id=domain.context.session.user_id)
    )

    assert response.session is not None
    reference_answer = response.session.question.reference_answer
    assert reference_answer.status == "unavailable"
    assert reference_answer.content is None
    assert reference_answer.viewed_before_submission is False


def test_reference_request_checks_llm_but_refresh_does_not() -> None:
    domain = FakePracticeSessionService(context=context(answering=True))
    question_id = domain.context.question_card.id
    payload = PracticeQuestionReferenceAnswerRequest(
        version=domain.context.session.version,
        question_id=question_id,
    )
    unavailable = PracticeAPIService(
        object(),
        llm_provider="openai",
        llm_model="model",
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    with pytest.raises(APIError) as error:
        asyncio.run(
            unavailable.request_question_reference_answer(
                user_id=domain.context.session.user_id,
                session_id=domain.context.session.id,
                payload=payload,
            )
        )
    assert error.value.status_code == 503
    assert error.value.error == PRACTICE_REFERENCE_ANSWER_GENERATION_UNAVAILABLE
    assert domain.calls == []

    refreshed = asyncio.run(
        unavailable.refresh_question_reference_answer(
            user_id=domain.context.session.user_id,
            session_id=domain.context.session.id,
            payload=payload,
        )
    )
    assert refreshed.status == "answering"
    assert [call[0] for call in domain.calls] == [
        "refresh_reference",
        "get",
    ]


def factory_for(
    domain: FakePracticeSessionService,
    calls: list[dict[str, object]],
):
    def factory(_session: object, **kwargs: object) -> FakePracticeSessionService:
        calls.append(kwargs)
        return domain

    return factory


def test_start_freezes_language_and_builds_public_generating_response() -> None:
    domain = FakePracticeSessionService(context=context(answering=False))
    factory_calls: list[dict[str, object]] = []
    service = PracticeAPIService(
        object(),
        llm_provider="QWEN",
        llm_model="qwen-test",
        practice_service_factory=factory_for(
            domain,
            factory_calls,
        ),
    )

    result = asyncio.run(
        service.start_session(
            user_id=uuid4(),
            payload=start_request(),
            interaction_language="zh-CN",
        )
    )

    assert result.status == "generatingQuestion"
    assert result.language == "en"
    assert domain.calls[0][0] == "start"
    assert domain.calls[0][1]["interaction_language"] == "zh-CN"
    assert factory_calls == [{"llm_model": "qwen-test"}]


def test_start_rejects_unavailable_llm_with_stable_error() -> None:
    domain = FakePracticeSessionService(context=context(answering=False))
    service = PracticeAPIService(
        object(),
        llm_provider="openai",
        llm_model="model",
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    with pytest.raises(APIError) as error:
        asyncio.run(
            service.start_session(
                user_id=uuid4(),
                payload=start_request(),
                interaction_language="en",
            )
        )

    assert error.value.status_code == 503
    assert error.value.error == PRACTICE_QUESTION_GENERATION_UNAVAILABLE
    assert domain.calls == []


def test_refresh_and_get_do_not_require_llm_configuration() -> None:
    domain = FakePracticeSessionService(context=context(answering=True))
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )
    session_id = uuid4()
    user_id = uuid4()

    refreshed = asyncio.run(
        service.refresh_question_generation(
            user_id=user_id,
            session_id=session_id,
            payload=RefreshPracticeQuestionGenerationRequest(version=1),
        )
    )
    fetched = asyncio.run(
        service.get_session(user_id=user_id, session_id=session_id)
    )

    assert refreshed.status == "answering"
    assert fetched.status == "answering"
    assert [call[0] for call in domain.calls] == ["refresh", "get"]


def test_continue_to_next_question_forwards_public_provenance_without_llm_precheck() -> None:
    domain = FakePracticeSessionService(context=context(answering=False))
    domain.context.session.version = 6
    service = PracticeAPIService(
        object(),
        llm_provider="openai",
        llm_model=None,
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )
    session_id = domain.context.session.id
    user_id = domain.context.session.user_id
    question_id = uuid4()

    result = asyncio.run(
        service.continue_to_next_question(
            user_id=user_id,
            session_id=session_id,
            payload=ContinuePracticeQuestionRequest(
                version=5,
                question_id=question_id,
            ),
        )
    )

    assert result.status == "generatingQuestion"
    assert result.version == 6
    assert domain.calls == [
        (
            "continue",
            {
                "user_id": user_id,
                "session_id": session_id,
                "expected_version": 5,
                "question_id": question_id,
            },
        )
    ]


def test_continue_to_next_question_maps_generation_unavailable_to_503() -> None:
    domain = FakePracticeSessionService(
        context=context(answering=False),
        error=PracticeSessionStateError(
            PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
            source_code="missing_model",
        ),
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    with pytest.raises(APIError) as error:
        asyncio.run(
            service.continue_to_next_question(
                user_id=domain.context.session.user_id,
                session_id=domain.context.session.id,
                payload=ContinuePracticeQuestionRequest(
                    version=5,
                    question_id=uuid4(),
                ),
            )
        )

    assert error.value.status_code == 503
    assert error.value.error == PRACTICE_QUESTION_GENERATION_UNAVAILABLE


@pytest.mark.parametrize(
    ("code", "status_code"),
    [
        (PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED, 409),
        ("practice_session_version_conflict", 409),
        (PRACTICE_SESSION_NOT_FOUND, 404),
    ],
)
def test_continue_to_next_question_maps_state_errors(
    code: str,
    status_code: int,
) -> None:
    domain = FakePracticeSessionService(
        context=context(answering=False),
        error=PracticeSessionStateError(code),
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    with pytest.raises(APIError) as error:
        asyncio.run(
            service.continue_to_next_question(
                user_id=domain.context.session.user_id,
                session_id=domain.context.session.id,
                payload=ContinuePracticeQuestionRequest(
                    version=5,
                    question_id=uuid4(),
                ),
            )
        )

    assert error.value.status_code == status_code
    assert error.value.error == code


def test_retry_current_question_forwards_public_provenance_without_llm_precheck() -> None:
    domain = FakePracticeSessionService(context=context(answering=True))
    domain.context.session.version = 6
    domain.context.attempt.attempt_number = 2
    assert domain.context.question_card is not None
    question_id = domain.context.question_card.id
    service = PracticeAPIService(
        object(),
        llm_provider="openai",
        llm_model=None,
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    result = asyncio.run(
        service.retry_current_question(
            user_id=domain.context.session.user_id,
            session_id=domain.context.session.id,
            payload=RetryPracticeQuestionRequest(
                version=5,
                question_id=question_id,
            ),
        )
    )

    assert result.status == "answering"
    assert result.version == 6
    assert result.attempt_number == 2
    assert result.attempt_id == domain.context.attempt.id
    assert result.question.id == question_id
    assert domain.calls == [
        (
            "retry",
            {
                "user_id": domain.context.session.user_id,
                "session_id": domain.context.session.id,
                "expected_version": 5,
                "question_id": question_id,
            },
        )
    ]


def test_question_flag_mutations_forward_exact_args_without_llm_precheck() -> None:
    domain = FakePracticeSessionService(context=context(answering=True))
    domain.context.session.version = 4
    assert domain.context.question_card is not None
    service = PracticeAPIService(
        object(),
        llm_provider="openai",
        llm_model=None,
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    saved = asyncio.run(
        service.set_question_saved(
            user_id=domain.context.session.user_id,
            session_id=domain.context.session.id,
            payload=SetPracticeQuestionSavedRequest(
                version=4,
                question_id=domain.context.question_card.id,
                is_saved=True,
            ),
        )
    )
    weak = asyncio.run(
        service.set_question_weak(
            user_id=domain.context.session.user_id,
            session_id=domain.context.session.id,
            payload=SetPracticeQuestionWeakRequest(
                version=4,
                question_id=domain.context.question_card.id,
                is_marked_weak=True,
            ),
        )
    )

    assert saved.status == "answering"
    assert weak.status == "answering"
    assert domain.calls == [
        (
            "set_saved",
            {
                "user_id": domain.context.session.user_id,
                "session_id": domain.context.session.id,
                "expected_version": 4,
                "question_id": domain.context.question_card.id,
                "is_saved": True,
            },
        ),
        (
            "set_weak",
            {
                "user_id": domain.context.session.user_id,
                "session_id": domain.context.session.id,
                "expected_version": 4,
                "question_id": domain.context.question_card.id,
                "is_marked_weak": True,
            },
        ),
    ]

    review_domain = FakePracticeSessionService(context=review_context())
    review_service = PracticeAPIService(
        object(),
        llm_provider="openai",
        llm_model=None,
        practice_service_factory=lambda *_args, **_kwargs: review_domain,
    )
    review_response = asyncio.run(
        review_service.set_question_weak(
            user_id=review_domain.context.session.user_id,
            session_id=review_domain.context.session.id,
            payload=SetPracticeQuestionWeakRequest(
                version=5,
                question_id=review_domain.context.question_card.id,
                is_marked_weak=True,
            ),
        )
    )

    assert review_response.status == "review"
    assert review_domain.calls == [
        (
            "set_weak",
            {
                "user_id": review_domain.context.session.user_id,
                "session_id": review_domain.context.session.id,
                "expected_version": 5,
                "question_id": review_domain.context.question_card.id,
                "is_marked_weak": True,
            },
        )
    ]


def test_question_builder_hides_frozen_guidance_until_each_flag_is_revealed() -> None:
    workflow = context(answering=True)
    assert workflow.question_card is not None
    card = workflow.question_card
    card.answer_hints = ["Frozen hint"]
    card.answer_framework = ["Frozen framework"]
    card.answer_hints_revealed = False
    card.answer_framework_revealed = False

    hidden = build_practice_question_response(card)
    assert hidden.answer_hints.model_dump(mode="json") == {
        "status": "notRequested",
        "content": None,
    }
    assert hidden.answer_framework.model_dump(mode="json") == {
        "status": "notRequested",
        "content": None,
    }

    card.answer_hints_revealed = True
    hint_revealed = build_practice_question_response(card)
    assert hint_revealed.answer_hints.model_dump(mode="json") == {
        "status": "revealed",
        "content": ["Frozen hint"],
    }
    assert hint_revealed.answer_framework.status == "notRequested"

    card.answer_framework_revealed = True
    both_revealed = build_practice_question_response(card)
    assert both_revealed.answer_hints.status == "revealed"
    assert both_revealed.answer_framework.model_dump(mode="json") == {
        "status": "revealed",
        "content": ["Frozen framework"],
    }

    card.answer_hints = []
    unavailable = build_practice_question_response(card)
    assert unavailable.answer_hints.model_dump(mode="json") == {
        "status": "unavailable",
        "content": None,
    }


def test_follow_up_builder_projects_revealed_and_unavailable_guidance() -> None:
    question = follow_up_question(attempt_id=uuid4(), run_id=uuid4())
    question.answer_hints_revealed = True
    question.answer_framework_revealed = True
    projected = build_practice_follow_up_question_response(question)

    assert projected.answer_hints.status == "revealed"
    assert projected.answer_framework.status == "revealed"

    question.answer_framework = []
    unavailable = build_practice_follow_up_question_response(question)
    assert unavailable.answer_framework.model_dump(mode="json") == {
        "status": "unavailable",
        "content": None,
    }


@pytest.mark.parametrize(
    ("method_name", "request_type", "context_factory", "expected_call"),
    [
        (
            "reveal_question_hint",
            RevealPracticeQuestionGuidanceRequest,
            lambda: context(answering=True),
            "reveal_hint",
        ),
        (
            "reveal_question_framework",
            RevealPracticeQuestionGuidanceRequest,
            lambda: context(answering=True),
            "reveal_framework",
        ),
    ],
)
def test_main_guidance_reveal_service_methods_forward_exact_domain_args_without_llm(
    method_name: str,
    request_type: type[RevealPracticeQuestionGuidanceRequest],
    context_factory,
    expected_call: str,
) -> None:
    domain = FakePracticeSessionService(context=context_factory())
    assert domain.context.question_card is not None
    service = PracticeAPIService(
        object(),
        llm_provider="openai",
        llm_model=None,
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )
    user_id = domain.context.session.user_id
    session_id = domain.context.session.id
    question_id = domain.context.question_card.id
    payload = request_type(version=2, question_id=question_id)

    result = asyncio.run(
        getattr(service, method_name)(
            user_id=user_id,
            session_id=session_id,
            payload=payload,
        )
    )

    assert result.status == "answering"
    assert domain.calls == [
        (
            expected_call,
            {
                "user_id": user_id,
                "session_id": session_id,
                "expected_version": 2,
                "question_id": question_id,
            },
        )
    ]


@pytest.mark.parametrize(
    ("method_name", "expected_call"),
    [
        ("reveal_follow_up_hint", "reveal_follow_up_hint"),
        ("reveal_follow_up_framework", "reveal_follow_up_framework"),
    ],
)
def test_follow_up_guidance_reveal_service_methods_forward_exact_domain_args_without_llm(
    method_name: str,
    expected_call: str,
) -> None:
    domain = FakePracticeSessionService(
        context=primary_context(attempt_status="answeringFollowUp", action="askFollowUp")
    )
    assert isinstance(domain.context, PracticePrimaryAnswerWorkflowContext)
    assert domain.context.follow_up_question is not None
    service = PracticeAPIService(
        object(),
        llm_provider="openai",
        llm_model=None,
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )
    user_id = domain.context.session.user_id
    session_id = domain.context.session.id
    question_id = domain.context.question_card.id
    follow_up_question_id = domain.context.follow_up_question.id
    payload = RevealPracticeFollowUpGuidanceRequest(
        version=3,
        question_id=question_id,
        follow_up_question_id=follow_up_question_id,
    )

    result = asyncio.run(
        getattr(service, method_name)(
            user_id=user_id,
            session_id=session_id,
            payload=payload,
        )
    )

    assert result.status == "answeringFollowUp"
    assert domain.calls == [
        (
            expected_call,
            {
                "user_id": user_id,
                "session_id": session_id,
                "expected_version": 3,
                "question_id": question_id,
                "follow_up_question_id": follow_up_question_id,
            },
        )
    ]


@pytest.mark.parametrize(
    ("code", "status_code"),
    [
        ("practice_session_version_conflict", 409),
        (PRACTICE_SESSION_STATE_CONFLICT, 409),
        (PRACTICE_SESSION_NOT_FOUND, 404),
    ],
)
def test_retry_current_question_maps_state_errors(code: str, status_code: int) -> None:
    domain = FakePracticeSessionService(
        context=context(answering=True),
        error=PracticeSessionStateError(code),
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    with pytest.raises(APIError) as error:
        asyncio.run(
            service.retry_current_question(
                user_id=domain.context.session.user_id,
                session_id=domain.context.session.id,
                payload=RetryPracticeQuestionRequest(
                    version=5,
                    question_id=domain.context.question_card.id,
                ),
            )
        )

    assert error.value.status_code == status_code
    assert error.value.error == code


def test_refresh_evaluation_forwards_version_without_llm_precheck() -> None:
    domain = FakePracticeSessionService(
        context=primary_context(
            attempt_status="evaluating",
            version=4,
            action="complete",
        )
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    result = asyncio.run(
        service.refresh_evaluation(
            user_id=domain.context.session.user_id,
            session_id=domain.context.session.id,
            payload=RefreshPracticeEvaluationRequest(version=4),
        )
    )

    assert result.status == "evaluating"
    assert result.version == 4
    assert domain.calls == [
        (
            "refresh_evaluation",
            {
                "user_id": domain.context.session.user_id,
                "session_id": domain.context.session.id,
                "expected_version": 4,
            },
        )
    ]


@pytest.mark.parametrize("action", ["retryCurrent", "nextQuestion"])
def test_final_review_projection_contains_only_public_lineage_free_fields(
    action: str,
) -> None:
    domain = FakePracticeSessionService(context=review_context(action=action))
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    result = asyncio.run(
        service.refresh_evaluation(
            user_id=domain.context.session.user_id,
            session_id=domain.context.session.id,
            payload=RefreshPracticeEvaluationRequest(version=4),
        )
    )
    serialized = result.model_dump(mode="json", by_alias=True)

    assert result.status == "review"
    assert result.version == 5
    assert set(serialized["evaluation"]) == {
        "overallScore",
        "dimensionScores",
        "evaluatedAt",
    }
    assert set(serialized["review"]) == {
        "overallPerformance",
        "highlights",
        "mainIssues",
        "improvementSuggestions",
        "reusableAnswerStructure",
        "exposedWeaknesses",
        "recommendation",
    }
    assert serialized["review"]["recommendation"]["action"] == action
    if action == "retryCurrent":
        assert "nextQuestion" not in serialized["review"]["recommendation"]
    else:
        assert "nextQuestion" in serialized["review"]["recommendation"]
    assert "completedAt" not in serialized
    dumped = str(serialized)
    for field in (
        "focusAssessments",
        "evaluationRunId",
        "reviewRunId",
        "recommendationRunId",
        "sourceAgentRunId",
        "provider",
        "model",
    ):
        assert field not in dumped


@pytest.mark.parametrize(
    ("domain_error", "status_code", "error_code"),
    [
        (
            PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_UNAVAILABLE,
                source_code="missing_review_model",
            ),
            503,
            PRACTICE_REVIEW_GENERATION_UNAVAILABLE,
        ),
        (
            PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE,
                source_code="missing_recommendation_model",
            ),
            503,
            PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE,
        ),
        (
            PracticeSessionStateError(
                PRACTICE_EVALUATION_GENERATION_FAILED,
                source_code="provider_details",
            ),
            409,
            PRACTICE_EVALUATION_GENERATION_FAILED,
        ),
        (
            PracticeSessionStateError(
                PRACTICE_REVIEW_GENERATION_FAILED,
                source_code="provider_details",
            ),
            409,
            PRACTICE_REVIEW_GENERATION_FAILED,
        ),
        (
            PracticeSessionStateError(
                PRACTICE_RECOMMENDATION_GENERATION_FAILED,
                source_code="provider_details",
            ),
            409,
            PRACTICE_RECOMMENDATION_GENERATION_FAILED,
        ),
    ],
)
def test_refresh_evaluation_maps_downstream_errors_to_safe_codes(
    domain_error: PracticeSessionStateError,
    status_code: int,
    error_code: str,
) -> None:
    domain = FakePracticeSessionService(
        context=primary_context(
            attempt_status="evaluating",
            version=4,
            action="complete",
        ),
        error=domain_error,
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    with pytest.raises(APIError) as error:
        asyncio.run(
            service.refresh_evaluation(
                user_id=uuid4(),
                session_id=uuid4(),
                payload=RefreshPracticeEvaluationRequest(version=4),
            )
        )

    assert error.value.status_code == status_code
    assert error.value.error == error_code
    assert "provider_details" not in str(error.value)


def test_submit_primary_answer_checks_configuration_and_projects_main_answer() -> None:
    domain = FakePracticeSessionService(context=primary_context())
    service = PracticeAPIService(
        object(),
        llm_provider="QWEN",
        llm_model="qwen-follow-up",
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )
    session_id = domain.context.session.id
    user_id = domain.context.session.user_id
    question_id = domain.context.question_card.id

    result = asyncio.run(
        service.submit_primary_answer(
            user_id=user_id,
            session_id=session_id,
            payload=SubmitPrimaryAnswerRequest(
                version=2,
                question_id=question_id,
                content="  Submitted answer  ",
            ),
        )
    )

    assert result.status == "generatingFollowUp"
    assert result.version == 3
    assert result.main_answer.content == "Stored answer"
    assert result.main_answer.id == domain.context.main_answer.id
    assert result.main_answer.order == 1
    assert domain.calls == [
        (
            "submit",
            {
                "user_id": user_id,
                "session_id": session_id,
                "expected_version": 2,
                "question_id": question_id,
                "content": "Submitted answer",
            },
        )
    ]


def test_submit_primary_answer_fails_before_domain_when_follow_up_llm_unavailable() -> None:
    domain = FakePracticeSessionService(context=primary_context())
    service = PracticeAPIService(
        object(),
        llm_provider="openai",
        llm_model="model",
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )
    context_value = domain.context

    with pytest.raises(APIError) as error:
        asyncio.run(
            service.submit_primary_answer(
                user_id=context_value.session.user_id,
                session_id=context_value.session.id,
                payload=SubmitPrimaryAnswerRequest(
                    version=2,
                    question_id=context_value.question_card.id,
                    content="A valid answer",
                ),
            )
        )

    assert error.value.status_code == 503
    assert error.value.error == PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE
    assert domain.calls == []


def test_submit_follow_up_answer_forwards_exact_args_without_llm_precheck() -> None:
    domain = FakePracticeSessionService(
        context=primary_context(
            attempt_status="answering",
            version=5,
        )
    )
    service = PracticeAPIService(
        object(),
        llm_provider="openai",
        llm_model="model",
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )
    context_value = domain.context
    follow_up_question_id = uuid4()

    result = asyncio.run(
        service.submit_follow_up_answer(
            user_id=context_value.session.user_id,
            session_id=context_value.session.id,
            payload=SubmitFollowUpAnswerRequest(
                version=4,
                question_id=context_value.question_card.id,
                follow_up_question_id=follow_up_question_id,
                content="  Follow-up answer  ",
            ),
        )
    )

    assert result.status == "generatingFollowUp"
    assert domain.calls == [
        (
            "submit_follow_up",
            {
                "user_id": context_value.session.user_id,
                "session_id": context_value.session.id,
                "expected_version": 4,
                "question_id": context_value.question_card.id,
                "follow_up_question_id": follow_up_question_id,
                "content": "Follow-up answer",
            },
        )
    ]


def test_submit_follow_up_answer_maps_domain_unavailable_to_503() -> None:
    domain = FakePracticeSessionService(
        context=primary_context(),
        error=PracticeSessionStateError(
            PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE,
            source_code="missing_model",
        ),
    )
    service = PracticeAPIService(
        object(),
        llm_provider="openai",
        llm_model="model",
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    with pytest.raises(APIError) as error:
        asyncio.run(
            service.submit_follow_up_answer(
                user_id=domain.context.session.user_id,
                session_id=domain.context.session.id,
                payload=SubmitFollowUpAnswerRequest(
                    version=4,
                    question_id=domain.context.question_card.id,
                    follow_up_question_id=uuid4(),
                    content="Follow-up answer",
                ),
            )
        )

    assert error.value.status_code == 503
    assert error.value.error == PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE


def test_follow_up_public_projection_separates_answered_and_current_questions() -> None:
    domain = FakePracticeSessionService(
        context=context_with_answered_exchanges(
            attempt_status="answeringFollowUp",
            version=6,
            exchange_count=1,
            current_order=2,
        )
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    result = asyncio.run(
        service.get_session(
            user_id=domain.context.session.user_id,
            session_id=domain.context.session.id,
        )
    )

    assert result.status == "answeringFollowUp"
    assert len(result.follow_up_exchanges) == 1
    assert result.follow_up_exchanges[0].status == "answered"
    assert result.follow_up_exchanges[0].question.order == 1
    assert result.follow_up_exchanges[0].answer.order == 2
    assert result.current_follow_up.question.order == 2
    assert result.current_follow_up.answer is None


@pytest.mark.parametrize("exchange_count", [0, 1])
def test_end_follow_ups_forwards_exact_args_without_llm_precheck_and_projects_ended_early(
    exchange_count: int,
) -> None:
    domain = FakePracticeSessionService(
        context=ended_early_evaluation_context(exchange_count=exchange_count)
    )
    service = PracticeAPIService(
        object(),
        llm_provider="openai",
        llm_model=None,
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )
    context = domain.context
    assert isinstance(context, PracticeEvaluationWorkflowContext)
    assert context.follow_up_question is not None
    payload = EndPracticeFollowUpsRequest(
        version=context.session.version,
        question_id=context.question_card.id,
        follow_up_question_id=context.follow_up_question.id,
    )

    result = asyncio.run(
        service.end_follow_ups(
            user_id=context.session.user_id,
            session_id=context.session.id,
            payload=payload,
        )
    )

    assert result.status == "evaluating"
    assert result.version == context.session.version
    assert result.follow_up_completion.status == "endedEarly"
    assert result.follow_up_completion.unanswered_question.id == (
        context.follow_up_question.id
    )
    assert result.follow_up_completion.unanswered_question.order == exchange_count + 1
    assert len(result.follow_up_exchanges) == exchange_count
    assert domain.calls == [
        (
            "end_follow_ups",
            {
                "user_id": context.session.user_id,
                "session_id": context.session.id,
                "expected_version": context.session.version,
                "question_id": context.question_card.id,
                "follow_up_question_id": context.follow_up_question.id,
            },
        )
    ]


def test_ended_early_evaluation_and_review_hydration_use_evaluation_run_cutoff() -> None:
    evaluation_context = ended_early_evaluation_context(exchange_count=0)
    cutoff = datetime(2026, 8, 14, 10, 0, tzinfo=UTC)
    evaluation_context.evaluation_generation_run.created_at = cutoff
    resolver = FakeReferenceAnswerGenerationService(
        reference_answer_state(
            PracticeReferenceAnswerLifecycleStatus.REVEALED,
            target_type=PracticeReferenceAnswerTargetType.MAIN,
            generated_at=cutoff + timedelta(seconds=1),
        ),
        follow_up_state=reference_answer_state(
            PracticeReferenceAnswerLifecycleStatus.REVEALED,
            target_type=PracticeReferenceAnswerTargetType.FOLLOW_UP,
            generated_at=cutoff + timedelta(seconds=1),
        ),
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: FakePracticeSessionService(
            context=evaluation_context
        ),
        reference_answer_generation_service_factory=lambda *_args, **_kwargs: resolver,
    )

    asyncio.run(
        service._resolve_reference_answer_projection(
            user_id=evaluation_context.session.user_id,
            context=evaluation_context,
        )
    )
    assert resolver.follow_up_calls[-1]["submitted_at"] == cutoff

    review_value = review_context()
    review_value.evaluation_generation_run.created_at = cutoff
    review_value = replace(
        review_value,
        follow_up_decision=evaluation_context.follow_up_decision,
        follow_up_question=evaluation_context.follow_up_question,
        follow_up_completion_reason=(
            PracticeEvaluationFollowUpCompletionReason.ENDED_EARLY
        ),
    )
    resolver.follow_up_calls.clear()
    asyncio.run(
        service._resolve_reference_answer_projection(
            user_id=review_value.session.user_id,
            context=review_value,
        )
    )
    assert resolver.follow_up_calls[-1]["submitted_at"] == cutoff


def test_answering_follow_up_hydration_keeps_pending_submission_cutoff_none() -> None:
    context_value = primary_context(
        attempt_status="answeringFollowUp",
        version=4,
        action="askFollowUp",
    )
    resolver = FakeReferenceAnswerGenerationService(
        reference_answer_state(
            PracticeReferenceAnswerLifecycleStatus.GENERATING,
            target_type=PracticeReferenceAnswerTargetType.MAIN,
        ),
        follow_up_state=reference_answer_state(
            PracticeReferenceAnswerLifecycleStatus.GENERATING,
            target_type=PracticeReferenceAnswerTargetType.FOLLOW_UP,
        ),
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: FakePracticeSessionService(
            context=context_value
        ),
        reference_answer_generation_service_factory=lambda *_args, **_kwargs: resolver,
    )

    asyncio.run(
        service._resolve_reference_answer_projection(
            user_id=context_value.session.user_id,
            context=context_value,
        )
    )

    assert resolver.follow_up_calls[-1]["submitted_at"] is None


@pytest.mark.parametrize("exchange_count", [1, 2])
def test_evaluating_public_projection_preserves_all_answered_reason_and_order(
    exchange_count: int,
) -> None:
    domain = FakePracticeSessionService(
        context=context_with_answered_exchanges(
            attempt_status="evaluating",
            version=7,
            exchange_count=exchange_count,
        )
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    result = asyncio.run(
        service.refresh_evaluation(
            user_id=domain.context.session.user_id,
            session_id=domain.context.session.id,
            payload=RefreshPracticeEvaluationRequest(version=7),
        )
    )

    assert result.status == "evaluating"
    assert result.follow_up_completion.reason == "allAnswered"
    assert [item.question.order for item in result.follow_up_exchanges] == list(
        range(1, exchange_count + 1)
    )
    assert [item.answer.order for item in result.follow_up_exchanges] == [
        order + 1 for order in range(1, exchange_count + 1)
    ]


@pytest.mark.parametrize("exchange_count", [1, 2])
def test_review_public_projection_preserves_all_answered_reason_and_exchanges(
    exchange_count: int,
) -> None:
    primary = context_with_answered_exchanges(
        attempt_status="review",
        version=5,
        exchange_count=exchange_count,
    )
    domain = FakePracticeSessionService(
        context=replace(
            review_context(),
            follow_up_decision=primary.follow_up_decision,
            follow_up_exchanges=primary.follow_up_exchanges,
            follow_up_completion_reason=primary.follow_up_completion_reason,
        )
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    result = asyncio.run(
        service.refresh_evaluation(
            user_id=domain.context.session.user_id,
            session_id=domain.context.session.id,
            payload=RefreshPracticeEvaluationRequest(version=4),
        )
    )

    assert result.status == "review"
    assert result.follow_up_completion.reason == "allAnswered"
    assert len(result.follow_up_exchanges) == exchange_count


@pytest.mark.parametrize(
    ("attempt_status", "action", "expected_status", "expected_version"),
    [
        ("answering", None, "generatingFollowUp", 3),
        ("answeringFollowUp", "askFollowUp", "answeringFollowUp", 4),
        ("evaluating", "complete", "evaluating", 4),
    ],
)
def test_refresh_follow_up_generation_projects_each_public_state_without_config(
    attempt_status: str,
    action: str | None,
    expected_status: str,
    expected_version: int,
) -> None:
    domain = FakePracticeSessionService(
        context=primary_context(
            attempt_status=attempt_status,
            version=3 if attempt_status == "answering" else 4,
            action=action,
        )
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )
    context_value = domain.context

    result = asyncio.run(
        service.refresh_follow_up_generation(
            user_id=context_value.session.user_id,
            session_id=context_value.session.id,
            payload=RefreshPracticeFollowUpGenerationRequest(version=3),
        )
    )

    assert result.status == expected_status
    assert result.version == expected_version
    assert domain.calls[0] == (
        "refresh_follow_up",
        {
            "user_id": context_value.session.user_id,
            "session_id": context_value.session.id,
            "expected_version": 3,
        },
    )
    if expected_status == "answeringFollowUp":
        assert result.current_follow_up.answer is None
        assert result.follow_up_exchanges == []
    if expected_status == "evaluating":
        assert result.follow_up_completion.reason == "noFollowUpRequired"
        assert result.submitted_at == context_value.attempt.updated_at


def test_refresh_follow_up_generation_maps_failure_without_provider_details() -> None:
    domain = FakePracticeSessionService(
        context=primary_context(),
        error=PracticeSessionStateError(
            PRACTICE_FOLLOW_UP_GENERATION_FAILED,
            source_code="provider_raw_response",
        ),
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    with pytest.raises(APIError) as error:
        asyncio.run(
            service.refresh_follow_up_generation(
                user_id=uuid4(),
                session_id=uuid4(),
                payload=RefreshPracticeFollowUpGenerationRequest(version=3),
            )
        )

    assert error.value.status_code == 409
    assert error.value.error == PRACTICE_FOLLOW_UP_GENERATION_FAILED
    assert "provider_raw_response" not in str(error.value)


def test_follow_up_question_projection_hides_guidance_focus_and_lineage() -> None:
    domain = FakePracticeSessionService(
        context=primary_context(
            attempt_status="answeringFollowUp",
            version=4,
            action="askFollowUp",
        )
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    result = asyncio.run(
        service.get_session(
            user_id=domain.context.session.user_id,
            session_id=domain.context.session.id,
        )
    )
    serialized = result.model_dump(mode="json")
    follow_up_question = serialized["currentFollowUp"]["question"]

    assert follow_up_question["answerHints"]["content"] is None
    assert follow_up_question["answerFramework"]["content"] is None
    assert follow_up_question["referenceAnswer"]["viewedBeforeSubmission"] is False
    for field in ("focus", "sourceAgentRunId", "attemptId", "templateId"):
        assert field not in follow_up_question


@pytest.mark.parametrize(
    ("domain_error", "status_code", "error_code"),
    [
        (
            PracticeSessionStateError(PRACTICE_SESSION_NOT_FOUND),
            404,
            PRACTICE_SESSION_NOT_FOUND,
        ),
        (
            PracticeSessionStateError(
                PRACTICE_QUESTION_GENERATION_FAILED,
                source_code="provider_secret",
            ),
            409,
            PRACTICE_QUESTION_GENERATION_FAILED,
        ),
        (
            PracticeSessionStateError(
                PRACTICE_EVALUATION_STATE_UNAVAILABLE,
                source_code="missing_model",
            ),
            503,
            PRACTICE_EVALUATION_GENERATION_UNAVAILABLE,
        ),
    ],
)
def test_domain_errors_map_to_safe_api_errors(
    domain_error: PracticeSessionStateError,
    status_code: int,
    error_code: str,
) -> None:
    domain = FakePracticeSessionService(
        context=context(answering=False),
        error=domain_error,
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    with pytest.raises(APIError) as error:
        asyncio.run(service.get_session(user_id=uuid4(), session_id=uuid4()))

    assert error.value.status_code == status_code
    assert error.value.error == error_code
    assert "provider_secret" not in str(error.value)


def test_question_projection_hides_db_guidance_and_internal_lineage() -> None:
    domain = FakePracticeSessionService(context=context(answering=True))
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    result = asyncio.run(service.get_session(user_id=uuid4(), session_id=uuid4()))
    serialized = result.model_dump(mode="json")
    question = serialized["question"]

    assert question["answerHints"]["content"] is None
    assert question["answerFramework"]["content"] is None
    assert question["referenceAnswer"]["viewedBeforeSubmission"] is False
    for field in (
        "sourceAgentRunId",
        "matchingAnalysisRunId",
        "profileVersion",
        "jobDescriptionVersion",
        "jobDescriptionAnalysisVersion",
        "followUpDirections",
        "scoringFocus",
        "templateId",
    ):
        assert field not in question


def test_current_session_returns_null_without_llm_configuration() -> None:
    domain = FakePracticeSessionService(context=context(answering=False))
    domain.current_context = None
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )
    user_id = uuid4()

    result = asyncio.run(service.get_current_session(user_id=user_id))

    assert isinstance(result, CurrentPracticeSessionResponse)
    assert result.session is None
    assert domain.calls == [("current", {"user_id": user_id})]


def test_current_session_maps_domain_state_errors_to_409() -> None:
    domain = FakePracticeSessionService(
        context=context(answering=False),
        error=PracticeSessionStateError(PRACTICE_SESSION_STATE_CONFLICT),
    )
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    with pytest.raises(APIError) as error:
        asyncio.run(service.get_current_session(user_id=uuid4()))

    assert error.value.status_code == 409
    assert error.value.error == PRACTICE_SESSION_STATE_CONFLICT


@pytest.mark.parametrize("answering", [False, True])
def test_current_session_wraps_active_context(answering: bool) -> None:
    domain = FakePracticeSessionService(context=context(answering=answering))
    service = PracticeAPIService(
        object(),
        practice_service_factory=lambda *_args, **_kwargs: domain,
    )

    result = asyncio.run(service.get_current_session(user_id=uuid4()))

    assert result.session is not None
    assert result.session.status == (
        "answering" if answering else "generatingQuestion"
    )
    if answering:
        assert result.session.question.answer_hints.content is None
        assert result.session.question.reference_answer.status == "notRequested"


def test_completed_projection_deduplicates_retry_and_uses_final_artifacts() -> None:
    first = review_context(action="retryCurrent")
    second = review_context(action="nextQuestion")
    second.attempt.user_id = first.attempt.user_id
    second.attempt.session_id = first.attempt.session_id
    second.attempt.attempt_number = 2
    second.attempt.retry_of_attempt_id = first.attempt.id
    second.attempt.question_card_id = first.question_card.id
    second.attempt.status = "completed"
    second = replace(
        second,
        session=first.session,
        question_card=first.question_card,
    )
    first.session.status = "completed"
    first.session.completion_reason = "reviewCompleted"
    first.session.completed_at = first.session.updated_at
    first.session.version = 6
    first.attempt.status = "completed"
    first.question_card.is_saved = True
    first.question_card.is_marked_weak = True
    first.evaluation.overall_score = 60
    second.evaluation.overall_score = 80
    second.recommendation.reason = "Use stronger measured evidence next time."

    context = PracticeCompletedSessionWorkflowContext(
        session=first.session,
        final_attempt=second.attempt,
        final_review_context=second,
        attempt_review_contexts=(first, second),
    )

    result = build_practice_completed_session_response(context)

    assert result.questions_completed == 1
    assert result.retry_count == 1
    assert result.saved_question_count == 1
    assert result.marked_weak_question_count == 1
    assert result.final_attempt_average_score == 80
    assert result.attempt_id == second.attempt.id
    assert result.attempt_number == 2
    assert result.next_step_suggestion == "Use stronger measured evidence next time."
    assert "retryOfAttemptId" not in result.model_dump(mode="json")
