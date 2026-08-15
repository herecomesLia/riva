from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select

from riva.agents import PracticeReferenceAnswerAgent
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import AgentRun, AgentRunStatus
from riva.workers import (
    AgentHandlerRegistry,
    AgentWorker,
    PracticeReferenceAnswerHandler,
)
from tests.helpers.llm import FakeLLMProvider


def main_reference_response() -> dict[str, object]:
    return {
        "targetType": "main",
        "kind": "personalizedExample",
        "answer": "A canonical reference answer.",
        "keyPoints": [
            "State the decision.",
            "Connect it to evidence.",
        ],
        "commonMistakes": ["Inventing an unsupported metric."],
    }


def follow_up_reference_response() -> dict[str, object]:
    return {
        "targetType": "followUp",
        "kind": "personalizedSupplement",
        "addressedGap": "The answer needs measurable attribution.",
        "answer": "Tie the decision to the measurable outcome.",
        "keyPoints": [
            "Name the baseline.",
            "Connect the result to your action.",
        ],
        "commonMistakes": ["Claiming a team result as personal impact."],
    }


def build_reference_worker(
    database: Database,
    responses: list[dict[str, object]],
) -> AgentWorker:
    registry = AgentHandlerRegistry()
    registry.register(
        PracticeReferenceAnswerHandler(
            session_factory=database.sessionmaker,
            agent=PracticeReferenceAnswerAgent(
                FakeLLMProvider(
                    responses,
                    provider="practice-reference-test-provider",
                    usage=LLMUsage(input_tokens=10, output_tokens=10),
                ),
                model="fake-reference-model",
            ),
        )
    )
    return AgentWorker(
        worker_id="practice-reference-answer-test-worker",
        session_factory=database.sessionmaker,
        registry=registry,
        lease_duration=timedelta(minutes=10),
        heartbeat_interval=timedelta(minutes=2),
        poll_interval=timedelta(seconds=1),
        requeue_interval=timedelta(minutes=1),
        retry_base_delay=timedelta(seconds=1),
        retry_max_delay=timedelta(minutes=2),
        logger=_SilentLogger(),
    )


async def complete_queued_reference_answers(
    database: Database,
) -> list[AgentRun]:
    async with database.sessionmaker() as session:
        runs = list(
            (
                await session.scalars(
                    select(AgentRun)
                    .where(
                        AgentRun.agent_id
                        == "practice-reference-answer-generator",
                        AgentRun.status == AgentRunStatus.QUEUED,
                    )
                    .order_by(
                        AgentRun.available_at,
                        AgentRun.created_at,
                        AgentRun.id,
                    )
                )
            ).all()
        )

    responses = []
    for run in runs:
        target_type = run.payload.get("targetType")
        if target_type == "main":
            responses.append(main_reference_response())
        elif target_type == "followUp":
            responses.append(follow_up_reference_response())
        else:
            raise AssertionError(f"unexpected reference target: {target_type!r}")

    if not runs:
        return []
    worker = build_reference_worker(database, responses)
    for _run in runs:
        assert await worker.process_one()
    return runs


class _SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass
