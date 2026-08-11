import asyncio
from uuid import uuid4

import pytest

from riva.core.errors import APIError
from riva.models import AgentRunStatus
from riva.services.practice_api import (
    PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
    PracticeAPIService,
)
from riva.services.practice_sessions import (
    PRACTICE_QUESTION_GENERATION_FAILED,
    PRACTICE_SESSION_NOT_FOUND,
    PRACTICE_SESSION_STATE_CONFLICT,
    PracticeSessionStateError,
    PracticeSessionWorkflowContext,
)
from riva.schemas.practice_sessions import (
    CurrentPracticeSessionResponse,
    RefreshPracticeQuestionGenerationRequest,
    StartPracticeSessionRequest,
)
from tests.unit.services.test_practice_sessions import (
    generation_payload,
    generation_run,
    practice_attempt,
    practice_session,
    question_card,
    selection,
)


class FakePracticeSessionService:
    def __init__(
        self,
        *,
        context: PracticeSessionWorkflowContext,
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
