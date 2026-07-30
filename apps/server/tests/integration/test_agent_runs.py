import asyncio
from datetime import UTC, datetime, timedelta
import os
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError, StatementError

from riva.agents import AgentResult
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import AgentRun, AgentRunStatus, User
from riva.services.agent_runs import AgentRunLeaseError, AgentRunService


pytestmark = pytest.mark.integration
START = datetime(2026, 7, 30, 8, tzinfo=UTC)


class MutableClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


class ExampleOutput(BaseModel):
    decision: str
    score: int


def user(user_id: UUID, username: str) -> User:
    return User(
        id=user_id,
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name=username,
    )


async def enqueue(
    database: Database,
    clock: MutableClock,
    user_id: UUID,
    idempotency_key: str,
    *,
    available_at: datetime | None = None,
    max_attempts: int = 2,
    agent_id: str = "example-agent",
) -> AgentRun:
    async with database.sessionmaker() as session:
        return await AgentRunService(session, clock=clock).enqueue(
            user_id=user_id,
            agent_id=agent_id,
            prompt_id="example-prompt",
            prompt_version="1",
            output_schema_id="example-output-v1",
            model="queued-model",
            payload={"roleId": uuid4(), "profileVersion": 3},
            idempotency_key=idempotency_key,
            max_attempts=max_attempts,
            available_at=available_at,
        )


def success_result(value: str) -> AgentResult[ExampleOutput]:
    return AgentResult(
        output=ExampleOutput(decision=value, score=97),
        agent_id="example-agent",
        prompt_id="example-prompt",
        prompt_version="1",
        provider="test-provider",
        model="completed-model",
        usage=LLMUsage(input_tokens=21, output_tokens=8),
    )


