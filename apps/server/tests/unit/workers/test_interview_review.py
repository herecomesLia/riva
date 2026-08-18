import asyncio
import json
from pathlib import Path
from typing import cast
from uuid import uuid4

import pytest

from riva.agents import AgentResult, InterviewReviewAgent
from riva.integrations import LLMUsage
from riva.models import AgentRun, AgentRunStatus
from riva.services.interview_review_prompt_versions import (
    get_interview_review_prompt,
)
from riva.schemas.interview_review import (
    InterviewReviewInput,
    InterviewReviewOutput,
    InterviewReviewRunPayload,
)
from riva.workers import AgentExecutionError, InterviewReviewHandler
from riva.workers.runtime import SessionFactory


CASE_PATH = (
    Path(__file__).resolve().parents[3]
    / "evals"
    / "cases"
    / "interview-review"
    / "training_memory.json"
)


def review_input() -> InterviewReviewInput:
    case = json.loads(CASE_PATH.read_text(encoding="utf-8"))
    return InterviewReviewInput.model_validate(case["input"])


def review_run(version: str) -> AgentRun:
    prompt = get_interview_review_prompt(version)
    input = review_input()
    payload = InterviewReviewRunPayload(
        session_id=input.session.id,
        session_version=input.session.version,
        session_state_version=input.session.version + 1,
        completion_reason=input.completion_reason,
        review_mode=input.review_mode,
        interaction_language=input.interaction_language,
        interview_review_input=input,
    )
    return AgentRun(
        id=uuid4(),
        user_id=uuid4(),
        agent_id=prompt.prompt_id,
        prompt_id=prompt.prompt_id,
        prompt_version=prompt.version,
        output_schema_id=prompt.output_schema_id,
        status=AgentRunStatus.RUNNING,
        payload=payload.model_dump(mode="json", by_alias=True),
        idempotency_key="interview-review-worker-test",
        attempt_count=1,
        max_attempts=3,
        model="test-model",
        lease_token=uuid4(),
    )


class FakeSessionContext:
    def __init__(self, factory: "FakeSessionFactory") -> None:
        self.factory = factory

    async def __aenter__(self) -> object:
        self.factory.created += 1
        return object()

    async def __aexit__(self, *args: object) -> None:
        pass


class FakeSessionFactory:
    def __init__(self) -> None:
        self.created = 0

    def __call__(self) -> FakeSessionContext:
        return FakeSessionContext(self)


class FakeReviewService:
    def __init__(self, value: InterviewReviewInput) -> None:
        self.value = value
        self.persisted: list[InterviewReviewOutput] = []

    async def load_review_input(self, _run: AgentRun) -> InterviewReviewInput:
        return self.value

    async def persist_success(
        self,
        _run: AgentRun,
        output: InterviewReviewOutput,
    ) -> InterviewReviewOutput:
        self.persisted.append(output)
        return output


class FakeReviewAgent:
    agent_id = "interview-review"

    def __init__(self, prompt_version: str) -> None:
        self.prompt = get_interview_review_prompt(prompt_version)
        self.prompt_id = self.prompt.prompt_id
        self.prompt_version = self.prompt.version
        self.called = 0

    async def run(
        self,
        _input: InterviewReviewInput,
    ) -> AgentResult[InterviewReviewOutput]:
        self.called += 1
        return AgentResult(
            output=InterviewReviewOutput(
                overall_performance="Current artifacts are the source of review."
            ),
            agent_id=self.agent_id,
            prompt_id=self.prompt_id,
            prompt_version=self.prompt_version,
            provider="fake",
            model="test-model",
            usage=LLMUsage(input_tokens=1, output_tokens=1),
        )


@pytest.mark.parametrize("version", ["1", "2"])
def test_handler_selects_the_agent_from_the_run_prompt_version(
    version: str,
) -> None:
    sessions = FakeSessionFactory()
    current = FakeReviewAgent("2")
    legacy = FakeReviewAgent("1")
    service = FakeReviewService(review_input())
    handler = InterviewReviewHandler(
        session_factory=cast(SessionFactory, sessions),
        agent=cast(InterviewReviewAgent, current),
        legacy_agent=cast(InterviewReviewAgent, legacy),
        agents={"1": cast(InterviewReviewAgent, legacy), "2": cast(InterviewReviewAgent, current)},
        review_service_factory=lambda _session: cast(object, service),  # type: ignore[arg-type]
    )

    result = asyncio.run(handler.execute(review_run(version)))

    assert result.prompt_version == version
    assert current.called == (1 if version == "2" else 0)
    assert legacy.called == (1 if version == "1" else 0)
    assert len(service.persisted) == 1
    assert sessions.created == 2


def test_handler_rejects_an_unsupported_review_prompt_version() -> None:
    sessions = FakeSessionFactory()
    current = FakeReviewAgent("2")
    handler = InterviewReviewHandler(
        session_factory=cast(SessionFactory, sessions),
        agent=cast(InterviewReviewAgent, current),
        review_service_factory=lambda _session: cast(
            object, FakeReviewService(review_input())
        ),  # type: ignore[arg-type]
    )
    run = review_run("2")
    run.prompt_version = "99"

    with pytest.raises(AgentExecutionError) as captured:
        asyncio.run(handler.execute(run))

    assert captured.value.code == "invalid_interview_review_run"
    assert captured.value.retryable is False
    assert sessions.created == 0


def test_handler_rejects_mismatched_agent_mapping() -> None:
    current = FakeReviewAgent("2")
    with pytest.raises(ValueError, match="agent mapping"):
        InterviewReviewHandler(
            session_factory=cast(SessionFactory, FakeSessionFactory()),
            agent=cast(InterviewReviewAgent, current),
            agents={"1": cast(InterviewReviewAgent, current)},
        )
