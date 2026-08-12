import asyncio
from uuid import uuid4

import pytest

from riva.core.errors import APIError
from riva.models import AgentRunStatus
from riva.services.practice_api import (
    PRACTICE_EVALUATION_GENERATION_UNAVAILABLE,
    PRACTICE_FOLLOW_UP_GENERATION_UNAVAILABLE,
    PRACTICE_RECOMMENDATION_GENERATION_UNAVAILABLE,
    PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
    PRACTICE_REVIEW_GENERATION_UNAVAILABLE,
    PracticeAPIService,
)
from riva.services.practice_sessions import (
    PRACTICE_EVALUATION_GENERATION_UNAVAILABLE as PRACTICE_EVALUATION_STATE_UNAVAILABLE,
    PRACTICE_EVALUATION_GENERATION_FAILED,
    PRACTICE_FOLLOW_UP_GENERATION_FAILED,
    PRACTICE_RECOMMENDATION_GENERATION_FAILED,
    PRACTICE_QUESTION_GENERATION_FAILED,
    PRACTICE_REVIEW_GENERATION_FAILED,
    PRACTICE_SESSION_NOT_FOUND,
    PRACTICE_SESSION_STATE_CONFLICT,
    PracticePrimaryAnswerWorkflowContext,
    PracticeReviewWorkflowContext,
    PracticeSessionStateError,
    PracticeSessionWorkflowContext,
)
from riva.schemas.practice_sessions import (
    CurrentPracticeSessionResponse,
    RefreshPracticeEvaluationRequest,
    RefreshPracticeFollowUpGenerationRequest,
    RefreshPracticeQuestionGenerationRequest,
    StartPracticeSessionRequest,
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

    async def submit_primary_answer(
        self,
        **kwargs: object,
    ) -> PracticePrimaryAnswerWorkflowContext:
        self.calls.append(("submit", kwargs))
        if self.error is not None:
            raise self.error
        assert isinstance(self.context, PracticePrimaryAnswerWorkflowContext)
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
        evaluation_generation_run=evaluation_run_value,
        evaluation=evaluation,
        review_generation_run=review_run_value,
        review=review,
        recommendation_generation_run=recommendation_run_value,
        recommendation=recommendation,
    )


def start_request() -> StartPracticeSessionRequest:
    return StartPracticeSessionRequest.model_validate(
        selection(target_role_id=uuid4()).model_dump(mode="json")
    )


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
