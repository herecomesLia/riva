from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from riva.models import (
    PracticeAnswer,
    PracticeAttempt,
    PracticeFollowUpQuestion,
    PracticeSession,
)
from riva.schemas.practice_reference_answer import (
    PracticeFollowUpReferenceAnswerOutput,
    PracticeMainReferenceAnswerOutput,
    PracticeReferenceAnswerTargetType,
)
from riva.schemas.training_records import (
    TargetedPracticeFollowUpReferenceAnswerRequest,
    TargetedPracticeMainReferenceAnswerRequest,
)
from riva.services.reference_answer_generation import (
    PracticeReferenceAnswerLifecycleStatus,
    PracticeReferenceAnswerWorkflowState,
)
from riva.services.training_record_reference_answers import (
    REFERENCE_ANSWER_GENERATION_UNAVAILABLE,
    TRAINING_RECORD_FOLLOW_UP_NOT_FOUND,
    TRAINING_RECORD_NOT_FOUND,
    TRAINING_RECORD_QUESTION_NOT_FOUND,
    TrainingRecordReferenceAnswerService,
    TrainingRecordReferenceAnswerStateError,
)


NOW = datetime(2026, 8, 16, 8, 0, tzinfo=UTC)


class FakeSession:
    def __init__(self, *values: object) -> None:
        self.values = list(values)
        self.statements: list[object] = []
        self.commit_count = 0
        self.rollback_count = 0

    async def scalar(self, statement: object) -> object:
        self.statements.append(statement)
        if not self.values:
            raise AssertionError("unexpected database scalar")
        return self.values.pop(0)

    async def commit(self) -> None:
        self.commit_count += 1

    async def rollback(self) -> None:
        self.rollback_count += 1


class FakeReferenceAnswerGenerationService:
    def __init__(
        self,
        state: PracticeReferenceAnswerWorkflowState,
        *,
        after_enqueue: PracticeReferenceAnswerWorkflowState | None = None,
    ) -> None:
        self.main_state = state
        self.follow_up_state = state
        self.after_enqueue = after_enqueue or state
        self.main_calls: list[dict[str, object]] = []
        self.follow_up_calls: list[dict[str, object]] = []
        self.main_enqueue_calls: list[dict[str, object]] = []
        self.follow_up_enqueue_calls: list[dict[str, object]] = []

    async def get_main_generation_state(self, **kwargs: object):
        self.main_calls.append(kwargs)
        return self.main_state

    async def get_follow_up_generation_state(self, **kwargs: object):
        self.follow_up_calls.append(kwargs)
        return self.follow_up_state

    async def enqueue_main_generation_in_transaction(self, **kwargs: object):
        self.main_enqueue_calls.append(kwargs)
        self.main_state = self.after_enqueue
        return object()

    async def enqueue_follow_up_generation_in_transaction(self, **kwargs: object):
        self.follow_up_enqueue_calls.append(kwargs)
        self.follow_up_state = self.after_enqueue
        return object()


def state(
    status: PracticeReferenceAnswerLifecycleStatus,
    *,
    target_type: PracticeReferenceAnswerTargetType = PracticeReferenceAnswerTargetType.MAIN,
) -> PracticeReferenceAnswerWorkflowState:
    output = None
    if status is PracticeReferenceAnswerLifecycleStatus.REVEALED:
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
                addressedGap="The answer needs measurable attribution.",
                answer="Connect the answer to evidence.",
                keyPoints=["Name the baseline.", "Connect the result."],
                commonMistakes=["Claiming unsupported impact."],
            )
        )
    return PracticeReferenceAnswerWorkflowState(
        status=status,
        generation_run=(
            object()
            if status is not PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED
            else None
        ),
        artifact=(
            SimpleNamespace(generated_at=NOW)
            if status is PracticeReferenceAnswerLifecycleStatus.REVEALED
            else None
        ),
        output=output,
        viewed_before_submission=(
            status is PracticeReferenceAnswerLifecycleStatus.REVEALED
        ),
    )


def record_and_attempt(
    *,
    user_id: UUID,
    record_id: UUID,
    attempt_id: UUID,
    card_id: UUID,
) -> tuple[PracticeSession, PracticeAttempt]:
    record = PracticeSession(
        id=record_id,
        user_id=user_id,
        target_role_id=uuid4(),
        language="en",
        initial_question_type="behavioral",
        initial_difficulty="basic",
        source="personalized",
        status="completed",
        completed_at=NOW,
        completion_reason="reviewCompleted",
    )
    attempt = PracticeAttempt(
        id=attempt_id,
        user_id=user_id,
        session_id=record_id,
        attempt_number=1,
        question_type="behavioral",
        difficulty="basic",
        status="completed",
        question_card_id=card_id,
    )
    return record, attempt


def service_for(
    session: FakeSession,
    generation: FakeReferenceAnswerGenerationService,
) -> TrainingRecordReferenceAnswerService:
    return TrainingRecordReferenceAnswerService(
        session,  # type: ignore[arg-type]
        llm_provider="qwen",
        llm_model="reference-model",
        reference_answer_generation_service_factory=lambda _session, **_kwargs: generation,  # type: ignore[arg-type]
    )