def test_agent_run_queue_state_machine_and_constraints() -> None:
    test_database_url = os.getenv("RIVA_TEST_DATABASE_URL")
    if not test_database_url:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")

    development_database_url = os.getenv("RIVA_DATABASE_URL")
    if development_database_url == test_database_url:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")

    async def run() -> None:
        owner_id = uuid4()
        cascade_owner_id = uuid4()
        clock = MutableClock(START)

        async with Database(test_database_url) as database:
            await database.reset()
            try:
                async with database.sessionmaker() as session:
                    session.add(user(owner_id, "agent-run-owner"))
                    session.add(user(cascade_owner_id, "agent-run-cascade"))
                    await session.commit()

                async with database.sessionmaker() as session:
                    assert (
                        await AgentRunService(
                            session,
                            clock=clock,
                        ).claim_next(
                            lease_owner="empty-worker",
                            lease_duration=timedelta(minutes=5),
                        )
                        is None
                    )

                future = await enqueue(
                    database,
                    clock,
                    owner_id,
                    "future",
                    available_at=clock.now + timedelta(days=1),
                )
                assert future.status == AgentRunStatus.QUEUED
                assert future.attempt_count == 0
                assert future.max_attempts == 2
                assert future.payload["profileVersion"] == 3
                assert isinstance(future.payload["roleId"], str)
                assert future.result is None

                async with database.sessionmaker() as session:
                    assert (
                        await AgentRunService(
                            session,
                            clock=clock,
                        ).claim_next(
                            lease_owner="future-worker",
                            lease_duration=timedelta(minutes=5),
                        )
                        is None
                    )

                earlier = await enqueue(
                    database,
                    clock,
                    owner_id,
                    "earlier",
                    available_at=clock.now - timedelta(minutes=2),
                )
                later = await enqueue(
                    database,
                    clock,
                    owner_id,
                    "later",
                    available_at=clock.now - timedelta(minutes=1),
                )
                claimed_in_order: list[UUID] = []
                for worker in ("ordered-worker-1", "ordered-worker-2"):
                    async with database.sessionmaker() as session:
                        service = AgentRunService(session, clock=clock)
                        claimed = await service.claim_next(
                            lease_owner=worker,
                            lease_duration=timedelta(minutes=5),
                        )
                        assert claimed is not None
                        claimed_in_order.append(claimed.id)
                        await service.mark_failed(
                            run_id=claimed.id,
                            lease_token=claimed.lease_token,
                            error_code="not_retryable",
                            retryable=False,
                            retry_delay=timedelta(0),
                        )
                assert claimed_in_order == [earlier.id, later.id]

                concurrent = await enqueue(
                    database,
                    clock,
                    owner_id,
                    "concurrent-claim",
                )

                async def concurrent_claim(worker: str):
                    async with database.sessionmaker() as session:
                        return await AgentRunService(
                            session,
                            clock=clock,
                        ).claim_next(
                            lease_owner=worker,
                            lease_duration=timedelta(minutes=5),
                        )

                claim_results = await asyncio.gather(
                    concurrent_claim("worker-a"),
                    concurrent_claim("worker-b"),
                )
                concurrent_claims = [result for result in claim_results if result]
                assert len(concurrent_claims) == 1
                claimed = concurrent_claims[0]
                assert claimed.id == concurrent.id
                assert claimed.status == AgentRunStatus.RUNNING
                assert claimed.attempt_count == 1
                assert claimed.started_at == clock.now
                assert claimed.lease_owner in {"worker-a", "worker-b"}
                assert claimed.lease_token is not None

                async with database.sessionmaker() as session:
                    with pytest.raises(AgentRunLeaseError):
                        await AgentRunService(
                            session,
                            clock=clock,
                        ).mark_succeeded(
                            run_id=claimed.id,
                            lease_token=uuid4(),
                            result=success_result("wrong-token"),
                        )

                async with database.sessionmaker() as session:
                    succeeded = await AgentRunService(
                        session,
                        clock=clock,
                    ).mark_succeeded(
                        run_id=claimed.id,
                        lease_token=claimed.lease_token,
                        result=success_result("accepted"),
                    )
                assert succeeded.status == AgentRunStatus.SUCCEEDED
                assert succeeded.result == {"decision": "accepted", "score": 97}
                assert succeeded.provider == "test-provider"
                assert succeeded.model == "completed-model"
                assert succeeded.input_tokens == 21
                assert succeeded.output_tokens == 8
                assert succeeded.finished_at == clock.now
                assert succeeded.lease_owner is None
                assert succeeded.lease_token is None
                assert succeeded.lease_expires_at is None
                assert succeeded.error_code is None

                async with database.sessionmaker() as session:
                    duplicate = await AgentRunService(
                        session,
                        clock=clock,
                    ).enqueue(
                        user_id=owner_id,
                        agent_id="example-agent",
                        prompt_id="example-prompt",
                        prompt_version="1",
                        output_schema_id="different-output",
                        model="different-model",
                        payload={"roleId": uuid4(), "profileVersion": 99},
                        idempotency_key="concurrent-claim",
                        max_attempts=9,
                    )
                assert duplicate.id == succeeded.id
                assert duplicate.status == AgentRunStatus.SUCCEEDED
                assert duplicate.attempt_count == 1
                assert duplicate.result == succeeded.result
                assert duplicate.output_schema_id == "example-output-v1"

                async def concurrent_enqueue():
                    async with database.sessionmaker() as session:
                        return await AgentRunService(
                            session,
                            clock=clock,
                        ).enqueue(
                            user_id=owner_id,
                            agent_id="concurrent-agent",
                            prompt_id="example-prompt",
                            prompt_version="1",
                            output_schema_id="example-output-v1",
                            model="queued-model",
                            payload={"roleId": uuid4(), "profileVersion": 3},
                            idempotency_key="same-key",
                            max_attempts=2,
                        )

                enqueue_results = await asyncio.gather(
                    concurrent_enqueue(),
                    concurrent_enqueue(),
                )
                assert enqueue_results[0].id == enqueue_results[1].id
                async with database.sessionmaker() as session:
                    duplicate_count = await session.scalar(
                        select(func.count())
                        .select_from(AgentRun)
                        .where(
                            AgentRun.user_id == owner_id,
                            AgentRun.agent_id == "concurrent-agent",
                            AgentRun.idempotency_key == "same-key",
                        )
                    )
                    assert duplicate_count == 1
                    duplicate_run = await session.scalar(
                        select(AgentRun).where(
                            AgentRun.id == enqueue_results[0].id
                        )
                    )
                    assert duplicate_run is not None
                    duplicate_run.available_at = clock.now + timedelta(days=2)
                    await session.commit()

                retry_run = await enqueue(
                    database,
                    clock,
                    owner_id,
                    "retry",
                    max_attempts=2,
                )
                async with database.sessionmaker() as session:
                    service = AgentRunService(session, clock=clock)
                    first_attempt = await service.claim_next(
                        lease_owner="retry-worker-1",
                        lease_duration=timedelta(minutes=5),
                    )
                    assert first_attempt is not None
                    assert first_attempt.id == retry_run.id
                    first_token = first_attempt.lease_token
                    retried = await service.mark_failed(
                        run_id=first_attempt.id,
                        lease_token=first_token,
                        error_code="provider_unavailable",
                        retryable=True,
                        retry_delay=timedelta(minutes=10),
                    )
                assert retried.status == AgentRunStatus.QUEUED
                assert retried.available_at == clock.now + timedelta(minutes=10)
                assert retried.finished_at is None
                assert retried.error_code == "provider_unavailable"
                assert retried.lease_token is None

                async with database.sessionmaker() as session:
                    assert (
                        await AgentRunService(
                            session,
                            clock=clock,
                        ).claim_next(
                            lease_owner="too-early",
                            lease_duration=timedelta(minutes=5),
                        )
                        is None
                    )

                clock.now += timedelta(minutes=10)
                async with database.sessionmaker() as session:
                    service = AgentRunService(session, clock=clock)
                    second_attempt = await service.claim_next(
                        lease_owner="retry-worker-2",
                        lease_duration=timedelta(minutes=5),
                    )
                    assert second_attempt is not None
                    assert second_attempt.id == retry_run.id
                    assert second_attempt.attempt_count == 2
                    assert second_attempt.lease_token != first_token
                    exhausted = await service.mark_failed(
                        run_id=second_attempt.id,
                        lease_token=second_attempt.lease_token,
                        error_code="provider_unavailable",
                        retryable=True,
                        retry_delay=timedelta(minutes=10),
                    )
                assert exhausted.status == AgentRunStatus.FAILED
                assert exhausted.finished_at == clock.now
                assert exhausted.error_code == "provider_unavailable"

                non_retryable = await enqueue(
                    database,
                    clock,
                    owner_id,
                    "non-retryable",
                    max_attempts=3,
                )
                async with database.sessionmaker() as session:
                    service = AgentRunService(session, clock=clock)
                    claimed_non_retryable = await service.claim_next(
                        lease_owner="failure-worker",
                        lease_duration=timedelta(minutes=5),
                    )
                    assert claimed_non_retryable is not None
                    assert claimed_non_retryable.id == non_retryable.id
                    failed = await service.mark_failed(
                        run_id=claimed_non_retryable.id,
                        lease_token=claimed_non_retryable.lease_token,
                        error_code="invalid_structured_output",
                        retryable=False,
                        retry_delay=timedelta(0),
                    )
                assert failed.status == AgentRunStatus.FAILED
                assert failed.attempt_count == 1
                assert failed.error_code == "invalid_structured_output"
                assert failed.result is None
                assert "private" not in failed.error_code
                duplicate_failed = await enqueue(
                    database,
                    clock,
                    owner_id,
                    "non-retryable",
                    max_attempts=9,
                )
                assert duplicate_failed.id == failed.id
                assert duplicate_failed.status == AgentRunStatus.FAILED
                assert duplicate_failed.attempt_count == 1
                assert duplicate_failed.error_code == "invalid_structured_output"

                expiring = await enqueue(
                    database,
                    clock,
                    owner_id,
                    "expiring",
                    max_attempts=2,
                )
                async with database.sessionmaker() as session:
                    claimed_expiring = await AgentRunService(
                        session,
                        clock=clock,
                    ).claim_next(
                        lease_owner="expired-worker-1",
                        lease_duration=timedelta(minutes=1),
                    )
                    assert claimed_expiring is not None
                    assert claimed_expiring.id == expiring.id
                    expired_token = claimed_expiring.lease_token

                clock.now += timedelta(minutes=2)
                async with database.sessionmaker() as session:
                    assert (
                        await AgentRunService(
                            session,
                            clock=clock,
                        ).requeue_expired()
                        == 1
                    )
                async with database.sessionmaker() as session:
                    with pytest.raises(AgentRunLeaseError):
                        await AgentRunService(
                            session,
                            clock=clock,
                        ).mark_succeeded(
                            run_id=expiring.id,
                            lease_token=expired_token,
                            result=success_result("stale"),
                        )
                async with database.sessionmaker() as session:
                    reclaimed = await AgentRunService(
                        session,
                        clock=clock,
                    ).claim_next(
                        lease_owner="expired-worker-2",
                        lease_duration=timedelta(minutes=1),
                    )
                assert reclaimed is not None
                assert reclaimed.id == expiring.id
                assert reclaimed.lease_token != expired_token
                assert reclaimed.attempt_count == 2

                clock.now += timedelta(minutes=2)
                async with database.sessionmaker() as session:
                    assert (
                        await AgentRunService(
                            session,
                            clock=clock,
                        ).requeue_expired()
                        == 1
                    )
                async with database.sessionmaker() as session:
                    expired_failed = await session.get(AgentRun, expiring.id)
                    assert expired_failed is not None
                    assert expired_failed.status == AgentRunStatus.FAILED
                    assert expired_failed.error_code == "lease_expired"
                    assert expired_failed.finished_at == clock.now
                    assert expired_failed.lease_token is None

                cascade_run = await enqueue(
                    database,
                    clock,
                    cascade_owner_id,
                    "cascade",
                    available_at=clock.now + timedelta(days=1),
                )
                async with database.sessionmaker() as session:
                    await session.execute(
                        delete(User).where(User.id == cascade_owner_id)
                    )
                    await session.commit()
                async with database.sessionmaker() as session:
                    assert await session.get(AgentRun, cascade_run.id) is None

                async with database.sessionmaker() as session:
                    invalid_attempts = AgentRun(
                        user_id=owner_id,
                        agent_id="invalid-agent",
                        prompt_id="example-prompt",
                        prompt_version="1",
                        output_schema_id="example-output-v1",
                        status=AgentRunStatus.QUEUED,
                        payload={"roleId": str(uuid4())},
                        idempotency_key="invalid-attempts",
                        attempt_count=0,
                        max_attempts=0,
                        available_at=clock.now,
                        model="queued-model",
                    )
                    session.add(invalid_attempts)
                    with pytest.raises(IntegrityError):
                        await session.commit()
                    await session.rollback()

                async with database.sessionmaker() as session:
                    invalid_status = AgentRun(
                        user_id=owner_id,
                        agent_id="invalid-agent",
                        prompt_id="example-prompt",
                        prompt_version="1",
                        output_schema_id="example-output-v1",
                        status="invalid",  # type: ignore[arg-type]
                        payload={"roleId": str(uuid4())},
                        idempotency_key="invalid-status",
                        attempt_count=0,
                        max_attempts=1,
                        available_at=clock.now,
                        model="queued-model",
                    )
                    session.add(invalid_status)
                    with pytest.raises(StatementError):
                        await session.commit()
                    await session.rollback()
            finally:
                await database.drop_tables()

    asyncio.run(run())
