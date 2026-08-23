import asyncio
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import uuid4

import pytest

from riva.agents.follow_up import FollowUpAgent
from riva.agents.practice_reference_answer import PracticeReferenceAnswerAgent
from riva.models import (
    AgentRun,
    AgentRunStatus,
    PracticeAnswer,
    PracticeAttempt,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeQuestionReferenceContext,
    PracticeReferenceAnswerArtifact,
    QuestionCard,
)
from riva.schemas.follow_up import FollowUpRunPayload
from riva.schemas.practice_reference_answer import (
    PracticeFollowUpReferenceAnswerOutput,
    PracticeFollowUpReferenceAnswerRunPayload,
    PracticeMainReferenceAnswerOutput,
    PracticeMainReferenceAnswerRunPayload,
    PracticeReferenceFrozenContext,
)
from riva.services.reference_answer_generation import (
    INVALID_REFERENCE_ANSWER_GENERATION_RUN,
    REFERENCE_ANSWER_ARTIFACT_CONFLICT,
    REFERENCE_ANSWER_CONTEXT_CONFLICT,
    REFERENCE_ANSWER_OUTPUT_MISMATCH,
    PracticeReferenceAnswerLifecycleStatus,
    ReferenceAnswerGenerationService,
    ReferenceAnswerGenerationStateError,
    practice_follow_up_reference_answer_idempotency_key,
    practice_main_reference_answer_idempotency_key,
)
from tests.unit.services.test_question_generation import (
    ScriptedSession,
    graph,
)
from tests.unit.services.test_question_generation import (
    payload as question_generation_payload,
)
from tests.unit.services.test_question_generation import (
    run_for as question_generation_run,
)

NOW = datetime(2026, 8, 14, 9, 30, tzinfo=UTC)


class FakeAgentRunService:
    def __init__(self, run: AgentRun) -> None:
        self.run = run
        self.calls: list[dict[str, object]] = []

    async def enqueue_in_transaction(self, **kwargs: object) -> AgentRun:
        self.calls.append(kwargs)
        return self.run


def frozen_context(role, analysis) -> PracticeReferenceFrozenContext:
    return PracticeReferenceFrozenContext.model_validate(
        {
            "targetRole": {
                "title": role.title,
                "company": role.company,
                "rivaSummary": analysis.riva_summary,
                "responsibilities": analysis.responsibilities,
                "qualificationRequirements": analysis.qualification_requirements,
                "requiredSkills": analysis.required_skills,
                "businessDomains": analysis.business_domains,
            },
            "candidateEvidence": [],
        }
    )


def main_graph() -> tuple[
    object,
    QuestionCard,
    AgentRun,
    PracticeQuestionReferenceContext,
]:
    owner, role, profile, analysis, matching = graph()
    qg_payload = question_generation_payload(role, profile, analysis, matching)
    qg_run = question_generation_run(owner, qg_payload)
    qg_run.status = AgentRunStatus.SUCCEEDED
    card = QuestionCard(
        id=uuid4(),
        user_id=owner.id,
        target_role_id=role.id,
        profile_id=profile.profile_id,
        source_agent_run_id=qg_run.id,
        matching_analysis_run_id=matching.source_agent_run_id,
        language="zh-CN",
        question_type=qg_payload.question_type.value,
        difficulty=qg_payload.difficulty.value,
        prompt="Explain the decision.",
        assessed_capabilities=["Ownership"],
        recommended_materials=[],
        answer_hints=[],
        answer_framework=["Context", "Decision"],
        follow_up_directions=[],
        scoring_focus=["Evidence"],
        profile_version=qg_payload.profile_version,
        job_description_version=qg_payload.job_description_version,
        job_description_analysis_version=qg_payload.job_description_analysis_version,
    )
    frozen = frozen_context(role, analysis)
    context = PracticeQuestionReferenceContext(
        question_card_id=card.id,
        frozen_context=frozen.model_dump(mode="json", by_alias=True),
        created_at=NOW,
    )
    return owner, card, qg_run, context


