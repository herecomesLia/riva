import asyncio
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from riva.agents import QuestionGenerationAgent
from riva.agents.runtime.runs import AgentRunService
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import AgentRun, AgentRunStatus, QuestionCard, UserCompetency
from riva.prompts import QUESTION_GENERATION_PROMPT
from riva.schemas.question_cards import QuestionCardDifficulty, QuestionCardQuestionType
from riva.schemas.question_generation import (
    QuestionGenerationOutput,
    QuestionGenerationRunPayload,
)
from riva.schemas.training_memory import TrainingMemoryContext
from riva.services.question_generation import (
    QuestionGenerationService,
    validate_question_card_generation_lineage,
)
from riva.services.question_generation_prompt_versions import (
    get_question_generation_prompt,
)
from riva.workers import AgentHandlerRegistry, AgentWorker, QuestionGenerationHandler
from tests.helpers.integration_database import get_integration_database_url
from tests.helpers.llm import FakeLLMProvider
from tests.integration.test_question_generation import seed_context

pytestmark = pytest.mark.integration
NOW = datetime(2026, 8, 17, 10, tzinfo=UTC)


def output_payload() -> dict[str, object]:
    return {
        "prompt": "Describe how you improved the payment API reliability.",
        "question_type": "projectDeepDive",
        "difficulty": "basic",
        "assessed_capabilities": ["Personal contribution"],
        "recommended_materials": [],
        "answer_hints": ["Explain the result."],
        "answer_framework": ["Context", "Action", "Result"],
        "follow_up_directions": ["Technical rationale"],
        "scoring_focus": ["Evidence of contribution"],
    }


class FailingTrainingMemoryService:
    async def get_context(self, _user_id: UUID) -> TrainingMemoryContext:
        raise AssertionError("replay must not query current training memory")


async def enqueue_versioned_run(
    database: Database,
    *,
    user_id: UUID,
    payload: dict[str, object],
    version: str,
    key: str,
) -> AgentRun:
    prompt = get_question_generation_prompt(version)
    async with database.sessionmaker() as session:
        return await AgentRunService(session).enqueue(
            user_id=user_id,
            agent_id="question-generator",
            prompt_id=prompt.prompt_id,
            prompt_version=prompt.version,
            output_schema_id=prompt.output_schema_id,
            model="memory-test-model",
            payload=payload,
            idempotency_key=key,
            max_attempts=3,
        )


