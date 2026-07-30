import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from riva.services.agent_runs import AgentRunService


class ValidationSession:
    def __init__(self) -> None:
        self.rollback_count = 0

    async def rollback(self) -> None:
        self.rollback_count += 1


def enqueue(service: AgentRunService, payload: dict[str, object]):
    return service.enqueue(
        user_id=uuid4(),
        agent_id="test-agent",
        prompt_id="test-prompt",
        prompt_version="1",
        output_schema_id="test-output-v1",
        model="test-model",
        payload=payload,  # type: ignore[arg-type]
        idempotency_key="test-key",
        max_attempts=2,
        available_at=datetime(2026, 7, 30, tzinfo=UTC),
    )


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"resumeText": "private resume content"},
        {"roleId": ["not", "an", "identifier"]},
        {"profileVersion": 0},
    ],
)
def test_enqueue_rejects_payload_that_is_not_resource_snapshot(
    payload: dict[str, object],
) -> None:
    session = ValidationSession()
    service = AgentRunService(session)  # type: ignore[arg-type]

    with pytest.raises(ValueError):
        asyncio.run(enqueue(service, payload))

    assert session.rollback_count == 1


def test_mark_failed_rejects_exception_messages_as_error_codes() -> None:
    session = ValidationSession()
    service = AgentRunService(session)  # type: ignore[arg-type]

    with pytest.raises(ValueError, match="safe stable identifier"):
        asyncio.run(
            service.mark_failed(
                run_id=uuid4(),
                lease_token=uuid4(),
                error_code="Provider failed: private request contents",
                retryable=True,
                retry_delay=timedelta(seconds=1),
            )
        )

    assert session.rollback_count == 1
