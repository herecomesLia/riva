import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import status
import pytest

from riva.core.errors import APIError
from riva.models import AgentRun, AgentRunStatus, QuestionCard, User
from riva.prompts import QUESTION_GENERATION_PROMPT
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
    StartQuestionGenerationRequest,
)
from riva.schemas.question_generation import QuestionGenerationRunPayload
from riva.services.question_cards import (
    QUESTION_GENERATION_FAILURE_REASON,
    QUESTION_GENERATION_STATE_CONFLICT,
    QUESTION_GENERATION_UNAVAILABLE,
    QuestionCardService,
)
from riva.services.question_generation import QuestionGenerationStateError


NOW = datetime(2026, 8, 10, 10, 0, tzinfo=UTC)


class ScriptedSession:
    def __init__(self, *scalar_values: object) -> None:
        self.scalar_values = list(scalar_values)
        self.commit_count = 0
        self.rollback_count = 0

    async def scalar(self, statement: Any) -> object:
        del statement
        if not self.scalar_values:
            raise AssertionError("unexpected scalar query")
        return self.scalar_values.pop(0)

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

    async def enqueue_generation(self, **kwargs: object) -> AgentRun:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        assert self.run is not None
        return self.run


def user() -> User:
    return User(
        id=uuid4(),
        username="question-card-api",
        normalized_username="question-card-api",
        password_hash="hash",
        display_name="Question Card API",
    )


def payload() -> QuestionGenerationRunPayload:
    return QuestionGenerationRunPayload(
        role_id=uuid4(),
        profile_id=uuid4(),
        profile_version=3,
        job_description_version=2,
        job_description_analysis_version=4,
        matching_analysis_run_id=uuid4(),
        interaction_language="en",
        question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
        difficulty=QuestionCardDifficulty.BASIC,
    )


def run_for(
    user_id: UUID,
    run_payload: QuestionGenerationRunPayload,
    *,
    state: AgentRunStatus = AgentRunStatus.QUEUED,
) -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="question-generator",
        prompt_id=QUESTION_GENERATION_PROMPT.prompt_id,
        prompt_version=QUESTION_GENERATION_PROMPT.version,
        output_schema_id=QUESTION_GENERATION_PROMPT.output_schema_id,
        status=state,
        payload=run_payload.model_dump(mode="json", by_alias=True),
        idempotency_key="question-generation:request",
        attempt_count=0 if state is AgentRunStatus.QUEUED else 1,
        max_attempts=3,
        available_at=NOW,
        created_at=NOW,
        started_at=None if state is AgentRunStatus.QUEUED else NOW,
        finished_at=NOW if state in {AgentRunStatus.SUCCEEDED, AgentRunStatus.FAILED} else None,
        provider="fake" if state is AgentRunStatus.SUCCEEDED else None,
        model="test-model",
        input_tokens=1 if state is AgentRunStatus.SUCCEEDED else None,
        output_tokens=1 if state is AgentRunStatus.SUCCEEDED else None,
        result={"prompt": "persisted"} if state is AgentRunStatus.SUCCEEDED else None,
        error_code="provider_unavailable" if state is AgentRunStatus.FAILED else None,
    )


def card_for(run: AgentRun, run_payload: QuestionGenerationRunPayload) -> QuestionCard:
    return QuestionCard(
        id=uuid4(),
        user_id=run.user_id,
        target_role_id=run_payload.role_id,
        profile_id=run_payload.profile_id,
        source_agent_run_id=run.id,
        matching_analysis_run_id=run_payload.matching_analysis_run_id,
        language=run_payload.interaction_language,
        question_type=run_payload.question_type.value,
        difficulty=run_payload.difficulty.value,
        prompt="Persisted question",
        assessed_capabilities=["Ownership"],
        recommended_materials=[],
        answer_hints=["Explain the context."],
        answer_framework=["Context", "Action", "Result"],
        follow_up_directions=["Technical rationale"],
        scoring_focus=["Evidence"],
        profile_version=run_payload.profile_version,
        job_description_version=run_payload.job_description_version,
        job_description_analysis_version=run_payload.job_description_analysis_version,
        is_saved=False,
        is_marked_weak=False,
        created_at=NOW,
        updated_at=NOW,
    )


def service(
    session: ScriptedSession,
    fake_generation: FakeGenerationService,
    *,
    provider: str | None = "qwen",
    model: str | None = "test-model",
) -> QuestionCardService:
    return QuestionCardService(
        session,  # type: ignore[arg-type]
        llm_provider=provider,
        llm_model=model,
        generation_service_factory=lambda _session, **kwargs: fake_generation,  # type: ignore[arg-type]
    )


def start_payload(run_payload: QuestionGenerationRunPayload) -> StartQuestionGenerationRequest:
    return StartQuestionGenerationRequest(
        request_id=uuid4(),
        target_role_id=run_payload.role_id,
        question_type=run_payload.question_type,
        difficulty=run_payload.difficulty,
    )


def test_start_generation_uses_frozen_language_and_request_idempotency_key() -> None:
    owner = user()
    run_payload = payload()
    run = run_for(owner.id, run_payload)
    fake_generation = FakeGenerationService(run)
    session = ScriptedSession(None)
    request = start_payload(run_payload)

    response = asyncio.run(
        service(session, fake_generation).start_generation(
            owner,
            request,
            interaction_language="en",
        )
    )

    assert response.status == "queued"
    assert response.language == "en"
    assert response.question_type is run_payload.question_type
    assert response.difficulty is run_payload.difficulty
    assert fake_generation.calls[0]["interaction_language"] == "en"
    assert fake_generation.calls[0]["idempotency_key"] == (
        f"question-generation:{request.request_id}"
    )
    assert fake_generation.calls[0]["target_role_id"] == request.target_role_id
    assert session.rollback_count == 0