def test_question_generation_snapshots_memory_and_routes_all_prompt_versions() -> None:
    async def run_test() -> None:
        database_url = get_integration_database_url()
        async with Database(database_url) as database:
            await database.reset()
            try:
                owner, role, _profile, _project_id = await seed_context(database)
                async with database.sessionmaker() as session:
                    session.add(
                        UserCompetency(
                            id=uuid4(),
                            user_id=owner.id,
                            competency_key="results_and_evidence",
                            display_name="Do not trust this label",
                            level=55,
                            confidence=60,
                            trend="stable",
                            evidence_count=4,
                            last_evidence_at=NOW,
                        )
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    v3_run = await QuestionGenerationService(
                        session,
                        llm_model="memory-test-model",
                    ).enqueue_generation(
                        user_id=owner.id,
                        target_role_id=role.id,
                        question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                        difficulty=QuestionCardDifficulty.BASIC,
                        interaction_language="en",
                        idempotency_key="memory-v3-request",
                    )
                    snapshot = cast(dict[str, object], v3_run.payload["trainingMemory"])

                assert v3_run.prompt_version == "3"
                assert snapshot["focusCompetencies"][0]["competencyKey"] == (
                    "results_and_evidence"
                )
                assert snapshot["focusCompetencies"][0]["displayName"] == (
                    "Results and Evidence"
                )

                async with database.sessionmaker() as session:
                    competency = await session.scalar(
                        select(UserCompetency).where(
                            UserCompetency.user_id == owner.id,
                            UserCompetency.competency_key == "results_and_evidence",
                        )
                    )
                    assert competency is not None
                    competency.level = 90
                    competency.confidence = 90
                    competency.trend = "improving"
                    await session.commit()

                async with database.sessionmaker() as session:
                    loaded = await QuestionGenerationService(
                        session,
                        llm_model="memory-test-model",
                    ).load_generation_input(v3_run)
                    assert (
                        loaded.training_memory.model_dump(mode="json", by_alias=True)[
                            "focusCompetencies"
                        ][0]["level"]
                        == 55
                    )

                async with database.sessionmaker() as session:
                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="memory-retry-worker",
                        lease_duration=timedelta(minutes=5),
                    )
                    assert claimed is not None
                    assert claimed.id == v3_run.id
                    assert claimed.lease_token is not None
                    retried = await AgentRunService(session).mark_failed(
                        run_id=claimed.id,
                        lease_token=claimed.lease_token,
                        error_code="provider_unavailable",
                        retryable=True,
                        retry_delay=timedelta(0),
                    )
                    assert retried.status is AgentRunStatus.QUEUED
                    assert retried.payload["trainingMemory"] == snapshot

                async with database.sessionmaker() as session:
                    replay = await QuestionGenerationService(
                        session,
                        llm_model="memory-test-model",
                        training_memory_service_factory=lambda _session: (
                            FailingTrainingMemoryService()
                        ),
                    ).enqueue_generation(
                        user_id=owner.id,
                        target_role_id=role.id,
                        question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                        difficulty=QuestionCardDifficulty.BASIC,
                        interaction_language="en",
                        idempotency_key="memory-v3-request",
                    )
                    assert replay.id == v3_run.id
                    assert replay.payload["trainingMemory"] == snapshot

                v3_payload = dict(v3_run.payload)
                v2_payload = {
                    key: value
                    for key, value in v3_payload.items()
                    if key != "trainingMemory"
                }
                v1_payload = {
                    key: value
                    for key, value in v2_payload.items()
                    if key != "weaknessFocus"
                }
                assert (
                    QuestionGenerationRunPayload.model_validate(
                        v1_payload
                    ).training_memory
                    == TrainingMemoryContext()
                )
                assert (
                    QuestionGenerationRunPayload.model_validate(
                        v2_payload
                    ).training_memory
                    == TrainingMemoryContext()
                )

                v1_run = await enqueue_versioned_run(
                    database,
                    user_id=owner.id,
                    payload=v1_payload,
                    version="1",
                    key="memory-v1-request",
                )
                v2_run = await enqueue_versioned_run(
                    database,
                    user_id=owner.id,
                    payload=v2_payload,
                    version="2",
                    key="memory-v2-replay-request",
                )
                async with database.sessionmaker() as session:
                    replay_v2 = await QuestionGenerationService(
                        session,
                        llm_model="memory-test-model",
                        training_memory_service_factory=lambda _session: (
                            FailingTrainingMemoryService()
                        ),
                    ).enqueue_generation(
                        user_id=owner.id,
                        target_role_id=role.id,
                        question_type=QuestionCardQuestionType.PROJECT_DEEP_DIVE,
                        difficulty=QuestionCardDifficulty.BASIC,
                        interaction_language="en",
                        idempotency_key="memory-v2-replay-request",
                    )
                    assert replay_v2.id == v2_run.id
                    assert replay_v2.prompt_version == "2"

                provider = FakeLLMProvider(
                    [output_payload(), output_payload(), output_payload()],
                    usage=LLMUsage(input_tokens=10, output_tokens=5),
                )
                handler = QuestionGenerationHandler(
                    session_factory=database.sessionmaker,
                    agents={
                        "1": QuestionGenerationAgent(
                            provider,
                            model="memory-test-model",
                            prompt=get_question_generation_prompt("1"),
                        ),
                        "2": QuestionGenerationAgent(
                            provider,
                            model="memory-test-model",
                            prompt=get_question_generation_prompt("2"),
                        ),
                        "3": QuestionGenerationAgent(
                            provider,
                            model="memory-test-model",
                        ),
                    },
                )
                registry = AgentHandlerRegistry()
                registry.register(handler)
                worker = AgentWorker(
                    worker_id="memory-question-worker",
                    session_factory=database.sessionmaker,
                    registry=registry,
                    lease_duration=timedelta(minutes=5),
                    heartbeat_interval=timedelta(minutes=1),
                    poll_interval=timedelta(seconds=1),
                    requeue_interval=timedelta(minutes=1),
                    retry_base_delay=timedelta(seconds=1),
                    retry_max_delay=timedelta(minutes=1),
                )
                for _ in range(3):
                    assert await worker.process_one() is True

                assert any(
                    "<BEGIN_UNTRUSTED_TRAINING_MEMORY>" in request.messages[1].content
                    and "<BEGIN_UNTRUSTED_WEAKNESS_FOCUS>"
                    in request.messages[1].content
                    for request in provider.calls
                )
                assert any(
                    "<BEGIN_UNTRUSTED_WEAKNESS_FOCUS>" in request.messages[1].content
                    and "<BEGIN_UNTRUSTED_TRAINING_MEMORY>"
                    not in request.messages[1].content
                    for request in provider.calls
                )
                assert any(
                    "<BEGIN_UNTRUSTED_WEAKNESS_FOCUS>"
                    not in request.messages[1].content
                    and "<BEGIN_UNTRUSTED_TRAINING_MEMORY>"
                    not in request.messages[1].content
                    for request in provider.calls
                )

                async with database.sessionmaker() as session:
                    stored_runs = {
                        run.id: run
                        for run in (
                            await session.scalars(
                                select(AgentRun).where(
                                    AgentRun.id.in_([v1_run.id, v2_run.id, v3_run.id])
                                )
                            )
                        ).all()
                    }
                    cards = {
                        card.source_agent_run_id: card
                        for card in (
                            await session.scalars(
                                select(QuestionCard).where(
                                    QuestionCard.source_agent_run_id.in_(
                                        [v1_run.id, v2_run.id, v3_run.id]
                                    )
                                )
                            )
                        ).all()
                    }
                    assert {
                        stored_runs[v1_run.id].prompt_version,
                        stored_runs[v2_run.id].prompt_version,
                        stored_runs[v3_run.id].prompt_version,
                    } == {"1", "2", "3"}
                    assert set(cards) == {v1_run.id, v2_run.id, v3_run.id}
                    for run_id in (v1_run.id, v2_run.id, v3_run.id):
                        validate_question_card_generation_lineage(
                            cards[run_id], stored_runs[run_id]
                        )
                    assert cards[v3_run.id].source_agent_run_id == v3_run.id
            finally:
                await database.reset()

    asyncio.run(run_test())
