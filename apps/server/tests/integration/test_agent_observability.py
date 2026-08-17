import asyncio
from datetime import UTC, datetime, timedelta
import json
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from riva.db.database import Database
from riva.models import AgentRun, AgentRunStatus, User
from riva.services.agent_observability import AgentObservabilityService
from tests.helpers.integration_database import get_integration_database_url


pytestmark = pytest.mark.integration

WINDOW_FROM = datetime(2026, 8, 17, 0, tzinfo=UTC)
WINDOW_TO = WINDOW_FROM + timedelta(hours=1)


def _user(user_id: UUID, username: str) -> User:
    return User(
        id=user_id,
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name=username,
    )


def _run(
    user_id: UUID,
    *,
    agent_id: str,
    suffix: str,
    status: AgentRunStatus,
    created_at: datetime,
    attempt_count: int,
    max_attempts: int,
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
    provider: str | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    error_code: str | None = None,
) -> AgentRun:
    run = AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id=agent_id,
        prompt_id="observability-prompt",
        prompt_version="1",
        output_schema_id="observability-output-v1",
        status=status,
        payload={"secretPayload": "PRIVATE_PAYLOAD_SHOULD_NOT_APPEAR"},
        idempotency_key=f"private-idempotency-{suffix}",
        attempt_count=attempt_count,
        max_attempts=max_attempts,
        available_at=created_at,
        started_at=started_at,
        finished_at=finished_at,
        provider=provider,
        model="observability-model",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        result=(
            {"secretResult": "PRIVATE_RESULT_SHOULD_NOT_APPEAR"}
            if status == AgentRunStatus.SUCCEEDED
            else None
        ),
        error_code=error_code,
        created_at=created_at,
        updated_at=created_at,
    )
    if status == AgentRunStatus.RUNNING:
        run.lease_owner = "observability-worker"
        run.lease_token = uuid4()
        run.lease_expires_at = created_at + timedelta(minutes=5)
    return run


