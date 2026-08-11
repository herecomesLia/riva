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
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeSession,
    QuestionCard,
)
from riva.prompts import FOLLOW_UP_PROMPT, QUESTION_GENERATION_PROMPT
from riva.schemas.follow_up import FollowUpRunPayload
from riva.schemas.practice_interactions import PracticeAnswerKind
from riva.schemas.practice_sessions import PracticeSessionSelection
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.schemas.question_generation import QuestionGenerationRunPayload
from riva.services.practice_sessions import (
    PRACTICE_FOLLOW_UP_GENERATION_FAILED,
    PRACTICE_FOLLOW_UP_GENERATION_STATE_CONFLICT,
    PRACTICE_QUESTION_GENERATION_FAILED,
    PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED,
    PRACTICE_QUESTION_GENERATION_STATE_CONFLICT,
    PRACTICE_SESSION_ALREADY_ACTIVE,
    PRACTICE_SESSION_NOT_FOUND,
    PRACTICE_SESSION_SOURCE_UNAVAILABLE,
    PRACTICE_SESSION_STATE_CONFLICT,
    PRACTICE_SESSION_VERSION_CONFLICT,
    PRACTICE_WEAKNESS_PRIORITIZATION_UNAVAILABLE,
    PracticeSessionService,
    PracticeSessionStateError,
    practice_follow_up_idempotency_key,
)
from riva.services.follow_up_generation import FollowUpGenerationStateError
from riva.services.question_generation import QuestionGenerationStateError


NOW = datetime(2026, 8, 10, 10, 0, tzinfo=UTC)


class ScriptedSession:
    def __init__(self, *scalar_values: object) -> None:
        self.scalar_values = list(scalar_values)
        self.statements: list[Any] = []
        self.added: list[object] = []
        self.commit_count = 0
        self.flush_count = 0
        self.rollback_count = 0

    async def scalar(self, statement: Any) -> object:
        self.statements.append(statement)
        if not self.scalar_values:
            raise AssertionError("unexpected scalar query")
        return self.scalar_values.pop(0)

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
    previous_question_id: UUID | None = None,
    previous_answer_id: UUID | None = None,
) -> AgentRun:
    payload = FollowUpRunPayload(
        attempt_id=attempt_id,
        question_card_id=question_card_id,
        main_answer_id=main_answer_id,
        interaction_language="en",
        next_follow_up_order=1,
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
        idempotency_key=practice_follow_up_idempotency_key(attempt_id, 1),
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
) -> PracticeFollowUpDecision:
    return PracticeFollowUpDecision(
        id=uuid4(),
        attempt_id=attempt_id,
        source_agent_run_id=run_id,
        order=1,
        action=action,
        follow_up_question_id=question_id,
        created_at=NOW,
    )


def follow_up_question(
    *,
    attempt_id: UUID,
    run_id: UUID,
    question_id: UUID | None = None,
) -> PracticeFollowUpQuestion:
    return PracticeFollowUpQuestion(
        id=question_id or uuid4(),
        attempt_id=attempt_id,
        source_agent_run_id=run_id,
        order=1,
        prompt="What metric changed?",
        focus="Evidence",
        answer_hints=["Name the metric."],
        answer_framework=["Baseline", "Result"],
        created_at=NOW,
    )


def service(
    session: ScriptedSession,
    fake_generation: FakeGenerationService | None = None,
    fake_follow_up: FakeFollowUpGenerationService | None = None,
) -> PracticeSessionService:
    fake_generation = fake_generation or FakeGenerationService()
    fake_follow_up = fake_follow_up or FakeFollowUpGenerationService()
    return PracticeSessionService(
        session,  # type: ignore[arg-type]
        llm_model="test-model",
        question_generation_service_factory=lambda _session, **kwargs: fake_generation,  # type: ignore[arg-type]
        follow_up_generation_service_factory=lambda _session, **kwargs: fake_follow_up,  # type: ignore[arg-type]
        clock=lambda: NOW,
    )


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
    scripted = ScriptedSession(active, attempt, run, card)

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
    scripted = ScriptedSession(active, attempt)

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
    scripted = ScriptedSession(active, attempt, run, card)

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

    result = asyncio.run(
        service(scripted).refresh_follow_up_generation(
            user_id=active.user_id,
            session_id=active.id,
            expected_version=3,
        )
    )

    assert result.follow_up_decision is decision
    assert result.follow_up_question is question
    assert result.attempt.status == "answeringFollowUp"
    assert result.session.version == 4
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
    scripted = ScriptedSession(active, attempt)

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