def test_main_request_enqueues_once_and_preserves_submitted_at() -> None:
    user_id, record_id, attempt_id, card_id = uuid4(), uuid4(), uuid4(), uuid4()
    record, attempt = record_and_attempt(
        user_id=user_id,
        record_id=record_id,
        attempt_id=attempt_id,
        card_id=card_id,
    )
    answer = PracticeAnswer(
        id=uuid4(),
        attempt_id=attempt_id,
        kind="main",
        order=1,
        content="The submitted answer.",
        submitted_at=NOW,
    )
    generation = FakeReferenceAnswerGenerationService(
        state(PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED),
        after_enqueue=state(PracticeReferenceAnswerLifecycleStatus.GENERATING),
    )
    session = FakeSession(record, attempt, answer)

    result = asyncio.run(
        service_for(session, generation).request_reference_answer(
            user_id=user_id,
            record_id=record_id,
            payload=TargetedPracticeMainReferenceAnswerRequest(
                subject="mainQuestion",
                question_id=attempt_id,
            ),
        )
    )

    assert result.target.question_id == attempt_id
    assert result.reference_answer.status == "generating"
    assert len(generation.main_enqueue_calls) == 1
    assert generation.main_enqueue_calls[0]["question_card_id"] == card_id
    assert generation.main_calls[0]["question_card_id"] == card_id
    assert generation.main_calls[0]["submitted_at"] == NOW
    assert session.commit_count == 1
    assert session.rollback_count == 0


def test_follow_up_request_uses_attempt_scoped_follow_up_and_answer() -> None:
    user_id, record_id, attempt_id, card_id, follow_up_id = (
        uuid4(),
        uuid4(),
        uuid4(),
        uuid4(),
        uuid4(),
    )
    record, attempt = record_and_attempt(
        user_id=user_id,
        record_id=record_id,
        attempt_id=attempt_id,
        card_id=card_id,
    )
    question = PracticeFollowUpQuestion(
        id=follow_up_id,
        attempt_id=attempt_id,
        source_agent_run_id=uuid4(),
        order=1,
        prompt="What evidence supports that?",
        focus="Evidence",
        answer_hints=["Name the metric."],
        answer_framework=["Baseline", "Result"],
    )
    answer = PracticeAnswer(
        id=uuid4(),
        attempt_id=attempt_id,
        kind="followUp",
        order=2,
        content="The follow-up answer.",
        follow_up_question_id=follow_up_id,
        submitted_at=NOW,
    )
    generation = FakeReferenceAnswerGenerationService(
        state(PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED),
        after_enqueue=state(
            PracticeReferenceAnswerLifecycleStatus.GENERATING,
            target_type=PracticeReferenceAnswerTargetType.FOLLOW_UP,
        ),
    )
    session = FakeSession(record, attempt, question, answer)

    result = asyncio.run(
        service_for(session, generation).request_reference_answer(
            user_id=user_id,
            record_id=record_id,
            payload=TargetedPracticeFollowUpReferenceAnswerRequest(
                subject="followUp",
                question_id=attempt_id,
                follow_up_id=follow_up_id,
            ),
        )
    )

    assert result.target.question_id == attempt_id
    assert result.target.follow_up_id == follow_up_id
    assert result.reference_answer.status == "generating"
    assert generation.follow_up_enqueue_calls[0]["question_card_id"] == card_id
    assert (
        generation.follow_up_enqueue_calls[0]["follow_up_question_id"]
        == follow_up_id
    )
    assert generation.follow_up_calls[0]["submitted_at"] == NOW


@pytest.mark.parametrize(
    "status",
    [
        PracticeReferenceAnswerLifecycleStatus.GENERATING,
        PracticeReferenceAnswerLifecycleStatus.REVEALED,
        PracticeReferenceAnswerLifecycleStatus.UNAVAILABLE,
    ],
)
def test_request_reuses_existing_state_without_enqueue(
    status: PracticeReferenceAnswerLifecycleStatus,
) -> None:
    user_id, record_id, attempt_id, card_id = uuid4(), uuid4(), uuid4(), uuid4()
    record, attempt = record_and_attempt(
        user_id=user_id,
        record_id=record_id,
        attempt_id=attempt_id,
        card_id=card_id,
    )
    generation = FakeReferenceAnswerGenerationService(state(status))
    session = FakeSession(record, attempt, None)

    result = asyncio.run(
        service_for(session, generation).request_reference_answer(
            user_id=user_id,
            record_id=record_id,
            payload=TargetedPracticeMainReferenceAnswerRequest(
                subject="mainQuestion",
                question_id=attempt_id,
            ),
        )
    )

    assert result.reference_answer.status == status.value
    assert generation.main_enqueue_calls == []


