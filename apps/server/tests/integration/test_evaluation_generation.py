import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from riva.agents import PracticeEvaluationAgent
from riva.db.database import Database
from riva.integrations import LLMUsage, MessageRole
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    PracticeAnswer,
    PracticeAttempt,
    PracticeEvaluation,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeSession,
    QuestionCard,
    TargetRole,
)
from riva.prompts import FOLLOW_UP_PROMPT
from riva.schemas.follow_up import FollowUpRunPayload
from riva.services.agent_runs import AgentRunService
from riva.services.evaluation_generation import (
    EvaluationGenerationService,
    EvaluationGenerationStateError,
    PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID,
    practice_evaluation_idempotency_key,
)
from riva.services.follow_up_generation import practice_follow_up_idempotency_key
from riva.workers import AgentHandlerRegistry, AgentWorker, PracticeEvaluationHandler
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_follow_up_generation import (
    START,
    database_url,
    seed_context,
    succeeded_seed_run,
)


pytestmark = pytest.mark.integration


def evaluation_response(score: int) -> dict[str, object]:
    return {
        "overallScore": score,
        "dimensionScores": [
            {
                "dimension": dimension,
                "score": score,
                "explanation": f"The answer supports {dimension}.",
            }
            for dimension in (
                "relevance",
                "structure",
                "specificity",
                "communication",
            )
        ],
        "focusAssessments": [
            {
                "focusIndex": 0,
                "status": "demonstrated",
                "explanation": "The answer provides evidence.",
            }
        ],
    }


def succeeded_follow_up_run(
    *,
    user_id: UUID,
    session: PracticeSession,
    attempt: PracticeAttempt,
    card: QuestionCard,
    main_answer: PracticeAnswer,
    order: int,
    action: str,
    previous_question: PracticeFollowUpQuestion | None = None,
    previous_answer: PracticeAnswer | None = None,
) -> AgentRun:
    payload = FollowUpRunPayload(
        attempt_id=attempt.id,
        question_card_id=card.id,
        main_answer_id=main_answer.id,
        interaction_language=session.language,
        next_follow_up_order=order,
        previous_follow_up_question_id=(
            previous_question.id if previous_question is not None else None
        ),
        previous_follow_up_answer_id=(
            previous_answer.id if previous_answer is not None else None
        ),
    )
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="follow-up-generator",
        prompt_id=FOLLOW_UP_PROMPT.prompt_id,
        prompt_version=FOLLOW_UP_PROMPT.version,
        output_schema_id=FOLLOW_UP_PROMPT.output_schema_id,
        status=AgentRunStatus.SUCCEEDED,
        payload=payload.model_dump(mode="json", by_alias=True),
        idempotency_key=practice_follow_up_idempotency_key(attempt.id, order),
        attempt_count=1,
        max_attempts=3,
        started_at=START,
        finished_at=START,
        provider="follow-up-integration",
        model="follow-up-integration-model",
        input_tokens=1,
        output_tokens=1,
        result={"action": action},
    )


