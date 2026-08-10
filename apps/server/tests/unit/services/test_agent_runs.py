import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from riva.schemas.job_description_parsing import JobDescriptionParsingRunPayload
from riva.schemas.matching_analysis import MatchingAnalysisRunPayload
from riva.schemas.resume_parsing import ResumeParsingRunPayload
from riva.services.agent_runs import AgentRunService, _serialize_payload


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


def test_serialize_payload_accepts_approved_interaction_language_metadata() -> None:
    resume_document_id = uuid4()

    assert _serialize_payload(
        {
            "resumeDocumentId": resume_document_id,
            "interactionLanguage": "zh-CN",
        }
    ) == {
        "resumeDocumentId": str(resume_document_id),
        "interactionLanguage": "zh-CN",
    }


def test_serialize_payload_accepts_resource_snapshot_and_english_metadata() -> None:
    role_id = uuid4()

    assert _serialize_payload(
        {
            "roleId": role_id,
            "jobDescriptionVersion": 2,
            "interactionLanguage": "en",
        }
    ) == {
        "roleId": str(role_id),
        "jobDescriptionVersion": 2,
        "interactionLanguage": "en",
    }


def test_current_agent_payloads_are_accepted_after_alias_serialization() -> None:
    role_id = uuid4()
    profile_id = uuid4()
    resume_document_id = uuid4()
    payloads = [
        ResumeParsingRunPayload(
            resume_document_id=resume_document_id,
            interaction_language="zh-CN",
        ).model_dump(mode="json", by_alias=True),
        JobDescriptionParsingRunPayload(
            role_id=role_id,
            job_description_version=2,
            interaction_language="en",
        ).model_dump(mode="json", by_alias=True),
        MatchingAnalysisRunPayload(
            role_id=role_id,
            profile_id=profile_id,
            profile_version=3,
            job_description_version=2,
            job_description_analysis_version=1,
            interaction_language="en",
        ).model_dump(mode="json", by_alias=True),
    ]

    for payload in payloads:
        assert _serialize_payload(payload) == payload


@pytest.mark.parametrize("language", ["zh", "en-US", "fr", "", 1, True])
def test_serialize_payload_rejects_non_normalized_interaction_language(
    language: object,
) -> None:
    with pytest.raises(ValueError, match="supported interaction language"):
        _serialize_payload(
            {
                "resumeDocumentId": uuid4(),
                "interactionLanguage": language,  # type: ignore[dict-item]
            }
        )


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"resumeText": "private resume content"},
        {"jobDescription": "private job description"},
        {"prompt": "private prompt"},
        {"resumeDocumentId": uuid4(), "arbitraryMetadata": "anything"},
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


def test_requeue_expired_rejects_invalid_batch_size() -> None:
    session = ValidationSession()
    service = AgentRunService(session)  # type: ignore[arg-type]

    with pytest.raises(ValueError, match="batch_size must be positive"):
        asyncio.run(service.requeue_expired(batch_size=0))

    assert session.rollback_count == 1
