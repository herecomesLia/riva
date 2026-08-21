import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from riva.agents import FollowUpAgent
from riva.db.database import Database
from riva.integrations import LLMUsage, MessageRole, StructuredGenerationRequest
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    PracticeAnswer,
    PracticeAttempt,
    PracticeFollowUpDecision,
    PracticeFollowUpQuestion,
    PracticeSession,
    QuestionCard,
    TargetRole,
    User,
)
from riva.schemas.follow_up import FollowUpGenerationOutput
from riva.services.agent_runs import AgentRunService
from riva.services.follow_up_generation import (
    FollowUpGenerationService,
    practice_follow_up_idempotency_key,
)
from riva.workers import AgentHandlerRegistry, AgentWorker, FollowUpHandler
from tests.helpers.llm import FakeLLMProvider

pytestmark = pytest.mark.integration
START = datetime(2026, 8, 11, 9, 30, tzinfo=UTC)


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def succeeded_seed_run(user_id: UUID) -> AgentRun:
    return AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="seed-agent",
        prompt_id="seed-prompt",
        prompt_version="1",
        output_schema_id="seed-output-v1",
        status=AgentRunStatus.SUCCEEDED,
        payload={"seedVersion": 1},
        idempotency_key=f"seed-{uuid4()}",
        attempt_count=1,
        max_attempts=1,
        started_at=START,
        finished_at=START,
        provider="seed-provider",
        model="seed-model",
        input_tokens=1,
        output_tokens=1,
        result={"seeded": True},
    )


async def seed_context(
    database: Database,
) -> tuple[User, PracticeSession, PracticeAttempt, QuestionCard]:
    user_id = uuid4()
    owner = User(
        id=user_id,
        username=user_id.hex,
        normalized_username=user_id.hex,
        password_hash="hash",
        display_name="Follow-up Integration User",
    )
    role = TargetRole(
        id=uuid4(),
        user_id=user_id,
        title="Backend Engineer",
        company="Riva",
        recruitment_type="experienced",
        location="Shanghai",
        preparation_status="preparing",
        job_description_status="saved",
        raw_job_description="Build reliable APIs.",
        job_description_version=1,
        version=1,
    )
    profile = CareerProfile(
        profile_id=uuid4(),
        user_id=user_id,
        summary="Profile changes must not affect follow-up input.",
        version=1,
    )
    seed_run = succeeded_seed_run(user_id)
    role.matching_analysis_run_id = seed_run.id
    practice_session = PracticeSession(
        id=uuid4(),
        user_id=user_id,
        target_role_id=role.id,
        language="en",
        version=1,
        status="active",
        initial_question_type="behavioral",
        initial_difficulty="basic",
        source="personalized",
        prioritize_weaknesses=False,
        started_at=START,
        created_at=START,
        updated_at=START,
    )
    attempt = PracticeAttempt(
        id=uuid4(),
        user_id=user_id,
        session_id=practice_session.id,
        attempt_number=1,
        question_type="behavioral",
        difficulty="basic",
        status="answering",
        question_generation_run_id=None,
        question_card_id=None,
        retry_of_attempt_id=None,
        created_at=START,
        updated_at=START,
    )
    card = QuestionCard(
        id=uuid4(),
        user_id=user_id,
        target_role_id=role.id,
        profile_id=profile.profile_id,
        source_agent_run_id=seed_run.id,
        matching_analysis_run_id=seed_run.id,
        language="en",
        question_type="behavioral",
        difficulty="basic",
        prompt="Tell me about the result.",
        assessed_capabilities=["Ownership"],
        recommended_materials=[],
        answer_hints=["Use a metric."],
        answer_framework=["Context", "Result"],
        follow_up_directions=["Probe attribution."],
        scoring_focus=["Evidence"],
        profile_version=1,
        job_description_version=1,
        job_description_analysis_version=1,
        is_saved=False,
        is_marked_weak=False,
        created_at=START,
        updated_at=START,
    )
    attempt.question_card_id = card.id
    main_answer = PracticeAnswer(
        id=uuid4(),
        attempt_id=attempt.id,
        kind="main",
        order=1,
        content="I owned the rollout and reduced failures.",
        submitted_at=START,
    )

    async with database.sessionmaker() as session:
        session.add_all(
            [
                owner,
                role,
                profile,
                seed_run,
                practice_session,
                attempt,
                card,
                main_answer,
            ]
        )
        await session.commit()
    return owner, practice_session, attempt, card