async def prepare_context(
    database: Database,
    shape: str,
) -> tuple[object, PracticeSession, PracticeAttempt]:
    owner, practice_session, attempt, card = await seed_context(database)
    async with database.sessionmaker() as session:
        stored_session = await session.get(PracticeSession, practice_session.id)
        stored_attempt = await session.get(PracticeAttempt, attempt.id)
        stored_card = await session.get(QuestionCard, card.id)
        main_answer = await session.scalar(
            select(PracticeAnswer).where(
                PracticeAnswer.attempt_id == attempt.id,
                PracticeAnswer.kind == "main",
            )
        )
        assert stored_session is not None
        assert stored_attempt is not None
        assert stored_card is not None
        assert main_answer is not None
        stored_attempt.status = "evaluating"

        if shape == "none":
            terminal_run = succeeded_follow_up_run(
                user_id=owner.id,
                session=stored_session,
                attempt=stored_attempt,
                card=stored_card,
                main_answer=main_answer,
                order=1,
                action="complete",
            )
            session.add(terminal_run)
            session.add(
                PracticeFollowUpDecision(
                    id=uuid4(),
                    attempt_id=stored_attempt.id,
                    source_agent_run_id=terminal_run.id,
                    order=1,
                    action="complete",
                    follow_up_question_id=None,
                    created_at=START,
                )
            )
        else:
            question_run_1 = succeeded_follow_up_run(
                user_id=owner.id,
                session=stored_session,
                attempt=stored_attempt,
                card=stored_card,
                main_answer=main_answer,
                order=1,
                action="askFollowUp",
            )
            question_1 = PracticeFollowUpQuestion(
                id=uuid4(),
                attempt_id=stored_attempt.id,
                source_agent_run_id=question_run_1.id,
                order=1,
                prompt="What metric improved?",
                focus="Attribution evidence",
                answer_hints=["Name the metric."],
                answer_framework=["Baseline", "Result"],
                created_at=START,
            )
            answer_1 = PracticeAnswer(
                id=uuid4(),
                attempt_id=stored_attempt.id,
                kind="followUp",
                order=2,
                content="Failure rate fell by 20%.",
                follow_up_question_id=question_1.id,
                submitted_at=START,
            )
            session.add_all([question_run_1, question_1, answer_1])
            session.add(
                PracticeFollowUpDecision(
                    id=uuid4(),
                    attempt_id=stored_attempt.id,
                    source_agent_run_id=question_run_1.id,
                    order=1,
                    action="askFollowUp",
                    follow_up_question_id=question_1.id,
                    created_at=START,
                )
            )

            terminal_question_id = None
            if shape == "two":
                question_run_2 = succeeded_follow_up_run(
                    user_id=owner.id,
                    session=stored_session,
                    attempt=stored_attempt,
                    card=stored_card,
                    main_answer=main_answer,
                    order=2,
                    action="askFollowUp",
                    previous_question=question_1,
                    previous_answer=answer_1,
                )
                question_2 = PracticeFollowUpQuestion(
                    id=uuid4(),
                    attempt_id=stored_attempt.id,
                    source_agent_run_id=question_run_2.id,
                    order=2,
                    prompt="What evidence supports the attribution?",
                    focus="Verification method",
                    answer_hints=["Name the check."],
                    answer_framework=["Method", "Result"],
                    created_at=START,
                )
                answer_2 = PracticeAnswer(
                    id=uuid4(),
                    attempt_id=stored_attempt.id,
                    kind="followUp",
                    order=3,
                    content="I compared the before and after incident rates.",
                    follow_up_question_id=question_2.id,
                    submitted_at=START,
                )
                session.add_all([question_run_2, question_2, answer_2])
                terminal_question_id = question_2.id
                terminal_run = question_run_2
            else:
                terminal_run = succeeded_follow_up_run(
                    user_id=owner.id,
                    session=stored_session,
                    attempt=stored_attempt,
                    card=stored_card,
                    main_answer=main_answer,
                    order=2,
                    action="complete",
                    previous_question=question_1,
                    previous_answer=answer_1,
                )
                session.add(terminal_run)

            session.add(
                PracticeFollowUpDecision(
                    id=uuid4(),
                    attempt_id=stored_attempt.id,
                    source_agent_run_id=terminal_run.id,
                    order=2,
                    action="complete" if shape == "one" else "askFollowUp",
                    follow_up_question_id=terminal_question_id,
                    created_at=START,
                )
            )

        profile = await session.get(CareerProfile, card.profile_id)
        role = await session.get(TargetRole, stored_session.target_role_id)
        matching_run = await session.get(AgentRun, card.matching_analysis_run_id)
        assert profile is not None
        assert role is not None
        assert matching_run is not None
        profile.summary = "MUTATED_PROFILE_MUST_NOT_BE_LOADED"
        role.raw_job_description = "MUTATED_JOB_DESCRIPTION_MUST_NOT_BE_LOADED"
        matching_run.result = {
            "private": "MUTATED_MATCHING_ANALYSIS_MUST_NOT_BE_LOADED"
        }
        await session.commit()
    return owner, practice_session, attempt


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


def build_worker(database: Database, provider: FakeLLMProvider) -> AgentWorker:
    handler = PracticeEvaluationHandler(
        session_factory=database.sessionmaker,
        agent=PracticeEvaluationAgent(provider, model="fake-evaluation-model"),
    )
    registry = AgentHandlerRegistry()
    registry.register(handler)
    return AgentWorker(
        worker_id="evaluation-integration-worker",
        session_factory=database.sessionmaker,
        registry=registry,
        lease_duration=timedelta(minutes=10),
        heartbeat_interval=timedelta(minutes=2),
        poll_interval=timedelta(seconds=1),
        requeue_interval=timedelta(minutes=1),
        retry_base_delay=timedelta(seconds=1),
        retry_max_delay=timedelta(minutes=2),
        logger=SilentLogger(),
    )


async def enqueue(
    database: Database,
    owner_id,
    attempt_id,
    reason: str,
) -> AgentRun:
    async with database.sessionmaker() as session:
        return await EvaluationGenerationService(
            session,
            llm_model="fake-evaluation-model",
        ).enqueue_generation(
            user_id=owner_id,
            attempt_id=attempt_id,
            interaction_language="en",
            follow_up_completion_reason=reason,  # type: ignore[arg-type]
            idempotency_key=practice_evaluation_idempotency_key(attempt_id),
        )