def test_observability_report_filters_safely_and_is_read_only() -> None:
    async def run_test() -> None:
        database_url = get_integration_database_url()
        async with Database(database_url) as database:
            await database.reset()
            try:
                owner_id = uuid4()
                other_user_id = uuid4()
                async with database.sessionmaker() as session:
                    session.add(_user(owner_id, "observability-owner"))
                    session.add(_user(other_user_id, "observability-other"))
                    session.add_all(
                        [
                            _run(
                                owner_id,
                                agent_id="agent-a",
                                suffix="queued",
                                status=AgentRunStatus.QUEUED,
                                created_at=WINDOW_FROM,
                                attempt_count=0,
                                max_attempts=3,
                            ),
                            _run(
                                owner_id,
                                agent_id="agent-a",
                                suffix="retry",
                                status=AgentRunStatus.QUEUED,
                                created_at=WINDOW_FROM + timedelta(minutes=1),
                                attempt_count=1,
                                max_attempts=3,
                                started_at=WINDOW_FROM + timedelta(minutes=1),
                            ),
                            _run(
                                owner_id,
                                agent_id="agent-a",
                                suffix="running",
                                status=AgentRunStatus.RUNNING,
                                created_at=WINDOW_FROM + timedelta(minutes=2),
                                attempt_count=2,
                                max_attempts=3,
                                started_at=WINDOW_FROM + timedelta(minutes=2),
                            ),
                            _run(
                                owner_id,
                                agent_id="agent-a",
                                suffix="success",
                                status=AgentRunStatus.SUCCEEDED,
                                created_at=WINDOW_FROM + timedelta(minutes=3),
                                attempt_count=1,
                                max_attempts=3,
                                started_at=WINDOW_FROM + timedelta(minutes=3),
                                finished_at=WINDOW_FROM + timedelta(minutes=4),
                                provider="provider-a",
                                input_tokens=7,
                                output_tokens=3,
                            ),
                            _run(
                                owner_id,
                                agent_id="agent-a",
                                suffix="failed",
                                status=AgentRunStatus.FAILED,
                                created_at=WINDOW_FROM + timedelta(minutes=5),
                                attempt_count=3,
                                max_attempts=3,
                                started_at=WINDOW_FROM + timedelta(minutes=5),
                                finished_at=WINDOW_FROM + timedelta(minutes=6),
                                error_code="provider_timeout",
                            ),
                            _run(
                                other_user_id,
                                agent_id="agent-z",
                                suffix="other-user",
                                status=AgentRunStatus.SUCCEEDED,
                                created_at=WINDOW_FROM + timedelta(minutes=7),
                                attempt_count=1,
                                max_attempts=1,
                                started_at=WINDOW_FROM + timedelta(minutes=7),
                                finished_at=WINDOW_FROM + timedelta(minutes=8),
                                provider="provider-z",
                                input_tokens=2,
                                output_tokens=1,
                            ),
                            _run(
                                owner_id,
                                agent_id="agent-outside",
                                suffix="outside",
                                status=AgentRunStatus.SUCCEEDED,
                                created_at=WINDOW_FROM - timedelta(minutes=1),
                                attempt_count=1,
                                max_attempts=1,
                                started_at=WINDOW_FROM,
                                finished_at=WINDOW_FROM + timedelta(minutes=1),
                                provider="provider-outside",
                                input_tokens=100,
                                output_tokens=100,
                            ),
                        ]
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    before = {
                        run.id: (
                            run.status,
                            run.updated_at,
                            run.payload,
                            run.result,
                            run.idempotency_key,
                            run.user_id,
                        )
                        for run in (
                            await session.scalars(
                                select(AgentRun).order_by(AgentRun.id)
                            )
                        ).all()
                    }

                async with database.sessionmaker() as session:
                    report = await AgentObservabilityService(session).get_report(
                        window_from=WINDOW_FROM,
                        window_to=WINDOW_TO,
                    )

                assert report.total_runs == 6
                assert report.status_counts.queued == 2
                assert report.status_counts.running == 1
                assert report.status_counts.succeeded == 2
                assert report.status_counts.failed == 1
                assert report.terminal_runs == 3
                assert report.started_runs == 5
                assert report.retried_runs == 2
                assert report.pending_retry_runs == 1
                assert report.exhausted_failure_runs == 1
                assert report.tokens.input_tokens == 9
                assert report.tokens.output_tokens == 4
                assert report.tokens.total_tokens == 13
                assert [item.error_code for item in report.terminal_errors] == [
                    "provider_timeout"
                ]
                assert [item.agent_id for item in report.by_agent] == [
                    "agent-a",
                    "agent-z",
                ]

                owner_report = None
                async with database.sessionmaker() as session:
                    owner_report = await AgentObservabilityService(session).get_report(
                        window_from=WINDOW_FROM,
                        window_to=WINDOW_TO,
                        agent_id="agent-a",
                    )
                assert owner_report.total_runs == 5
                assert [item.agent_id for item in owner_report.by_agent] == [
                    "agent-a"
                ]

                serialized = json.dumps(
                    report.model_dump(mode="json", by_alias=True),
                    ensure_ascii=False,
                )
                assert "PRIVATE_PAYLOAD_SHOULD_NOT_APPEAR" not in serialized
                assert "PRIVATE_RESULT_SHOULD_NOT_APPEAR" not in serialized
                assert "observability-owner" not in serialized
                assert "private-idempotency" not in serialized
                assert "user_id" not in serialized

                async with database.sessionmaker() as session:
                    after = {
                        run.id: (
                            run.status,
                            run.updated_at,
                            run.payload,
                            run.result,
                            run.idempotency_key,
                            run.user_id,
                        )
                        for run in (
                            await session.scalars(
                                select(AgentRun).order_by(AgentRun.id)
                            )
                        ).all()
                    }
                assert after == before
            finally:
                await database.reset()

    asyncio.run(run_test())