def test_refresh_only_reads_state_and_never_enqueues() -> None:
    user_id, record_id, attempt_id, card_id = uuid4(), uuid4(), uuid4(), uuid4()
    record, attempt = record_and_attempt(
        user_id=user_id,
        record_id=record_id,
        attempt_id=attempt_id,
        card_id=card_id,
    )
    generation = FakeReferenceAnswerGenerationService(
        state(PracticeReferenceAnswerLifecycleStatus.GENERATING)
    )
    session = FakeSession(record, attempt, None)

    result = asyncio.run(
        service_for(session, generation).refresh_reference_answer(
            user_id=user_id,
            record_id=record_id,
            payload=TargetedPracticeMainReferenceAnswerRequest(
                subject="mainQuestion",
                question_id=attempt_id,
            ),
        )
    )

    assert result.reference_answer.status == "generating"
    assert generation.main_enqueue_calls == []
    assert session.commit_count == 1


@pytest.mark.parametrize(
    ("record_value", "attempt_value", "expected"),
    [
        (None, None, TRAINING_RECORD_NOT_FOUND),
        (
            SimpleNamespace(
                status="active",
                completed_at=None,
                completion_reason=None,
            ),
            None,
            TRAINING_RECORD_NOT_FOUND,
        ),
        (
            SimpleNamespace(
                id=uuid4(),
                user_id=uuid4(),
                status="completed",
                completed_at=NOW,
                completion_reason="reviewCompleted",
            ),
            None,
            TRAINING_RECORD_NOT_FOUND,
        ),
        (
            SimpleNamespace(
                id=uuid4(),
                status="completed",
                completed_at=NOW,
                completion_reason="reviewCompleted",
            ),
            None,
            TRAINING_RECORD_QUESTION_NOT_FOUND,
        ),
    ],
)
def test_invalid_record_or_attempt_does_not_enqueue(
    record_value: object,
    attempt_value: object,
    expected: str,
) -> None:
    user_id, record_id, attempt_id = uuid4(), uuid4(), uuid4()
    if isinstance(record_value, SimpleNamespace):
        if not hasattr(record_value, "user_id"):
            record_value.user_id = user_id
        if expected == TRAINING_RECORD_QUESTION_NOT_FOUND:
            record_value.id = record_id
    session = FakeSession(record_value, attempt_value)
    generation = FakeReferenceAnswerGenerationService(
        state(PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED)
    )

    with pytest.raises(TrainingRecordReferenceAnswerStateError) as error:
        asyncio.run(
            service_for(session, generation).request_reference_answer(
                user_id=user_id,
                record_id=record_id,
                payload=TargetedPracticeMainReferenceAnswerRequest(
                    subject="mainQuestion",
                    question_id=attempt_id,
                ),
            )
        )

    assert error.value.code == expected
    assert generation.main_enqueue_calls == []
    assert session.rollback_count == 1


def test_wrong_follow_up_is_not_found_without_cross_attempt_access() -> None:
    user_id, record_id, attempt_id, card_id = uuid4(), uuid4(), uuid4(), uuid4()
    record, attempt = record_and_attempt(
        user_id=user_id,
        record_id=record_id,
        attempt_id=attempt_id,
        card_id=card_id,
    )
    generation = FakeReferenceAnswerGenerationService(
        state(PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED)
    )
    session = FakeSession(record, attempt, None)

    with pytest.raises(TrainingRecordReferenceAnswerStateError) as error:
        asyncio.run(
            service_for(session, generation).request_reference_answer(
                user_id=user_id,
                record_id=record_id,
                payload=TargetedPracticeFollowUpReferenceAnswerRequest(
                    subject="followUp",
                    question_id=attempt_id,
                    follow_up_id=uuid4(),
                ),
            )
        )

    assert error.value.code == TRAINING_RECORD_FOLLOW_UP_NOT_FOUND


def test_missing_llm_configuration_does_not_enqueue_new_generation() -> None:
    user_id, record_id, attempt_id, card_id = uuid4(), uuid4(), uuid4(), uuid4()
    record, attempt = record_and_attempt(
        user_id=user_id,
        record_id=record_id,
        attempt_id=attempt_id,
        card_id=card_id,
    )
    generation = FakeReferenceAnswerGenerationService(
        state(PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED)
    )
    session = FakeSession(record, attempt, None)
    service = TrainingRecordReferenceAnswerService(
        session,  # type: ignore[arg-type]
        llm_provider="openai",
        llm_model="model",
        reference_answer_generation_service_factory=lambda _session, **_kwargs: generation,  # type: ignore[arg-type]
    )

    with pytest.raises(TrainingRecordReferenceAnswerStateError) as error:
        asyncio.run(
            service.request_reference_answer(
                user_id=user_id,
                record_id=record_id,
                payload=TargetedPracticeMainReferenceAnswerRequest(
                    subject="mainQuestion",
                    question_id=attempt_id,
                ),
            )
        )

    assert error.value.code == REFERENCE_ANSWER_GENERATION_UNAVAILABLE
    assert generation.main_enqueue_calls == []