@pytest.mark.parametrize("shape", ["none", "one", "two"])
def test_evaluation_worker_persists_no_follow_and_all_answered_graphs(
    shape: str,
) -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, attempt = await prepare_context(
                    database,
                    shape,
                )
                reason = "noFollowUpRequired" if shape == "none" else "allAnswered"
                run = await enqueue(database, owner.id, attempt.id, reason)
                provider = FakeLLMProvider(
                    [evaluation_response(80)],
                    usage=LLMUsage(input_tokens=20, output_tokens=10),
                )

                assert await build_worker(database, provider).process_one()

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, run.id)
                    evaluation = await session.scalar(
                        select(PracticeEvaluation).where(
                            PracticeEvaluation.attempt_id == attempt.id
                        )
                    )
                    stored_attempt = await session.get(PracticeAttempt, attempt.id)
                    stored_session = await session.get(
                        PracticeSession,
                        practice_session.id,
                    )
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert evaluation is not None
                    assert evaluation.overall_score == 80
                    assert stored_attempt is not None
                    assert stored_attempt.status == "evaluating"
                    assert stored_session is not None
                    assert stored_session.version == 1
                    assert stored_run.result is not None
                    assert stored_run.result["overallScore"] == 80

                user_message = next(
                    message.content
                    for call in provider.calls
                    for message in call.messages
                    if message.role is MessageRole.USER
                )
                assert "Tell me about the result." in user_message
                assert "I owned the rollout and reduced failures." in user_message
                assert "MUTATED_PROFILE_MUST_NOT_BE_LOADED" not in user_message
                assert "MUTATED_JOB_DESCRIPTION_MUST_NOT_BE_LOADED" not in user_message
                assert (
                    "MUTATED_MATCHING_ANALYSIS_MUST_NOT_BE_LOADED"
                    not in user_message
                )
                if shape != "none":
                    assert "Failure rate fell by 20%." in user_message
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_evaluation_retry_preserves_first_canonical_artifact() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, _, attempt = await prepare_context(database, "none")
                run = await enqueue(
                    database,
                    owner.id,
                    attempt.id,
                    "noFollowUpRequired",
                )

                async with database.sessionmaker() as session:
                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="first-evaluation-attempt",
                        lease_duration=timedelta(minutes=10),
                    )
                    assert claimed is not None
                    assert claimed.id == run.id

                first_handler = PracticeEvaluationHandler(
                    session_factory=database.sessionmaker,
                    agent=PracticeEvaluationAgent(
                        FakeLLMProvider([evaluation_response(55)]),
                        model="fake-evaluation-model",
                    ),
                )
                first_result = await first_handler.execute(claimed)
                assert first_result.output.overall_score == 55

                async with database.sessionmaker() as session:
                    now = datetime.now(UTC)
                    running = await session.get(AgentRun, run.id)
                    assert running is not None
                    running.lease_expires_at = now - timedelta(seconds=1)
                    await session.commit()
                    assert await AgentRunService(
                        session,
                        clock=lambda: now,
                    ).requeue_expired() == 1

                retry_provider = FakeLLMProvider([evaluation_response(91)])
                assert await build_worker(database, retry_provider).process_one()

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, run.id)
                    evaluations = list(
                        (
                            await session.scalars(
                                select(PracticeEvaluation).where(
                                    PracticeEvaluation.attempt_id == attempt.id
                                )
                            )
                        ).all()
                    )
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert len(evaluations) == 1
                    assert evaluations[0].overall_score == 55
                    assert stored_run.result is not None
                    assert stored_run.result["overallScore"] == 55
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_evaluation_rejects_seed_agent_follow_up_provenance() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, _, attempt = await prepare_context(database, "none")

                async with database.sessionmaker() as session:
                    decision = await session.scalar(
                        select(PracticeFollowUpDecision).where(
                            PracticeFollowUpDecision.attempt_id == attempt.id
                        )
                    )
                    assert decision is not None
                    invalid_source = succeeded_seed_run(owner.id)
                    session.add(invalid_source)
                    await session.flush()
                    decision.source_agent_run_id = invalid_source.id
                    await session.commit()

                with pytest.raises(EvaluationGenerationStateError) as exc_info:
                    await enqueue(
                        database,
                        owner.id,
                        attempt.id,
                        "noFollowUpRequired",
                    )

                assert exc_info.value.code == (
                    PRACTICE_EVALUATION_FOLLOW_UP_CONTEXT_INVALID
                )
            finally:
                await database.reset()

    asyncio.run(run_test())
