import asyncio
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from riva.core.errors import APIError
from riva.models import CareerProfile, ResumeImportDraft
from riva.schemas.resume_parsing_lifecycle import ResumeParsingStatusResponse
from riva.services.resume_import_api import ResumeImportAPIService
from riva.services.resume_import_application import ResumeImportApplicationResult
from riva.services.resume_imports import (
    RESUME_IMPORT_DRAFT_INVALID,
    ResumeImportStateError,
)

NOW = datetime(2026, 8, 6, 12, 0, tzinfo=UTC)
USER_ID = UUID("11111111-1111-4111-8111-111111111111")
DOCUMENT_ID = UUID("22222222-2222-4222-8222-222222222222")
RUN_ID = UUID("33333333-3333-4333-8333-333333333333")


def succeeded_status() -> ResumeParsingStatusResponse:
    return ResumeParsingStatusResponse(
        resume_document_id=DOCUMENT_ID,
        status="succeeded",
        run_id=RUN_ID,
        attempt_count=1,
        max_attempts=3,
        error_code=None,
        failure_reason=None,
        can_retry=False,
        created_at=NOW,
        started_at=NOW,
        finished_at=NOW,
        result_version=1,
        draft_version=1,
        draft_status="ready",
    )


def lifecycle_status(status: str) -> ResumeParsingStatusResponse:
    if status == "notStarted":
        return ResumeParsingStatusResponse(
            resume_document_id=DOCUMENT_ID,
            status=status,
            run_id=None,
            attempt_count=0,
            max_attempts=None,
            error_code=None,
            failure_reason=None,
            can_retry=False,
            created_at=None,
            started_at=None,
            finished_at=None,
            result_version=None,
            draft_version=None,
            draft_status=None,
        )
    if status == "running":
        return ResumeParsingStatusResponse(
            resume_document_id=DOCUMENT_ID,
            status=status,
            run_id=RUN_ID,
            attempt_count=1,
            max_attempts=3,
            error_code=None,
            failure_reason=None,
            can_retry=False,
            created_at=NOW,
            started_at=NOW,
            finished_at=None,
            result_version=None,
            draft_version=None,
            draft_status=None,
        )
    if status == "failed":
        return ResumeParsingStatusResponse(
            resume_document_id=DOCUMENT_ID,
            status=status,
            run_id=RUN_ID,
            attempt_count=1,
            max_attempts=3,
            error_code="provider_timeout",
            failure_reason="Resume parsing failed.",
            can_retry=True,
            created_at=NOW,
            started_at=NOW,
            finished_at=NOW,
            result_version=None,
            draft_version=None,
            draft_status=None,
        )
    return queued_status()


def queued_status() -> ResumeParsingStatusResponse:
    return ResumeParsingStatusResponse(
        resume_document_id=DOCUMENT_ID,
        status="queued",
        run_id=RUN_ID,
        attempt_count=0,
        max_attempts=3,
        error_code=None,
        failure_reason=None,
        can_retry=False,
        created_at=NOW,
        started_at=None,
        finished_at=None,
        result_version=None,
        draft_version=None,
        draft_status=None,
    )


def draft() -> ResumeImportDraft:
    return ResumeImportDraft(
        resume_document_id=DOCUMENT_ID,
        user_id=USER_ID,
        parsing_result_version=1,
        source_agent_run_id=RUN_ID,
        base_profile_id=None,
        base_profile_version=None,
        draft_version=1,
        status="ready",
        summary="Resume summary",
        summary_action="set",
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=[],
        unresolved_items=[],
        skipped_items=[],
        protected_items=[],
        change_summary={
            "new_items": 0,
            "changed_items": 0,
            "missing_items": 0,
        },
        applied_profile_version=None,
        applied_at=None,
        created_at=NOW,
        updated_at=NOW,
    )


def profile() -> CareerProfile:
    return CareerProfile(
        profile_id=uuid4(),
        user_id=USER_ID,
        summary="Resume summary",
        version=1,
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=[],
        updated_at=NOW,
    )


class FakeLifecycle:
    def __init__(
        self,
        response: ResumeParsingStatusResponse,
        *,
        error: BaseException | None = None,
    ) -> None:
        self.response = response
        self.error = error
        self.calls: list[tuple[UUID, UUID]] = []

    async def get_status(self, *, user_id: UUID, resume_document_id: UUID):
        self.calls.append((user_id, resume_document_id))
        if self.error is not None:
            raise self.error
        return self.response


class FakeDraftService:
    def __init__(
        self,
        _session,
        *,
        value: ResumeImportDraft | None = None,
        error: BaseException | None = None,
    ) -> None:
        self.value = value or draft()
        self.error = error
        self.calls: list[tuple[UUID, UUID]] = []

    async def build_draft(self, *, user_id: UUID, resume_document_id: UUID):
        self.calls.append((user_id, resume_document_id))
        if self.error is not None:
            raise self.error
        return self.value


class FakeApplicationService:
    def __init__(
        self,
        _session,
        *,
        result: ResumeImportApplicationResult | None = None,
        error: BaseException | None = None,
    ):
        self.result = result
        self.error = error
        self.calls: list[tuple[UUID, UUID, int]] = []

    async def apply_draft(
        self,
        *,
        user_id: UUID,
        resume_document_id: UUID,
        draft_version: int,
    ) -> ResumeImportApplicationResult:
        self.calls.append((user_id, resume_document_id, draft_version))
        if self.error is not None:
            raise self.error
        assert self.result is not None
        return self.result


class CancelledApplicationService:
    def __init__(self, _session) -> None:
        pass

    async def apply_draft(self, **_kwargs):
        raise asyncio.CancelledError


