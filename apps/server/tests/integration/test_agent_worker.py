import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel
from sqlalchemy import func, select

from riva.agents import AgentResult
from riva.agents.runtime.runs import AgentRunLeaseError, AgentRunService
from riva.db.database import Database
from riva.integrations import LLMUsage
from riva.models import AgentRun, AgentRunStatus, User
from riva.workers import AgentHandlerRegistry, AgentWorker

pytestmark = pytest.mark.integration
START = datetime(2026, 7, 31, 8, tzinfo=UTC)


class MutableClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


class Output(BaseModel):
    value: str


class Handler:
    agent_id = "worker-agent"

    async def execute(self, run: AgentRun) -> AgentResult[Output]:
        return AgentResult(
            output=Output(value=str(run.payload["roleId"])),
            agent_id=self.agent_id,
            prompt_id=run.prompt_id,
            prompt_version=run.prompt_version,
            provider="fake-provider",
            model="fake-model",
            usage=LLMUsage(input_tokens=11, output_tokens=4),
        )


class SilentLogger:
    def info(self, event: str, **fields: object) -> None:
        pass

    def warning(self, event: str, **fields: object) -> None:
        pass


def user(user_id: UUID) -> User:
    return User(
        id=user_id,
        username="agent-worker-user",
        normalized_username="agent-worker-user",
        password_hash="hash",
        display_name="Agent Worker",
    )


async def enqueue(
    database: Database,
    user_id: UUID,
    key: str,
    *,
    clock: MutableClock | None = None,
    agent_id: str = "lease-agent",
) -> AgentRun:
    async with database.sessionmaker() as session:
        return await AgentRunService(
            session,
            clock=clock or MutableClock(START),
        ).enqueue(
            user_id=user_id,
            agent_id=agent_id,
            prompt_id="example-prompt",
            prompt_version="1",
            output_schema_id="example-output-v1",
            model="queued-model",
            payload={"roleId": uuid4(), "profileVersion": 1},
            idempotency_key=key,
            max_attempts=3,
        )