def main_run(
    owner,
    card: QuestionCard,
    context: PracticeQuestionReferenceContext,
    *,
    status: AgentRunStatus = AgentRunStatus.RUNNING,
    key: str | None = None,
) -> AgentRun:
    payload = PracticeMainReferenceAnswerRunPayload(
        targetType="main",
        questionCardId=card.id,
        interactionLanguage=card.language,
        expectedKind="personalizedExample",
        referenceContext=context.frozen_context,
    )
    return AgentRun(
        id=uuid4(),
        user_id=owner.id,
        agent_id="practice-reference-answer-generator",
        prompt_id=PracticeReferenceAnswerAgent.agent_id,
        prompt_version=PracticeReferenceAnswerAgent.agent_version,
        output_schema_id=PracticeReferenceAnswerAgent.output_schema_id,
        status=status,
        payload=payload.model_dump(mode="json", by_alias=True),
        idempotency_key=key or practice_main_reference_answer_idempotency_key(card.id),
        attempt_count=1,
        max_attempts=3,
        available_at=NOW,
        lease_token=uuid4(),
        model="reference-test-model",
    )


def main_output() -> PracticeMainReferenceAnswerOutput:
    return PracticeMainReferenceAnswerOutput(
        targetType="main",
        kind="personalizedExample",
        answer="A grounded answer with a supported decision.",
        keyPoints=["State the decision.", "Explain the evidence."],
        commonMistakes=["Inventing a metric."],
    )


def main_artifact(
    *,
    card: QuestionCard,
    run: AgentRun,
    generated_at: datetime = NOW,
) -> PracticeReferenceAnswerArtifact:
    output = main_output()
    return PracticeReferenceAnswerArtifact(
        id=uuid4(),
        question_card_id=card.id,
        source_agent_run_id=run.id,
        target_type=output.target_type.value,
        kind=output.kind.value,
        answer=output.answer,
        key_points=output.key_points,
        common_mistakes=output.common_mistakes,
        generated_at=generated_at,
    )


def test_reference_answer_generation_state_is_not_requested_without_a_run() -> None:
    owner, card, _qg_run, _context = main_graph()
    session = ScriptedSession(None, None, None)

    state = asyncio.run(
        ReferenceAnswerGenerationService(session).get_main_generation_state(
            user_id=owner.id,
            question_card_id=card.id,
            submitted_at=None,
        )
    )

    assert state.status is PracticeReferenceAnswerLifecycleStatus.NOT_REQUESTED
    assert state.generation_run is None
    assert state.artifact is None
    assert state.output is None
    assert state.viewed_before_submission is False
    assert session.commit_count == 0


@pytest.mark.parametrize(
    "status",
    [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING],
)
def test_reference_answer_generation_state_maps_active_runs_to_generating(
    status: AgentRunStatus,
) -> None:
    owner, card, qg_run, context = main_graph()
    run = main_run(owner, card, context, status=status)
    session = ScriptedSession(run, None, card, qg_run, context, None)

    state = asyncio.run(
        ReferenceAnswerGenerationService(session).get_main_generation_state(
            user_id=owner.id,
            question_card_id=card.id,
            submitted_at=None,
        )
    )

    assert state.status is PracticeReferenceAnswerLifecycleStatus.GENERATING
    assert state.generation_run is run
    assert state.artifact is None
    assert state.output is None


def test_reference_answer_generation_state_maps_failed_run_to_unavailable() -> None:
    owner, card, qg_run, context = main_graph()
    run = main_run(owner, card, context, status=AgentRunStatus.FAILED)
    session = ScriptedSession(run, None, card, qg_run, context, None)

    state = asyncio.run(
        ReferenceAnswerGenerationService(session).get_main_generation_state(
            user_id=owner.id,
            question_card_id=card.id,
            submitted_at=None,
        )
    )

    assert state.status is PracticeReferenceAnswerLifecycleStatus.UNAVAILABLE
    assert state.generation_run is run
    assert state.artifact is None
    assert state.output is None


@pytest.mark.parametrize(
    ("submitted_at", "expected"),
    [
        (None, True),
        (NOW, True),
        (NOW.replace(microsecond=0) - timedelta(microseconds=1), False),
    ],
)
def test_reference_answer_generation_state_reveals_canonical_artifact_and_timing(
    submitted_at: datetime | None,
    expected: bool,
) -> None:
    owner, card, qg_run, context = main_graph()
    run = main_run(owner, card, context, status=AgentRunStatus.SUCCEEDED)
    artifact = main_artifact(card=card, run=run)
    session = ScriptedSession(run, artifact, card, qg_run, context, artifact)

    state = asyncio.run(
        ReferenceAnswerGenerationService(session).get_main_generation_state(
            user_id=owner.id,
            question_card_id=card.id,
            submitted_at=submitted_at,
        )
    )

    assert state.status is PracticeReferenceAnswerLifecycleStatus.REVEALED
    assert state.generation_run is run
    assert state.artifact is artifact
    assert state.output == main_output()
    assert state.viewed_before_submission is expected


@pytest.mark.parametrize(
    "case",
    [
        "succeeded_without_artifact",
        "failed_with_artifact",
        "queued_with_artifact",
        "source_mismatch",
        "target_mismatch",
        "payload_target_mismatch",
        "wrong_stable_key",
        "malformed_frozen_context",
    ],
)
def test_reference_answer_generation_state_rejects_corrupt_lifecycle(
    case: str,
) -> None:
    owner, card, qg_run, context = main_graph()
    run = main_run(
        owner,
        card,
        context,
        status=(
            AgentRunStatus.SUCCEEDED
            if case == "succeeded_without_artifact"
            else AgentRunStatus.FAILED
            if case == "failed_with_artifact"
            else AgentRunStatus.QUEUED
            if case == "queued_with_artifact"
            else AgentRunStatus.RUNNING
        ),
    )
    artifact = main_artifact(card=card, run=run)
    scalar_values: list[object]
    if case == "succeeded_without_artifact":
        scalar_values = [run, None, card, qg_run, context, None]
    elif case in {"failed_with_artifact", "queued_with_artifact"}:
        scalar_values = [run, artifact, card, qg_run, context, None]
    elif case == "source_mismatch":
        mismatched_source = main_run(owner, card, context)
        mismatched_artifact = main_artifact(card=card, run=mismatched_source)
        scalar_values = [run, mismatched_artifact, card, qg_run, context, None]
    elif case == "target_mismatch":
        mismatched_target = main_artifact(card=card, run=run)
        mismatched_target.follow_up_question_id = uuid4()
        scalar_values = [run, None, card, qg_run, context, mismatched_target]
    elif case == "payload_target_mismatch":
        run.payload["questionCardId"] = str(uuid4())
        scalar_values = [run]
    elif case == "wrong_stable_key":
        run.idempotency_key = "wrong-stable-key"
        scalar_values = [None, run]
    else:
        context.frozen_context = {"invalid": True}
        scalar_values = [run, None, card, qg_run, context]

    with pytest.raises(ReferenceAnswerGenerationStateError) as error:
        asyncio.run(
            ReferenceAnswerGenerationService(
                ScriptedSession(*scalar_values)  # type: ignore[arg-type]
            ).get_main_generation_state(
                user_id=owner.id,
                question_card_id=card.id,
                submitted_at=None,
            )
        )

    assert error.value.code == (
        REFERENCE_ANSWER_CONTEXT_CONFLICT
        if case
        in {
            "payload_target_mismatch",
            "wrong_stable_key",
            "malformed_frozen_context",
        }
        else REFERENCE_ANSWER_ARTIFACT_CONFLICT
    )


def test_reference_answer_generation_state_rejects_malformed_payload() -> None:
    owner, card, _qg_run, _context = main_graph()
    run = main_run(owner, card, _context)
    run.payload = {"invalid": True}

    with pytest.raises(ReferenceAnswerGenerationStateError) as error:
        asyncio.run(
            ReferenceAnswerGenerationService(
                ScriptedSession(run)
            ).get_main_generation_state(
                user_id=owner.id,
                question_card_id=card.id,
                submitted_at=None,
            )
        )

    assert error.value.code == INVALID_REFERENCE_ANSWER_GENERATION_RUN


