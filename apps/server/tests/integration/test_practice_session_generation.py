import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from riva.agents import QuestionGenerationAgent
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    MatchingAnalysis,
    PracticeAttempt,
    PracticeSession,
    QuestionCard,
)
from riva.schemas.practice_sessions import PracticeSessionSelection
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.services.practice_sessions import (
    PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED,
    PracticeSessionService,
    PracticeSessionStateError,
)
from riva.workers import AgentHandlerRegistry, AgentWorker, QuestionGenerationHandler
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_question_generation import (
    SilentLogger,
    database_url,
    seed_context,
)


pytestmark = pytest.mark.integration
START = datetime(2026, 8, 10, 9, 30, tzinfo=UTC)


def test_practice_session_generation_workflow() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, role, _, project_id = await seed_context(database)
                selection = PracticeSessionSelection(
                    target_role_id=role.id,
                    question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                    difficulty=QuestionCardDifficulty.BASIC,
                    source="personalized",
                    prioritize_weaknesses=False,
                )

                async with database.sessionmaker() as session:
                    started = await PracticeSessionService(
                        session,
                        llm_model="fake-question-model",
                        clock=lambda: START,
                    ).start_session(
                        user_id=owner.id,
                        selection=selection,
                        interaction_language="en",
                    )

                run_id = started.question_generation_run.id
                assert started.session.version == 1
                assert started.attempt.attempt_number == 1
                assert started.attempt.question_generation_run_id == run_id
                assert started.attempt.status == "generatingQuestion"

                async with database.sessionmaker() as session:
                    stored_session = await session.get(
                        PracticeSession,
                        started.session.id,
                    )
                    stored_attempt = await session.get(
                        PracticeAttempt,
                        started.attempt.id,
                    )
                    stored_run = await session.get(AgentRun, run_id)
                    assert stored_session is not None
                    assert stored_attempt is not None
                    assert stored_run is not None
                    assert stored_attempt.question_generation_run_id == run_id
                    assert stored_run.max_attempts == 3
                    assert "sessionId" not in stored_run.payload
                    assert "attemptId" not in stored_run.payload

                response = {
                    "prompt": "Explain how you designed the payment workflows.",
                    "question_type": "projectDeepDive",
                    "difficulty": "basic",
                    "assessed_capabilities": ["Technical decision-making"],
                    "recommended_materials": [
                        {
                            "type": "projectExperience",
                            "id": str(project_id),
                            "label": "Untrusted label",
                            "reason": "Relevant project evidence.",
                        }
                    ],
                    "answer_hints": ["Explain your personal contribution."],
                    "answer_framework": ["Context", "Decision", "Result"],
                    "follow_up_directions": ["Technical rationale"],
                    "scoring_focus": ["Evidence of personal contribution"],
                }
                provider = FakeLLMProvider(
                    [response],
                    provider="fake-question-provider",
                    usage=LLMUsage(input_tokens=20, output_tokens=10),
                )
                handler = QuestionGenerationHandler(
                    session_factory=database.sessionmaker,
                    agent=QuestionGenerationAgent(
                        provider,
                        model="fake-question-model",
                    ),
                )
                registry = AgentHandlerRegistry()
                registry.register(handler)
                worker = AgentWorker(
                    worker_id="practice-session-generation-worker",
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
                assert await worker.process_one() is True

                async with database.sessionmaker() as session:
                    refreshed = await PracticeSessionService(
                        session,
                        clock=lambda: START,
                    ).refresh_question_generation(
                        user_id=owner.id,
                        session_id=started.session.id,
                        expected_version=1,
                    )

                    assert refreshed.session.version == 2
                    assert refreshed.session.language == "en"
                    assert refreshed.attempt.status == "answering"
                    assert refreshed.attempt.question_card_id is not None
                    assert refreshed.question_card is not None
                    assert (
                        refreshed.question_card.source_agent_run_id == run_id
                    )

                    card = await session.scalar(
                        select(QuestionCard).where(
                            QuestionCard.source_agent_run_id == run_id
                        )
                    )
                    assert card is not None
                    assert card.user_id == owner.id
                    assert card.language == "en"
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_practice_session_start_rolls_back_on_stale_matching_analysis() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, role, _, _ = await seed_context(database)
                async with database.sessionmaker() as session:
                    matching = await session.scalar(
                        select(MatchingAnalysis).where(
                            MatchingAnalysis.role_id == role.id,
                            MatchingAnalysis.user_id == owner.id,
                        )
                    )
                    assert matching is not None
                    matching.profile_version += 1
                    await session.commit()

                with pytest.raises(PracticeSessionStateError) as error:
                    async with database.sessionmaker() as session:
                        await PracticeSessionService(
                            session,
                            llm_model="fake-question-model",
                            clock=lambda: START,
                        ).start_session(
                            user_id=owner.id,
                            selection=PracticeSessionSelection(
                                target_role_id=role.id,
                                question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                                difficulty=QuestionCardDifficulty.BASIC,
                                source="personalized",
                                prioritize_weaknesses=False,
                            ),
                            interaction_language="en",
                        )

                assert (
                    error.value.code
                    == PRACTICE_QUESTION_GENERATION_PREREQUISITE_FAILED
                )

                async with database.sessionmaker() as session:
                    practice_sessions = await session.scalar(
                        select(func.count())
                        .select_from(PracticeSession)
                        .where(PracticeSession.user_id == owner.id)
                    )
                    practice_attempts = await session.scalar(
                        select(func.count())
                        .select_from(PracticeAttempt)
                        .where(PracticeAttempt.user_id == owner.id)
                    )
                    question_runs = await session.scalar(
                        select(func.count())
                        .select_from(AgentRun)
                        .where(
                            AgentRun.user_id == owner.id,
                            AgentRun.agent_id == "question-generator",
                        )
                    )
                    assert practice_sessions == 0
                    assert practice_attempts == 0
                    assert question_runs == 0
            finally:
                await database.reset()

    asyncio.run(run_test())
