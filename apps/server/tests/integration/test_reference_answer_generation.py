import asyncio
from datetime import UTC, datetime, timedelta
import os

import pytest
from sqlalchemy import select

from riva.agents import (
    PracticeReferenceAnswerAgent,
    QuestionGenerationAgent,
)
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfileWorkExperience,
    JobDescriptionAnalysis,
    PracticeQuestionReferenceContext,
    PracticeReferenceAnswerArtifact,
    QuestionCard,
)
from riva.schemas.question_cards import (
    QuestionCardDifficulty,
    QuestionCardQuestionType,
)
from riva.services.question_generation import QuestionGenerationService
from riva.services.reference_answer_generation import (
    ReferenceAnswerGenerationService,
    practice_main_reference_answer_idempotency_key,
)
from riva.workers import (
    AgentHandlerRegistry,
    AgentWorker,
    PracticeReferenceAnswerHandler,
    QuestionGenerationHandler,
)
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_question_generation import (
    SilentLogger,
    seed_context,
)


pytestmark = pytest.mark.integration
START = datetime(2026, 8, 14, 9, 30, tzinfo=UTC)


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def worker(database: Database, handler: object, agent_id: str) -> AgentWorker:
    registry = AgentHandlerRegistry()
    registry.register(handler)  # type: ignore[arg-type]
    return AgentWorker(
        worker_id=f"{agent_id}-integration-worker",
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


def test_reference_answer_worker_persists_artifact_from_frozen_context() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner, role, profile, project_id = await seed_context(database)
                question_response = {
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
                async with database.sessionmaker() as session:
                    question_run = await QuestionGenerationService(
                        session,
                        llm_model="fake-question-model",
                    ).enqueue_generation(
                        user_id=owner.id,
                        target_role_id=role.id,
                        question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                        difficulty=QuestionCardDifficulty.BASIC,
                        interaction_language="en",
                        idempotency_key="reference-answer-question",
                    )

                question_provider = FakeLLMProvider(
                    [question_response],
                    provider="fake-question-provider",
                    usage=LLMUsage(input_tokens=20, output_tokens=10),
                )
                question_handler = QuestionGenerationHandler(
                    session_factory=database.sessionmaker,
                    agent=QuestionGenerationAgent(
                        question_provider,
                        model="fake-question-model",
                    ),
                )
                assert await worker(
                    database,
                    question_handler,
                    "question-generation",
                ).process_one()

                async with database.sessionmaker() as session:
                    card = await session.scalar(
                        select(QuestionCard).where(
                            QuestionCard.source_agent_run_id == question_run.id
                        )
                    )
                    assert card is not None
                    context = await session.get(
                        PracticeQuestionReferenceContext,
                        card.id,
                    )
                    assert context is not None
                    old_summary = context.frozen_context["targetRole"][
                        "rivaSummary"
                    ]
                    old_evidence = context.frozen_context["candidateEvidence"]
                    stored_question_run = await session.get(AgentRun, question_run.id)
                    assert stored_question_run is not None
                    assert stored_question_run.status is AgentRunStatus.SUCCEEDED

                    work = await session.scalar(
                        select(CareerProfileWorkExperience).where(
                            CareerProfileWorkExperience.career_profile_id
                            == profile.profile_id
                        )
                    )
                    analysis = await session.get(JobDescriptionAnalysis, role.id)
                    assert work is not None
                    assert analysis is not None
                    work.responsibilities = ["CURRENT PROFILE MUST NOT BE USED"]
                    analysis.riva_summary = "CURRENT JD MUST NOT BE USED"
                    await session.commit()

                    reference_run = await ReferenceAnswerGenerationService(
                        session,
                        llm_model="fake-reference-model",
                    ).enqueue_main_generation(
                        user_id=owner.id,
                        question_card_id=card.id,
                        idempotency_key=practice_main_reference_answer_idempotency_key(
                            card.id
                        ),
                    )

                reference_response = {
                    "targetType": "main",
                    "kind": "personalizedExample",
                    "answer": "A grounded reference answer.",
                    "keyPoints": [
                        "State the decision.",
                        "Explain the evidence.",
                    ],
                    "commonMistakes": ["Inventing a metric."],
                }
                reference_provider = FakeLLMProvider(
                    [reference_response],
                    provider="fake-reference-provider",
                    usage=LLMUsage(input_tokens=20, output_tokens=10),
                )
                reference_handler = PracticeReferenceAnswerHandler(
                    session_factory=database.sessionmaker,
                    agent=PracticeReferenceAnswerAgent(
                        reference_provider,
                        model="fake-reference-model",
                    ),
                )
                assert await worker(
                    database,
                    reference_handler,
                    "reference-answer",
                ).process_one()

                assert reference_provider.calls
                rendered = reference_provider.calls[0].messages[-1].content
                assert old_summary in rendered
                assert "CURRENT JD MUST NOT BE USED" not in rendered
                if old_evidence:
                    assert str(old_evidence[0]["name"]) in rendered

                async with database.sessionmaker() as session:
                    stored_reference_run = await session.get(
                        AgentRun,
                        reference_run.id,
                    )
                    artifact = await session.scalar(
                        select(PracticeReferenceAnswerArtifact).where(
                            PracticeReferenceAnswerArtifact.source_agent_run_id
                            == reference_run.id
                        )
                    )
                    assert stored_reference_run is not None
                    assert stored_reference_run.status is AgentRunStatus.SUCCEEDED
                    assert artifact is not None
                    assert artifact.source_agent_run_id == reference_run.id
                    assert artifact.generated_at.tzinfo is not None
                    assert artifact.question_card_id == card.id
                    assert artifact.answer == reference_response["answer"]
                    assert artifact.key_points == reference_response["keyPoints"]
                    assert artifact.common_mistakes == reference_response[
                        "commonMistakes"
                    ]
                    assert stored_reference_run.result is not None
                    assert stored_reference_run.result["answer"] == artifact.answer
            finally:
                await database.reset()

    asyncio.run(run_test())