def test_duplicate_request_id_returns_existing_state_before_configuration_check() -> None:
    owner = user()
    run_payload = payload()
    existing = run_for(owner.id, run_payload, state=AgentRunStatus.FAILED)
    fake_generation = FakeGenerationService()
    session = ScriptedSession(existing)

    response = asyncio.run(
        service(
            session,
            fake_generation,
            provider=None,
            model=None,
        ).start_generation(
            owner,
            start_payload(run_payload),
            interaction_language="zh-CN",
        )
    )

    assert response.status == "failed"
    assert response.failure_reason == QUESTION_GENERATION_FAILURE_REASON
    assert fake_generation.calls == []


def test_unavailable_llm_is_mapped_to_503_before_enqueue() -> None:
    owner = user()
    fake_generation = FakeGenerationService()
    session = ScriptedSession(None)

    with pytest.raises(APIError) as error:
        asyncio.run(
            service(
                session,
                fake_generation,
                provider="openai",
                model="test-model",
            ).start_generation(
                owner,
                start_payload(payload()),
                interaction_language="zh-CN",
            )
        )

    assert error.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert error.value.error == QUESTION_GENERATION_UNAVAILABLE
    assert fake_generation.calls == []


@pytest.mark.parametrize(
    ("error_code", "status_code"),
    [
        ("question_generation_target_not_found", 404),
        ("question_generation_target_archived", 409),
        ("question_generation_profile_incomplete", 409),
        ("question_generation_matching_analysis_stale", 409),
    ],
)
def test_start_generation_maps_state_errors(
    error_code: str,
    status_code: int,
) -> None:
    owner = user()
    fake_generation = FakeGenerationService(
        error=QuestionGenerationStateError(error_code)  # type: ignore[arg-type]
    )
    session = ScriptedSession(None)

    with pytest.raises(APIError) as error:
        asyncio.run(
            service(session, fake_generation).start_generation(
                owner,
                start_payload(payload()),
                interaction_language="zh-CN",
            )
        )

    assert error.value.status_code == status_code
    assert error.value.error == error_code


@pytest.mark.parametrize(
    "state",
    [
        AgentRunStatus.QUEUED,
        AgentRunStatus.RUNNING,
        AgentRunStatus.FAILED,
    ],
)
def test_status_response_maps_non_succeeded_states_without_artifact(
    state: AgentRunStatus,
) -> None:
    owner = user()
    run_payload = payload()
    run = run_for(owner.id, run_payload, state=state)
    session = ScriptedSession(run)

    response = asyncio.run(
        service(session, FakeGenerationService()).get_generation_status(
            user_id=owner.id,
            run_id=run.id,
        )
    )

    assert response.status == state.value
    assert response.question_card is None
    if state is AgentRunStatus.FAILED:
        assert response.error_code == "provider_unavailable"
        assert response.failure_reason == QUESTION_GENERATION_FAILURE_REASON
    else:
        assert response.error_code is None
        assert response.failure_reason is None


def test_status_succeeded_requires_and_projects_owned_card() -> None:
    owner = user()
    run_payload = payload()
    run = run_for(owner.id, run_payload, state=AgentRunStatus.SUCCEEDED)
    card = card_for(run, run_payload)
    session = ScriptedSession(run, card)

    response = asyncio.run(
        service(session, FakeGenerationService()).get_generation_status(
            user_id=owner.id,
            run_id=run.id,
        )
    )

    assert response.status == "succeeded"
    assert response.question_card is not None
    assert response.question_card.id == card.id
    assert response.question_card.prompt == card.prompt


def test_status_succeeded_without_card_is_state_conflict() -> None:
    owner = user()
    run_payload = payload()
    run = run_for(owner.id, run_payload, state=AgentRunStatus.SUCCEEDED)
    session = ScriptedSession(run, None)

    with pytest.raises(APIError) as error:
        asyncio.run(
            service(session, FakeGenerationService()).get_generation_status(
                user_id=owner.id,
                run_id=run.id,
            )
        )

    assert error.value.status_code == status.HTTP_409_CONFLICT
    assert error.value.error == QUESTION_GENERATION_STATE_CONFLICT


def test_status_hides_other_users_and_other_agents() -> None:
    owner = user()
    run_payload = payload()
    other_user_run = run_for(uuid4(), run_payload)
    other_agent_run = run_for(owner.id, run_payload)
    other_agent_run.agent_id = "resume-parser"

    for scalar_value in (None, other_agent_run):
        session = ScriptedSession(scalar_value)
        with pytest.raises(APIError) as error:
            asyncio.run(
                service(session, FakeGenerationService()).get_generation_status(
                    user_id=owner.id,
                    run_id=(
                        other_user_run.id
                        if scalar_value is None
                        else other_agent_run.id
                    ),
                )
            )
        assert error.value.status_code == status.HTTP_404_NOT_FOUND
        assert error.value.error == "question_generation_not_found"


def test_get_question_card_enforces_ownership_and_public_projection() -> None:
    owner = user()
    run_payload = payload()
    run = run_for(owner.id, run_payload, state=AgentRunStatus.SUCCEEDED)
    card = card_for(run, run_payload)
    session = ScriptedSession(card)

    response = asyncio.run(
        service(session, FakeGenerationService()).get_question_card(
            user_id=owner.id,
            question_card_id=card.id,
        )
    )

    dumped = response.model_dump(mode="json")
    assert dumped["id"] == str(card.id)
    assert "sourceAgentRunId" not in dumped
    assert "matchingAnalysisRunId" not in dumped
    assert "followUpDirections" not in dumped
    assert "scoringFocus" not in dumped
