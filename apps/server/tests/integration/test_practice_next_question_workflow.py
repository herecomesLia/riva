import asyncio
from datetime import timedelta
from uuid import UUID

import pytest
from sqlalchemy import select

from riva.agents import (
    FollowUpAgent,
    PracticeEvaluationAgent,
    PracticeRecommendationAgent,
    PracticeReviewAgent,
    QuestionGenerationAgent,
)
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    AgentRunStatus,
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
    PRACTICE_QUESTION_GENERATION_UNAVAILABLE,
    PracticeSessionService,
    PracticeSessionStateError,
    practice_question_generation_idempotency_key,
)
from riva.workers import (
    AgentHandlerRegistry,
    AgentWorker,
    FollowUpHandler,
    PracticeEvaluationHandler,
    PracticeRecommendationHandler,
    PracticeReviewHandler,
    QuestionGenerationHandler,
)
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_question_generation import database_url, seed_context


pytestmark = pytest.mark.integration


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


class FailingQuestionGenerationService:
    async def enqueue_generation_in_transaction(
        self,
        **kwargs: object,
    ) -> AgentRun:
        raise ValueError("missing downstream model")


def question_output(project_id: UUID, *, prompt: str) -> dict[str, object]:
    return {
        "prompt": prompt,
        "question_type": "projectDeepDive",
        "difficulty": "basic",
        "assessed_capabilities": ["Technical decision-making"],
        "recommended_materials": [
            {
                "type": "projectExperience",
                "id": str(project_id),
                "label": "Payment Platform",
                "reason": "Relevant project evidence.",
            }
        ],
        "answer_hints": ["Explain your personal contribution."],
        "answer_framework": ["Context", "Decision", "Result"],
        "follow_up_directions": ["Probe the metric."],
        "scoring_focus": ["Evidence of personal contribution"],
    }