def test_agent_worker_leases_and_expired_batch_recovery() -> None:
    test_database_url = os.getenv("RIVA_TEST_DATABASE_URL")
    if not test_database_url:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")

    development_database_url = os.getenv("RIVA_DATABASE_URL")
    if development_database_url == test_database_url:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")

    async def run() -> None:
        owner_id = uuid4()

        async with Database(test_database_url) as database:
            await database.reset()
            try:
                async with database.sessionmaker() as session:
                    session.add(user(owner_id))
                    await session.commit()

                registry = AgentHandlerRegistry()
                registry.register(Handler())
                runtime = AgentWorker(
                    worker_id="integration-worker",
                    session_factory=database.sessionmaker,
                    registry=registry,
                    lease_duration=timedelta(minutes=10),
                    heartbeat_interval=timedelta(minutes=2),
                    poll_interval=timedelta(seconds=1),
                    requeue_interval=timedelta(minutes=1),
                    retry_base_delay=timedelta(seconds=10),
                    retry_max_delay=timedelta(minutes=1),
                    logger=SilentLogger(),
                )
                assert await runtime.process_one() is False

                worker_run = await enqueue(
                    database,
                    owner_id,
                    "worker-success",
                    clock=MutableClock(datetime.now(UTC)),
                    agent_id="worker-agent",
                )
                assert await runtime.process_one() is True
                async with database.sessionmaker() as session:
                    succeeded = await session.get(AgentRun, worker_run.id)
                    assert succeeded is not None
                    assert succeeded.status == AgentRunStatus.SUCCEEDED
                    assert succeeded.provider == "fake-provider"
                    assert succeeded.model == "fake-model"
                    assert succeeded.input_tokens == 11
                    assert succeeded.output_tokens == 4
                    assert succeeded.result == {"value": worker_run.payload["roleId"]}

                clock = MutableClock(START)
                renewable = await enqueue(
                    database,
                    owner_id,
                    "renewable",
                    clock=clock,
                )
                async with database.sessionmaker() as session:
                    claimed = await AgentRunService(
                        session,
                        clock=clock,
                    ).claim_next(
                        lease_owner="lease-worker-1",
                        lease_duration=timedelta(minutes=10),
                    )
                    assert claimed is not None
                    assert claimed.id == renewable.id
                    original_token = claimed.lease_token
                    original_started_at = claimed.started_at
                    original_attempt_count = claimed.attempt_count

                clock.now += timedelta(minutes=2)
                async with database.sessionmaker() as session:
                    renewed = await AgentRunService(
                        session,
                        clock=clock,
                    ).renew_lease(
                        run_id=renewable.id,
                        lease_token=original_token,
                        lease_duration=timedelta(minutes=20),
                    )
                assert renewed.lease_expires_at == clock.now + timedelta(minutes=20)
                assert renewed.attempt_count == original_attempt_count
                assert renewed.started_at == original_started_at

                async with database.sessionmaker() as session:
                    with pytest.raises(AgentRunLeaseError):
                        await AgentRunService(
                            session,
                            clock=clock,
                        ).renew_lease(
                            run_id=renewable.id,
                            lease_token=uuid4(),
                            lease_duration=timedelta(minutes=20),
                        )

                clock.now = START + timedelta(minutes=11)
                async with database.sessionmaker() as session:
                    assert (
                        await AgentRunService(
                            session,
                            clock=clock,
                        ).requeue_expired()
                        == 0
                    )

                clock.now = START + timedelta(minutes=23)
                async with database.sessionmaker() as session:
                    with pytest.raises(AgentRunLeaseError):
                        await AgentRunService(
                            session,
                            clock=clock,
                        ).renew_lease(
                            run_id=renewable.id,
                            lease_token=original_token,
                            lease_duration=timedelta(minutes=20),
                        )
                async with database.sessionmaker() as session:
                    assert (
                        await AgentRunService(
                            session,
                            clock=clock,
                        ).requeue_expired()
                        == 1
                    )
                async with database.sessionmaker() as session:
                    reclaimed = await AgentRunService(
                        session,
                        clock=clock,
                    ).claim_next(
                        lease_owner="lease-worker-2",
                        lease_duration=timedelta(minutes=10),
                    )
                    assert reclaimed is not None
                    assert reclaimed.id == renewable.id
                    assert reclaimed.lease_token != original_token

                async with database.sessionmaker() as session:
                    with pytest.raises(AgentRunLeaseError):
                        await AgentRunService(
                            session,
                            clock=clock,
                        ).renew_lease(
                            run_id=renewable.id,
                            lease_token=original_token,
                            lease_duration=timedelta(minutes=20),
                        )
                async with database.sessionmaker() as session:
                    await AgentRunService(
                        session,
                        clock=clock,
                    ).mark_failed(
                        run_id=renewable.id,
                        lease_token=reclaimed.lease_token,
                        error_code="test_complete",
                        retryable=False,
                        retry_delay=timedelta(0),
                    )

                batch_runs = [
                    await enqueue(
                        database,
                        owner_id,
                        f"batch-{index}",
                        clock=clock,
                    )
                    for index in range(4)
                ]
                for expected in batch_runs:
                    async with database.sessionmaker() as session:
                        claimed_batch = await AgentRunService(
                            session,
                            clock=clock,
                        ).claim_next(
                            lease_owner="batch-worker",
                            lease_duration=timedelta(minutes=1),
                        )
                        assert claimed_batch is not None
                        assert claimed_batch.id == expected.id

                clock.now += timedelta(minutes=2)

                async def recover() -> int:
                    async with database.sessionmaker() as session:
                        return await AgentRunService(
                            session,
                            clock=clock,
                        ).requeue_expired(batch_size=2)

                recovered = await asyncio.gather(recover(), recover())
                assert recovered == [2, 2]
                async with database.sessionmaker() as session:
                    queued_count = await session.scalar(
                        select(func.count())
                        .select_from(AgentRun)
                        .where(
                            AgentRun.id.in_([run.id for run in batch_runs]),
                            AgentRun.status == AgentRunStatus.QUEUED,
                        )
                    )
                    running_count = await session.scalar(
                        select(func.count())
                        .select_from(AgentRun)
                        .where(
                            AgentRun.id.in_([run.id for run in batch_runs]),
                            AgentRun.status == AgentRunStatus.RUNNING,
                        )
                    )
                    assert queued_count == 4
                    assert running_count == 0
            finally:
                await database.drop_tables()

    asyncio.run(run())