@pytest.mark.parametrize(
    "status",
    ["notStarted", "queued", "running", "failed"],
)
def test_non_succeeded_lifecycle_never_calls_draft_or_application(
    status: str,
) -> None:
    lifecycle = FakeLifecycle(lifecycle_status(status))
    draft_service = FakeDraftService(None)
    application_service = FakeApplicationService(None)
    service = ResumeImportAPIService(
        object(),
        parsing_lifecycle_service_factory=lambda _session: lifecycle,
        draft_service_factory=lambda session: draft_service,
        application_service_factory=lambda session: application_service,
    )

    with pytest.raises(APIError) as exc_info:
        asyncio.run(
            service.get_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
            )
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.error == "resume_import_draft_not_ready"
    assert draft_service.calls == []
    assert application_service.calls == []

    with pytest.raises(APIError) as apply_exc_info:
        asyncio.run(
            service.apply_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
                draft_version=1,
            )
        )

    assert apply_exc_info.value.status_code == 409
    assert apply_exc_info.value.error == "resume_import_draft_not_ready"
    assert draft_service.calls == []
    assert application_service.calls == []


def test_get_draft_builds_and_converts_the_current_draft() -> None:
    lifecycle = FakeLifecycle(succeeded_status())
    draft_service = FakeDraftService(None)
    service = ResumeImportAPIService(
        object(),
        parsing_lifecycle_service_factory=lambda _session: lifecycle,
        draft_service_factory=lambda session: draft_service,
    )

    response = asyncio.run(
        service.get_draft(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
        )
    )

    assert response.resume_document_id == DOCUMENT_ID
    assert response.summary == "Resume summary"
    assert response.can_apply is True
    assert draft_service.calls == [(USER_ID, DOCUMENT_ID)]


def test_apply_forwards_directly_to_application_service() -> None:
    lifecycle = FakeLifecycle(succeeded_status())
    draft_service = FakeDraftService(None)
    application_service = FakeApplicationService(
        None,
        result=ResumeImportApplicationResult(
            profile=profile(),
            draft=draft(),
            profile_created=True,
            profile_changed=True,
        ),
    )
    service = ResumeImportAPIService(
        object(),
        parsing_lifecycle_service_factory=lambda _session: lifecycle,
        draft_service_factory=lambda session: draft_service,
        application_service_factory=lambda session: application_service,
    )

    response = asyncio.run(
        service.apply_draft(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
            draft_version=1,
        )
    )

    assert response.profile_created is True
    assert response.profile_changed is True
    assert application_service.calls == [(USER_ID, DOCUMENT_ID, 1)]
    assert draft_service.calls == []


def test_invalid_persisted_draft_maps_to_stable_api_error() -> None:
    lifecycle = FakeLifecycle(succeeded_status())
    draft_service = FakeDraftService(
        None,
        error=ResumeImportStateError(RESUME_IMPORT_DRAFT_INVALID),
    )
    service = ResumeImportAPIService(
        object(),
        parsing_lifecycle_service_factory=lambda _session: lifecycle,
        draft_service_factory=lambda session: draft_service,
    )

    with pytest.raises(APIError) as exc_info:
        asyncio.run(
            service.get_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
            )
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.error == RESUME_IMPORT_DRAFT_INVALID
    assert "summary" not in str(exc_info.value)


@pytest.mark.parametrize(
    ("code", "status_code"),
    [
        ("resume_import_draft_not_found", 404),
        ("resume_document_not_found", 404),
        ("resume_import_draft_version_conflict", 409),
        ("resume_import_profile_version_conflict", 409),
        ("resume_import_apply_conflict", 409),
        ("resume_import_profile_invalid", 409),
    ],
)
def test_domain_errors_map_to_stable_api_errors(
    code: str,
    status_code: int,
) -> None:
    lifecycle = FakeLifecycle(succeeded_status())
    application_service = FakeApplicationService(
        None,
        error=ResumeImportStateError(code),  # type: ignore[arg-type]
    )
    draft_service = FakeDraftService(
        None,
        error=ResumeImportStateError(code),  # type: ignore[arg-type]
    )
    service = ResumeImportAPIService(
        object(),
        parsing_lifecycle_service_factory=lambda _session: lifecycle,
        draft_service_factory=lambda session: draft_service,
        application_service_factory=lambda session: application_service,
    )

    if code == "resume_import_draft_not_found":
        operation = service.get_draft(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
        )
    else:
        operation = service.apply_draft(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
            draft_version=1,
        )

    with pytest.raises(APIError) as exc_info:
        asyncio.run(operation)

    assert exc_info.value.status_code == status_code
    assert exc_info.value.error == code


def test_lifecycle_api_error_is_preserved() -> None:
    lifecycle = FakeLifecycle(
        succeeded_status(),
        error=APIError(404, "resume_document_not_found"),
    )
    service = ResumeImportAPIService(
        object(),
        parsing_lifecycle_service_factory=lambda _session: lifecycle,
    )

    with pytest.raises(APIError) as exc_info:
        asyncio.run(
            service.get_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
            )
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.error == "resume_document_not_found"


def test_cancelled_get_is_not_converted_to_domain_error() -> None:
    lifecycle = FakeLifecycle(
        succeeded_status(),
        error=asyncio.CancelledError(),
    )
    service = ResumeImportAPIService(
        object(),
        parsing_lifecycle_service_factory=lambda _session: lifecycle,
    )

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(
            service.get_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
            )
        )


def test_cancelled_apply_is_not_converted_to_domain_error() -> None:
    lifecycle = FakeLifecycle(succeeded_status())
    service = ResumeImportAPIService(
        object(),
        parsing_lifecycle_service_factory=lambda _session: lifecycle,
        application_service_factory=CancelledApplicationService,
    )

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(
            service.apply_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
                draft_version=1,
            )
        )