def build_worker(database: Database, provider: FakeLLMProvider) -> AgentWorker:
    handler = FollowUpHandler(
        session_factory=database.sessionmaker,
        agent=FollowUpAgent(provider, model="fake-follow-up-model"),
    )
    registry = AgentHandlerRegistry()
    registry.register(handler)
    return AgentWorker(
        worker_id="follow-up-integration-worker",
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


def ask_response(prompt: str) -> dict[str, object]:
    return {
        "action": "askFollowUp",
        "prompt": prompt,
        "focus": "Attribution evidence",
        "answer_hints": ["Name the metric."],
        "answer_framework": ["Baseline", "Result"],
    }


def test_follow_up_worker_persists_ask_and_complete_canonically() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, practice_session, attempt, card = await seed_context(database)
                async with database.sessionmaker() as session:
                    run = await FollowUpGenerationService(
                        session,
                        llm_model="fake-follow-up-model",
                    ).enqueue_generation(
                        user_id=owner.id,
                        attempt_id=attempt.id,
                        next_follow_up_order=1,
                        interaction_language="en",
                        idempotency_key=(
                            practice_follow_up_idempotency_key(attempt.id, 1)
                        ),
                    )

                provider = FakeLLMProvider(
                    [ask_response("What metric improved?")],
                    usage=LLMUsage(input_tokens=20, output_tokens=10),
                )
                assert await build_worker(database, provider).process_one() is True

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, run.id)
                    decision = await session.scalar(
                        select(PracticeFollowUpDecision).where(
                            PracticeFollowUpDecision.source_agent_run_id == run.id
                        )
                    )
                    question = await session.scalar(
                        select(PracticeFollowUpQuestion).where(
                            PracticeFollowUpQuestion.source_agent_run_id == run.id
                        )
                    )
                    current_attempt = await session.get(PracticeAttempt, attempt.id)
                    current_session = await session.get(
                        PracticeSession,
                        practice_session.id,
                    )
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert decision is not None
                    assert decision.action == "askFollowUp"
                    assert question is not None
                    assert question.source_agent_run_id == run.id
                    assert question.order == 1
                    assert stored_run.result is not None
                    assert stored_run.result["prompt"] == question.prompt
                    assert current_attempt is not None
                    assert current_attempt.status == "answering"
                    assert current_session is not None
                    assert current_session.version == 1

                    question_id = question.id
                    session.add(
                        PracticeAnswer(
                            id=uuid4(),
                            attempt_id=attempt.id,
                            kind="followUp",
                            order=2,
                            content="Failure rate fell by 20%.",
                            follow_up_question_id=question_id,
                            submitted_at=START,
                        )
                    )
                    await session.commit()

                    second_run = await FollowUpGenerationService(
                        session,
                        llm_model="fake-follow-up-model",
                    ).enqueue_generation(
                        user_id=owner.id,
                        attempt_id=attempt.id,
                        next_follow_up_order=2,
                        interaction_language="en",
                        idempotency_key=(
                            practice_follow_up_idempotency_key(attempt.id, 2)
                        ),
                    )

                second_provider = FakeLLMProvider([{"action": "complete"}])
                assert await build_worker(database, second_provider).process_one()
                structured_call = second_provider.calls[0]
                assert isinstance(structured_call, StructuredGenerationRequest)
                user_messages = [
                    message.content
                    for message in structured_call.messages
                    if message.role is MessageRole.USER
                ]
                assert user_messages
                assert "What metric improved?" in user_messages[0]
                assert "Failure rate fell by 20%" in user_messages[0]

                async with database.sessionmaker() as session:
                    stored_second_run = await session.get(AgentRun, second_run.id)
                    complete_decision = await session.scalar(
                        select(PracticeFollowUpDecision).where(
                            PracticeFollowUpDecision.source_agent_run_id
                            == second_run.id
                        )
                    )
                    assert stored_second_run is not None
                    assert stored_second_run.status is AgentRunStatus.SUCCEEDED
                    assert complete_decision is not None
                    assert complete_decision.action == "complete"
                    assert stored_second_run.result == {"action": "complete"}
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_follow_up_retry_preserves_first_ask_and_complete_decisions() -> None:
    async def run_scenario(
        first_response: dict[str, object],
        retry_response: dict[str, object],
        expected_action: str,
        expected_prompt: str | None,
    ) -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, _, attempt, _ = await seed_context(database)
                async with database.sessionmaker() as session:
                    run = await FollowUpGenerationService(
                        session,
                        llm_model="fake-follow-up-model",
                    ).enqueue_generation(
                        user_id=owner.id,
                        attempt_id=attempt.id,
                        next_follow_up_order=1,
                        interaction_language="en",
                        idempotency_key=(
                            practice_follow_up_idempotency_key(attempt.id, 1)
                        ),
                    )
                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="first-follow-up-attempt",
                        lease_duration=timedelta(minutes=10),
                    )
                    assert claimed is not None
                    assert claimed.id == run.id

                first_provider = FakeLLMProvider([first_response])
                first_handler = FollowUpHandler(
                    session_factory=database.sessionmaker,
                    agent=FollowUpAgent(
                        first_provider,
                        model="fake-follow-up-model",
                    ),
                )
                await first_handler.execute(claimed)

                async with database.sessionmaker() as session:
                    now = datetime.now(UTC)
                    running = await session.get(AgentRun, run.id)
                    assert running is not None
                    running.lease_expires_at = now - timedelta(seconds=1)
                    await session.commit()
                    assert (
                        await AgentRunService(
                            session,
                            clock=lambda: now,
                        ).requeue_expired()
                        == 1
                    )

                retry_provider = FakeLLMProvider([retry_response])
                retry_worker = build_worker(database, retry_provider)
                assert await retry_worker.process_one() is True

                async with database.sessionmaker() as session:
                    stored_run = await session.get(AgentRun, run.id)
                    decisions = list(
                        (
                            await session.scalars(
                                select(PracticeFollowUpDecision).where(
                                    PracticeFollowUpDecision.source_agent_run_id
                                    == run.id
                                )
                            )
                        ).all()
                    )
                    questions = list(
                        (
                            await session.scalars(
                                select(PracticeFollowUpQuestion).where(
                                    PracticeFollowUpQuestion.source_agent_run_id
                                    == run.id
                                )
                            )
                        ).all()
                    )
                    assert stored_run is not None
                    assert stored_run.status is AgentRunStatus.SUCCEEDED
                    assert len(decisions) == 1
                    assert decisions[0].action == expected_action
                    assert len(questions) == (1 if expected_prompt else 0)
                    if expected_prompt is not None:
                        assert questions[0].prompt == expected_prompt
                        assert stored_run.result is not None
                        assert stored_run.result["prompt"] == expected_prompt
                    else:
                        assert stored_run.result == {"action": "complete"}
            finally:
                await database.reset()

    async def run_both() -> None:
        await run_scenario(
            ask_response("Canonical ask A"),
            ask_response("Different ask B"),
            "askFollowUp",
            "Canonical ask A",
        )
        await run_scenario(
            {"action": "complete"},
            ask_response("Ask after complete"),
            "complete",
            None,
        )

    asyncio.run(run_both())