def test_main_enqueue_freezes_card_context_and_uses_stable_key() -> None:
    owner, card, qg_run, context = main_graph()
    expected_run = main_run(owner, card, context, status=AgentRunStatus.QUEUED)
    fake_runs = FakeAgentRunService(expected_run)
    session = ScriptedSession(card, qg_run, context)
    service = ReferenceAnswerGenerationService(
        session,  # type: ignore[arg-type]
        llm_model="reference-test-model",
    )
    service.agent_run_service_factory = lambda _session: cast(object, fake_runs)  # type: ignore[assignment]

    result = asyncio.run(
        service.enqueue_main_generation_in_transaction(
            user_id=owner.id,
            question_card_id=card.id,
            idempotency_key=practice_main_reference_answer_idempotency_key(card.id),
        )
    )

    assert result is expected_run
    call = fake_runs.calls[0]
    assert call["idempotency_key"] == (
        f"practice-question-card:{card.id}:reference-answer"
    )
    assert call["model"] == "reference-test-model"
    payload = PracticeMainReferenceAnswerRunPayload.model_validate(
        cast(dict[str, object], call["payload"])
    )
    assert payload.reference_context == PracticeReferenceFrozenContext.model_validate(
        context.frozen_context
    )
    assert payload.expected_kind == "personalizedExample"
    assert session.commit_count == 0


def test_main_enqueue_rejects_wrong_stable_key_before_loading_card() -> None:
    owner, card, _qg_run, _context = main_graph()
    session = ScriptedSession()
    service = ReferenceAnswerGenerationService(
        session,  # type: ignore[arg-type]
        llm_model="reference-test-model",
    )

    with pytest.raises(ReferenceAnswerGenerationStateError) as error:
        asyncio.run(
            service.enqueue_main_generation_in_transaction(
                user_id=owner.id,
                question_card_id=card.id,
                idempotency_key="not-stable",
            )
        )

    assert error.value.code == REFERENCE_ANSWER_CONTEXT_CONFLICT
    assert session.statements == []


def test_main_load_uses_persisted_frozen_context_only() -> None:
    owner, card, qg_run, context = main_graph()
    run = main_run(owner, card, context)
    session = ScriptedSession(card, qg_run, context)

    loaded = asyncio.run(
        ReferenceAnswerGenerationService(session).load_generation_input(run)
    )

    assert loaded.target_role.riva_summary == "Build reliable APIs."
    assert loaded.candidate_evidence == []
    assert session.commit_count == 1


def test_main_load_rejects_malformed_frozen_context() -> None:
    owner, card, qg_run, context = main_graph()
    run = main_run(owner, card, context)
    context.frozen_context = {"invalid": True}
    session = ScriptedSession(card, qg_run, context)

    with pytest.raises(ReferenceAnswerGenerationStateError) as error:
        asyncio.run(
            ReferenceAnswerGenerationService(session).load_generation_input(run)
        )

    assert error.value.code == REFERENCE_ANSWER_CONTEXT_CONFLICT


def test_main_persist_creates_and_replays_canonical_artifact() -> None:
    owner, card, qg_run, context = main_graph()
    run = main_run(owner, card, context)
    session = ScriptedSession(card, qg_run, context, None, None)
    service = ReferenceAnswerGenerationService(
        session,  # type: ignore[arg-type]
        clock=lambda: NOW,
    )

    first = asyncio.run(service.persist_success(run, main_output()))
    artifact = next(
        value
        for value in session.added
        if isinstance(value, PracticeReferenceAnswerArtifact)
    )
    assert first == main_output()
    assert artifact.source_agent_run_id == run.id
    assert artifact.question_card_id == card.id
    assert artifact.follow_up_question_id is None
    assert artifact.generated_at == NOW

    replay_session = ScriptedSession(card, qg_run, context, artifact)
    replayed = asyncio.run(
        ReferenceAnswerGenerationService(replay_session).persist_success(
            run,
            main_output(),
        )
    )
    assert replayed == first
    assert replay_session.added == []