def evaluation_output() -> dict[str, object]:
    return {
        "overallScore": 82,
        "dimensionScores": [
            {
                "dimension": dimension,
                "score": 82,
                "explanation": f"Evidence supports {dimension}.",
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


def review_output() -> dict[str, object]:
    return {
        "overallPerformance": "Strong answer with a measurable result.",
        "highlights": ["Shows ownership."],
        "mainIssues": ["Attribution evidence is brief."],
        "improvementSuggestions": ["Name the baseline and measured result."],
        "reusableAnswerStructure": ["Context", "Evidence", "Result"],
        "exposedWeaknesses": ["Attribution evidence"],
    }


def recommendation_output() -> dict[str, object]:
    return {
        "action": "nextQuestion",
        "reason": "Move to the next focused question.",
        "nextQuestion": {
            "questionType": "projectDeepDive",
            "difficulty": "basic",
            "focusAreas": ["Attribution evidence"],
        },
    }


def build_worker(database: Database, agent: object) -> AgentWorker:
    if isinstance(agent, QuestionGenerationAgent):
        handler = QuestionGenerationHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        worker_id = "practice-next-question-generation-worker"
    elif isinstance(agent, FollowUpAgent):
        handler = FollowUpHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        worker_id = "practice-next-question-follow-up-worker"
    elif isinstance(agent, PracticeEvaluationAgent):
        handler = PracticeEvaluationHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        worker_id = "practice-next-question-evaluation-worker"
    elif isinstance(agent, PracticeReviewAgent):
        handler = PracticeReviewHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        worker_id = "practice-next-question-review-worker"
    elif isinstance(agent, PracticeRecommendationAgent):
        handler = PracticeRecommendationHandler(
            session_factory=database.sessionmaker,
            agent=agent,
        )
        worker_id = "practice-next-question-recommendation-worker"
    else:
        raise AssertionError(f"unsupported integration agent: {type(agent)!r}")

    registry = AgentHandlerRegistry()
    registry.register(handler)
    return AgentWorker(
        worker_id=worker_id,
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


async def produce_first_review(
    database: Database,
) -> tuple[UUID, UUID, UUID, UUID, UUID, UUID]:
    owner, role, _profile, project_id = await seed_context(database)
    async with database.sessionmaker() as session:
        started = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
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
        session_id = started.session.id
        attempt_id = started.attempt.id
        first_run_id = started.question_generation_run.id

    assert await build_worker(
        database,
        QuestionGenerationAgent(
            FakeLLMProvider(
                [
                    question_output(
                        project_id,
                        prompt="Explain how you improved the payment workflow.",
                    )
                ],
                provider="practice-next-question-first-provider",
                usage=LLMUsage(input_tokens=20, output_tokens=10),
            ),
            model="fake-practice-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        answering = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_question_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=1,
        )
        assert answering.session.version == 2
        assert answering.attempt.status == "answering"
        assert answering.question_card is not None
        first_card_id = answering.question_card.id

    async with database.sessionmaker() as session:
        submitted = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).submit_primary_answer(
            user_id=owner.id,
            session_id=session_id,
            expected_version=2,
            question_id=first_card_id,
            content="I owned the rollout and reduced failures.",
        )
        assert submitted.session.version == 3

    assert await build_worker(
        database,
        FollowUpAgent(
            FakeLLMProvider(
                [{"action": "complete"}],
                provider="practice-next-question-follow-up-provider",
                usage=LLMUsage(input_tokens=20, output_tokens=10),
            ),
            model="fake-practice-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        evaluating = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_follow_up_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=3,
        )
        assert evaluating.session.version == 4
        assert evaluating.attempt.status == "evaluating"

    assert await build_worker(
        database,
        PracticeEvaluationAgent(
            FakeLLMProvider(
                [evaluation_output()],
                provider="practice-next-question-evaluation-provider",
                usage=LLMUsage(input_tokens=20, output_tokens=10),
            ),
            model="fake-practice-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        review_queued = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_evaluation_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=4,
        )
        assert review_queued.session.version == 4
        assert review_queued.attempt.status == "evaluating"

    assert await build_worker(
        database,
        PracticeReviewAgent(
            FakeLLMProvider(
                [review_output()],
                provider="practice-next-question-review-provider",
                usage=LLMUsage(input_tokens=20, output_tokens=10),
            ),
            model="fake-practice-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        recommendation_queued = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_evaluation_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=4,
        )
        assert recommendation_queued.session.version == 4
        assert recommendation_queued.attempt.status == "evaluating"

    assert await build_worker(
        database,
        PracticeRecommendationAgent(
            FakeLLMProvider(
                [recommendation_output()],
                provider="practice-next-question-recommendation-provider",
                usage=LLMUsage(input_tokens=20, output_tokens=10),
            ),
            model="fake-practice-model",
        ),
    ).process_one()
    async with database.sessionmaker() as session:
        review = await PracticeSessionService(
            session,
            llm_model="fake-practice-model",
        ).refresh_evaluation_generation(
            user_id=owner.id,
            session_id=session_id,
            expected_version=4,
        )
        assert review.session.status == "active"
        assert review.session.version == 5
        assert review.attempt.status == "review"
        assert review.attempt.completed_at is not None

    return owner.id, session_id, attempt_id, first_card_id, first_run_id, project_id


def test_practice_next_question_real_workflow_replay_and_rollback() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                (
                    user_id,
                    session_id,
                    first_attempt_id,
                    first_card_id,
                    first_run_id,
                    project_id,
                ) = await produce_first_review(database)

                async with database.sessionmaker() as session:
                    first_attempt = await session.get(
                        PracticeAttempt,
                        first_attempt_id,
                    )
                    first_session = await session.get(PracticeSession, session_id)
                    assert first_attempt is not None
                    assert first_session is not None
                    assert first_attempt.status == "review"
                    assert first_session.status == "active"
                    assert first_session.version == 5
                    completed_at = first_attempt.completed_at
                    assert completed_at is not None

                async with database.sessionmaker() as session:
                    with pytest.raises(PracticeSessionStateError) as error:
                        await PracticeSessionService(
                            session,
                            llm_model="fake-practice-model",
                            question_generation_service_factory=(
                                lambda _session, **_kwargs: (
                                    FailingQuestionGenerationService()
                                )
                            ),
                        ).continue_to_next_question(
                            user_id=user_id,
                            session_id=session_id,
                            expected_version=5,
                            question_id=first_card_id,
                        )
                    assert error.value.code == (
                        PRACTICE_QUESTION_GENERATION_UNAVAILABLE
                    )

                async with database.sessionmaker() as session:
                    attempts = list(
                        (
                            await session.scalars(
                                select(PracticeAttempt).where(
                                    PracticeAttempt.session_id == session_id
                                )
                            )
                        ).all()
                    )
                    question_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == user_id,
                                    AgentRun.agent_id == "question-generator",
                                )
                            )
                        ).all()
                    )
                    first_attempt = await session.get(
                        PracticeAttempt,
                        first_attempt_id,
                    )
                    first_session = await session.get(PracticeSession, session_id)
                    assert len(attempts) == 1
                    assert len(question_runs) == 1
                    assert first_attempt is not None
                    assert first_session is not None
                    assert first_attempt.status == "review"
                    assert first_attempt.completed_at == completed_at
                    assert first_session.version == 5

                async with database.sessionmaker() as session:
                    continued = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).continue_to_next_question(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=5,
                        question_id=first_card_id,
                    )
                    assert continued.session.status == "active"
                    assert continued.session.version == 6
                    assert continued.attempt.attempt_number == 2
                    assert continued.attempt.status == "generatingQuestion"
                    assert continued.attempt.retry_of_attempt_id is None
                    assert continued.attempt.question_card_id is None
                    assert continued.attempt.completed_at is None
                    assert continued.question_generation_run.status is AgentRunStatus.QUEUED
                    assert continued.question_generation_run.id is not None
                    assert continued.question_generation_run.idempotency_key == (
                        practice_question_generation_idempotency_key(
                            session_id,
                            continued.attempt.id,
                        )
                    )
                    second_attempt_id = continued.attempt.id
                    second_run_id = continued.question_generation_run.id

                async with database.sessionmaker() as session:
                    first_attempt = await session.get(
                        PracticeAttempt,
                        first_attempt_id,
                    )
                    second_attempt = await session.get(
                        PracticeAttempt,
                        second_attempt_id,
                    )
                    first_session = await session.get(PracticeSession, session_id)
                    assert first_attempt is not None
                    assert second_attempt is not None
                    assert first_session is not None
                    assert first_attempt.status == "completed"
                    assert first_attempt.completed_at == completed_at
                    assert second_attempt.status == "generatingQuestion"
                    assert second_attempt.question_generation_run_id == second_run_id
                    assert first_session.status == "active"
                    assert first_session.version == 6
                    assert len(
                        list(
                            (
                                await session.scalars(
                                    select(PracticeAttempt).where(
                                        PracticeAttempt.session_id == session_id
                                    )
                                )
                            ).all()
                        )
                    ) == 2

                async with database.sessionmaker() as session:
                    replay = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).continue_to_next_question(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=5,
                        question_id=first_card_id,
                    )
                    assert replay.session.version == 6
                    assert replay.attempt.id == second_attempt_id
                    assert replay.question_generation_run.id == second_run_id

                async with database.sessionmaker() as session:
                    attempts = list(
                        (
                            await session.scalars(
                                select(PracticeAttempt).where(
                                    PracticeAttempt.session_id == session_id
                                )
                            )
                        ).all()
                    )
                    question_runs = list(
                        (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.user_id == user_id,
                                    AgentRun.agent_id == "question-generator",
                                )
                            )
                        ).all()
                    )
                    assert len(attempts) == 2
                    assert len(question_runs) == 2

                assert await build_worker(
                    database,
                    QuestionGenerationAgent(
                        FakeLLMProvider(
                            [
                                question_output(
                                    project_id,
                                    prompt="Explain a different payment decision.",
                                )
                            ],
                            provider="practice-next-question-second-provider",
                            usage=LLMUsage(input_tokens=20, output_tokens=10),
                        ),
                        model="fake-practice-model",
                    ),
                ).process_one()

                async with database.sessionmaker() as session:
                    answering = await PracticeSessionService(
                        session,
                        llm_model="fake-practice-model",
                    ).refresh_question_generation(
                        user_id=user_id,
                        session_id=session_id,
                        expected_version=6,
                    )
                    assert answering.session.version == 7
                    assert answering.attempt.id == second_attempt_id
                    assert answering.attempt.status == "answering"
                    assert answering.question_card is not None
                    second_card_id = answering.question_card.id

                async with database.sessionmaker() as session:
                    first_attempt = await session.get(
                        PracticeAttempt,
                        first_attempt_id,
                    )
                    second_attempt = await session.get(
                        PracticeAttempt,
                        second_attempt_id,
                    )
                    first_run = await session.get(AgentRun, first_run_id)
                    second_run = await session.get(AgentRun, second_run_id)
                    first_card = await session.get(QuestionCard, first_card_id)
                    second_card = await session.get(QuestionCard, second_card_id)
                    assert first_attempt is not None
                    assert second_attempt is not None
                    assert first_run is not None
                    assert second_run is not None
                    assert first_card is not None
                    assert second_card is not None
                    assert first_attempt.status == "completed"
                    assert second_attempt.status == "answering"
                    assert first_attempt.question_generation_run_id == first_run.id
                    assert second_attempt.question_generation_run_id == second_run.id
                    assert first_run.id != second_run.id
                    assert first_card.id != second_card.id
                    assert first_card.source_agent_run_id == first_run.id
                    assert second_card.source_agent_run_id == second_run.id
            finally:
                await database.reset()

    asyncio.run(run_test())
