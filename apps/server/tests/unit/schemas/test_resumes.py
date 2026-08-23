from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import TypeAdapter, ValidationError

from riva.schemas.resumes import (
    FailedResumeDocumentResponse,
    PendingResumeDocumentResponse,
    ResumeDocumentResponse,
    ResumeDocumentsResponse,
    SucceededResumeDocumentResponse,
)

NOW = datetime(2026, 8, 5, tzinfo=UTC)


def common_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "id": str(uuid4()),
        "sourceType": "file",
        "originalFilename": "resume.pdf",
        "mediaType": "application/pdf",
        "byteSize": 10,
        "uploadedAt": NOW,
    }
    payload.update(overrides)
    return payload


def validate_response(payload: dict[str, object]):
    return TypeAdapter(ResumeDocumentResponse).validate_python(payload)


def test_pending_succeeded_and_failed_shapes_are_discriminated() -> None:
    pending = validate_response(common_payload(extractionStatus="pending"))
    succeeded = validate_response(
        common_payload(extractionStatus="succeeded", extractedAt=NOW)
    )
    failed = validate_response(
        common_payload(
            extractionStatus="failed",
            extractedAt=NOW,
            failureReason="safe failure reason",
        )
    )

    assert isinstance(pending, PendingResumeDocumentResponse)
    assert isinstance(succeeded, SucceededResumeDocumentResponse)
    assert isinstance(failed, FailedResumeDocumentResponse)
    assert pending.extracted_at is None
    assert succeeded.failure_reason is None


@pytest.mark.parametrize(
    "payload",
    [
        common_payload(extractionStatus="pending", extractedAt=NOW),
        common_payload(extractionStatus="succeeded"),
        common_payload(
            extractionStatus="succeeded",
            extractedAt=NOW,
            failureReason="must be null",
        ),
        common_payload(extractionStatus="failed", extractedAt=NOW),
    ],
)
def test_invalid_status_specific_shapes_are_rejected(payload) -> None:
    with pytest.raises(ValidationError):
        validate_response(payload)


def test_response_is_camel_case_and_forbids_sensitive_or_extra_fields() -> None:
    response = ResumeDocumentsResponse.model_validate(
        {"documents": [common_payload(extractionStatus="succeeded", extractedAt=NOW)]}
    )
    serialized = response.model_dump_json(by_alias=True)

    assert "sourceType" in serialized
    assert "extractionStatus" in serialized
    assert "byteSize" in serialized
    for sensitive_field in (
        "userId",
        "sha256",
        "storageKey",
        "extractedText",
        "extractionFailureCode",
        "internalExecution",
        "provider",
        "token",
    ):
        assert sensitive_field not in serialized

    with pytest.raises(ValidationError):
        ResumeDocumentsResponse.model_validate(
            {"documents": [common_payload(extractionStatus="pending", extraField="no")]}
        )


def test_byte_size_must_be_positive_and_original_filename_can_be_null() -> None:
    with pytest.raises(ValidationError):
        validate_response(common_payload(extractionStatus="pending", byteSize=0))

    response = validate_response(
        common_payload(
            sourceType="pastedText",
            originalFilename=None,
            mediaType="text/plain",
            extractionStatus="succeeded",
            extractedAt=NOW,
        )
    )
    assert response.original_filename is None