@pytest.mark.parametrize(
    "output",
    [
        PracticeFollowUpReferenceAnswerOutput(
            targetType="followUp",
            kind="personalizedSupplement",
            addressedGap="The result needs attribution.",
            answer="A grounded supplement.",
            keyPoints=["Add evidence.", "Name the boundary."],
            commonMistakes=["Claiming an unsupported result."],
        ),
        PracticeMainReferenceAnswerOutput(
            targetType="main",
            kind="technicalReference",
            answer="A technical explanation with boundaries.",
            keyPoints=["Explain the mechanism.", "Name the trade-off."],
            commonMistakes=["Treating a trade-off as universal."],
        ),
    ],
)
def test_main_persist_rejects_target_or_kind_mismatch(output: object) -> None:
    owner, card, qg_run, context = main_graph()
    run = main_run(owner, card, context)
    session = ScriptedSession(card, qg_run, context)

    with pytest.raises(ReferenceAnswerGenerationStateError) as error:
        asyncio.run(
            ReferenceAnswerGenerationService(session).persist_success(run, output)
        )

    assert error.value.code == REFERENCE_ANSWER_OUTPUT_MISMATCH
    assert session.added == []


def test_main_persist_rejects_source_or_target_artifact_conflicts() -> None:
    owner, card, qg_run, context = main_graph()
    run = main_run(owner, card, context)
    source_conflict = PracticeReferenceAnswerArtifact(
        id=uuid4(),
        question_card_id=card.id,
        source_agent_run_id=run.id,
        target_type="main",
        kind="personalizedExample",
        answer="Different answer.",
        key_points=["one", "two"],
        common_mistakes=["bad"],
        generated_at=NOW,
    )
    session = ScriptedSession(card, qg_run, context, source_conflict)

    with pytest.raises(ReferenceAnswerGenerationStateError) as source_error:
        asyncio.run(
            ReferenceAnswerGenerationService(session).persist_success(
                run,
                main_output(),
            )
        )
    assert source_error.value.code == REFERENCE_ANSWER_ARTIFACT_CONFLICT


def follow_up_graph(order: int = 1):
    owner, card, qg_run, context = main_graph()
    attempt = PracticeAttempt(
        id=uuid4(),
        user_id=owner.id,
        session_id=uuid4(),
        attempt_number=1,
        question_type=card.question_type,
        difficulty=card.difficulty,
        question_card_id=card.id,
    )
    main_answer = PracticeAnswer(
        id=uuid4(),
        attempt_id=attempt.id,
        kind="main",
        order=1,
        content="I led the rollout.",
    )
    previous_question = None
    previous_answer = None
    previous_question_id = None
    previous_answer_id = None
    if order == 2:
        previous_run = AgentRun(
            id=uuid4(),
            user_id=owner.id,
            agent_id="follow-up-generator",
            prompt_id=FollowUpAgent.agent_id,
            prompt_version=FollowUpAgent.agent_version,
            output_schema_id=FollowUpAgent.output_schema_id,
            status=AgentRunStatus.SUCCEEDED,
            payload=FollowUpRunPayload(
                attemptId=attempt.id,
                questionCardId=card.id,
                mainAnswerId=main_answer.id,
                interactionLanguage=card.language,
                nextFollowUpOrder=1,
            ).model_dump(mode="json", by_alias=True),
            idempotency_key=f"practice-attempt:{attempt.id}:follow-up:1",
            attempt_count=1,
            max_attempts=3,
            available_at=NOW,
            model="follow-up-model",
        )
        previous_question = PracticeFollowUpQuestion(
            id=uuid4(),
            attempt_id=attempt.id,
            source_agent_run_id=previous_run.id,
            order=1,
            prompt="What did you measure?",
            focus="Evidence",
            answer_hints=[],
            answer_framework=[],
        )
        previous_answer = PracticeAnswer(
            id=uuid4(),
            attempt_id=attempt.id,
            kind="followUp",
            order=2,
            content="I compared the failure rate.",
            follow_up_question_id=previous_question.id,
        )
        previous_question_id = previous_question.id
        previous_answer_id = previous_answer.id

    follow_up_run = AgentRun(
        id=uuid4(),
        user_id=owner.id,
        agent_id="follow-up-generator",
        prompt_id=FollowUpAgent.agent_id,
        prompt_version=FollowUpAgent.agent_version,
        output_schema_id=FollowUpAgent.output_schema_id,
        status=AgentRunStatus.SUCCEEDED,
        payload=FollowUpRunPayload(
            attemptId=attempt.id,
            questionCardId=card.id,
            mainAnswerId=main_answer.id,
            interactionLanguage=card.language,
            nextFollowUpOrder=order,
            previousFollowUpQuestionId=previous_question_id,
            previousFollowUpAnswerId=previous_answer_id,
        ).model_dump(mode="json", by_alias=True),
        idempotency_key=f"practice-attempt:{attempt.id}:follow-up:{order}",
        attempt_count=1,
        max_attempts=3,
        available_at=NOW,
        model="follow-up-model",
    )
    question = PracticeFollowUpQuestion(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=follow_up_run.id,
        order=order,
        prompt=f"What was the result for Q{order}?",
        focus="Result attribution",
        answer_hints=[],
        answer_framework=[],
    )
    decision = PracticeFollowUpDecision(
        id=uuid4(),
        attempt_id=attempt.id,
        source_agent_run_id=follow_up_run.id,
        order=order,
        action="askFollowUp",
        follow_up_question_id=question.id,
    )
    return (
        owner,
        card,
        qg_run,
        context,
        attempt,
        main_answer,
        question,
        follow_up_run,
        decision,
        previous_question,
        previous_answer,
    )


@pytest.mark.parametrize("order", [1, 2])
def test_follow_up_load_freezes_only_completed_previous_lineage(order: int) -> None:
    (
        owner,
        card,
        qg_run,
        context,
        attempt,
        main_answer,
        question,
        follow_up_run,
        decision,
        previous_question,
        previous_answer,
    ) = follow_up_graph(order)
    previous_values = []
    if order == 2:
        previous_values.extend([previous_question, previous_answer])
    reference_payload = PracticeFollowUpReferenceAnswerRunPayload(
        targetType="followUp",
        questionCardId=card.id,
        attemptId=attempt.id,
        mainAnswerId=main_answer.id,
        followUpQuestionId=question.id,
        previousFollowUps=(
            [
                {
                    "order": 1,
                    "questionId": previous_question.id,
                    "answerId": previous_answer.id,
                }
            ]
            if order == 2
            else []
        ),
        interactionLanguage=card.language,
        expectedKind="personalizedSupplement",
        referenceContext=context.frozen_context,
    )
    run = AgentRun(
        id=uuid4(),
        user_id=owner.id,
        agent_id="practice-reference-answer-generator",
        prompt_id=PracticeReferenceAnswerAgent.agent_id,
        prompt_version=PracticeReferenceAnswerAgent.agent_version,
        output_schema_id=PracticeReferenceAnswerAgent.output_schema_id,
        status=AgentRunStatus.RUNNING,
        payload=reference_payload.model_dump(mode="json", by_alias=True),
        idempotency_key=practice_follow_up_reference_answer_idempotency_key(
            question.id
        ),
        attempt_count=1,
        max_attempts=3,
        available_at=NOW,
        lease_token=uuid4(),
        model="reference-test-model",
    )
    session = ScriptedSession(
        card,
        qg_run,
        context,
        question,
        attempt,
        follow_up_run,
        decision,
        main_answer,
        *previous_values,
    )

    loaded = asyncio.run(
        ReferenceAnswerGenerationService(session).load_generation_input(run)
    )

    assert loaded.current_follow_up.order == order
    assert [item.order for item in loaded.previous_follow_ups] == (
        [1] if order == 2 else []
    )
    if order == 2:
        assert loaded.previous_follow_ups[0].answer == previous_answer.content
