import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pytest

from riva.core.errors import APIError
from riva.models import (
    AgentRun,
    AgentRunStatus,
    ResumeDocument,
    ResumeImportDraft,
    ResumeParsingResult,
    User,
)
from riva.prompts import RESUME_PARSING_PROMPT_V1, RESUME_PARSING_PROMPT_V2
from riva.schemas.resume_parsing import ResumeParsingOutput
from riva.services.resume_parsing_lifecycle import (
    RESUME_DOCUMENT_NOT_READY,
    RESUME_DOCUMENT_TEXT_MISSING,
    RESUME_IMPORT_DRAFT_INVALID,
    RESUME_PARSING_NOT_STARTED,
    RESUME_PARSING_RETRY_REQUIRED,
    RESUME_PARSING_STATE_CONFLICT,
    RESUME_PARSING_UNAVAILABLE,
    ResumeParsingLifecycleService,
)


NOW = datetime(2026, 8, 6, 12, 0, tzinfo=UTC)
USER_ID = UUID("11111111-1111-4111-8111-111111111111")
DOCUMENT_ID = UUID("22222222-2222-4222-8222-222222222222")


class ScriptedSession:
    def __init__(self, *scalar_values: object, commit_error: Exception | None = None):
        self.scalar_values = list(scalar_values)
        self.statements: list[Any] = []
        self.commit_error = commit_error
        self.commit_count = 0
        self.rollback_count = 0

    async def scalar(self, statement: Any) -> object:
        self.statements.append(statement)
        if not self.scalar_values:
            raise AssertionError("unexpected scalar query")
        return self.scalar_values.pop(0)

    async def commit(self) -> None:
        if self.commit_error is not None:
            raise self.commit_error
        self.commit_count += 1

    async def rollback(self) -> None:
        self.rollback_count += 1


class EnqueueRecorder:
    def __init__(self, session: object, run: AgentRun, calls: list[dict[str, object]]):
        self.session = session
        self.run = run
        self.calls = calls

    async def enqueue_in_transaction(self, **kwargs: object) -> AgentRun:
        self.calls.append(kwargs)
        return self.run


def make_factory(
    run: AgentRun,
    calls: list[dict[str, object]],
    sessions: list[object],
):
    def factory(session: object) -> EnqueueRecorder:
        sessions.append(session)
        return EnqueueRecorder(session, run, calls)

    return factory


def owner() -> User:
    return User(
        id=USER_ID,
        username="resume-lifecycle",
        normalized_username="resume-lifecycle",
        password_hash="hash",
        display_name="Resume Lifecycle",
    )


def document(
    *,
    parsing_run_id: UUID | None = None,
    text: str | None = "Resume",
) -> ResumeDocument:
    return ResumeDocument(
        id=DOCUMENT_ID,
        user_id=USER_ID,
        source_type="pastedText",
        original_filename=None,
        media_type="text/plain",
        byte_size=1,
        sha256="a" * 64,
        storage_key=None,
        extraction_status="succeeded",
        extracted_text=text,
        extraction_failure_code=None,
        uploaded_at=NOW,
        extracted_at=NOW,
        parsing_run_id=parsing_run_id,
        created_at=NOW,
        updated_at=NOW,
    )


def run(
    document_id: UUID = DOCUMENT_ID,
    *,
    prompt_version: str = RESUME_PARSING_PROMPT_V2.version,
    status: AgentRunStatus = AgentRunStatus.QUEUED,
    run_id: UUID | None = None,
    attempt_count: int = 0,
    error_code: str | None = None,
    output: dict[str, object] | None = None,
) -> AgentRun:
    started_at = None if attempt_count == 0 else NOW
    finished_at = (
        NOW
        if status in (AgentRunStatus.SUCCEEDED, AgentRunStatus.FAILED)
        else None
    )
    return AgentRun(
        id=run_id or uuid4(),
        user_id=USER_ID,
        agent_id="resume-parser",
        prompt_id=RESUME_PARSING_PROMPT_V2.prompt_id,
        prompt_version=prompt_version,
        output_schema_id=RESUME_PARSING_PROMPT_V2.output_schema_id,
        status=status,
        payload={"resumeDocumentId": str(document_id)},
        idempotency_key=f"run-{uuid4()}",
        attempt_count=attempt_count,
        max_attempts=3,
        available_at=NOW,
        started_at=started_at,
        finished_at=finished_at,
        provider="fake" if status == AgentRunStatus.SUCCEEDED else None,
        model="fake-model",
        input_tokens=1 if status == AgentRunStatus.SUCCEEDED else None,
        output_tokens=1 if status == AgentRunStatus.SUCCEEDED else None,
        result=output,
        error_code=error_code,
        created_at=NOW,
        updated_at=NOW,
    )


def parsed_output() -> ResumeParsingOutput:
    return ResumeParsingOutput(
        summary="Parsed summary",
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=[],
        unresolved_items=[],
    )


def result(source_run_id: UUID) -> ResumeParsingResult:
    values = parsed_output().model_dump(mode="json")
    return ResumeParsingResult(
        resume_document_id=DOCUMENT_ID,
        user_id=USER_ID,
        result_version=1,
        source_agent_run_id=source_run_id,
        parsed_at=NOW,
        summary=values["summary"],
        education=values["education"],
        work_experiences=values["work_experiences"],
        project_experiences=values["project_experiences"],
        skills=values["skills"],
        unresolved_items=values["unresolved_items"],
    )


def draft(source_run_id: UUID, *, status: str = "ready") -> ResumeImportDraft:
    return ResumeImportDraft(
        resume_document_id=DOCUMENT_ID,
        user_id=USER_ID,
        parsing_result_version=1,
        source_agent_run_id=source_run_id,
        base_profile_id=None,
        base_profile_version=None,
        draft_version=1,
        status=status,
        summary="Parsed summary",
        summary_action="set",
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=[],
        unresolved_items=[],
        skipped_items=[],
        protected_items=[],
        change_summary={"new_items": 0, "changed_items": 0, "missing_items": 0},
        applied_profile_version=None,
        applied_at=None,
        created_at=NOW,
        updated_at=NOW,
    )


def service(
    session: ScriptedSession,
    *,
    calls: list[dict[str, object]] | None = None,
    next_run: AgentRun | None = None,
    sessions: list[object] | None = None,
    provider: str | None = "qwen",
    model: str | None = "fake-resume-model",
) -> ResumeParsingLifecycleService:
    calls = calls if calls is not None else []
    sessions = sessions if sessions is not None else []
    factory = (
        make_factory(next_run, calls, sessions)
        if next_run is not None
        else None
    )
    kwargs: dict[str, object] = {
        "llm_provider": provider,
        "llm_model": model,
    }
    if factory is not None:
        kwargs["agent_run_service_factory"] = factory
    return ResumeParsingLifecycleService(session, **kwargs)


def assert_api_error(error: pytest.ExceptionInfo[APIError], code: str) -> None:
    assert error.value.status_code == (
        503 if code == RESUME_PARSING_UNAVAILABLE else 409
    )
    assert error.value.error == code


def test_start_enqueues_initial_run_and_sets_pointer_atomically() -> None:
    document_value = document()
    new_run = run()
    session = ScriptedSession(USER_ID, document_value)
    calls: list[dict[str, object]] = []
    sessions: list[object] = []

    response = asyncio.run(
        service(
            session,
            calls=calls,
            next_run=new_run,
            sessions=sessions,
        ).start(user_id=USER_ID, resume_document_id=DOCUMENT_ID)
    )

    assert response.status == "queued"
    assert response.run_id == new_run.id
    assert document_value.parsing_run_id == new_run.id
    assert sessions == [session]
    assert calls[0] == {
        "user_id": USER_ID,
        "agent_id": "resume-parser",
        "prompt_id": RESUME_PARSING_PROMPT_V2.prompt_id,
        "prompt_version": RESUME_PARSING_PROMPT_V2.version,
        "output_schema_id": RESUME_PARSING_PROMPT_V2.output_schema_id,
        "model": "fake-resume-model",
        "payload": {"resumeDocumentId": str(DOCUMENT_ID)},
        "idempotency_key": f"resume-parsing:{DOCUMENT_ID}:initial",
        "max_attempts": 3,
    }
    assert session.commit_count == 1
    assert session.rollback_count == 0
    assert "FOR UPDATE" in str(session.statements[0])
    assert "FOR UPDATE" in str(session.statements[1])


@pytest.mark.parametrize("status", [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING])
def test_start_is_idempotent_for_active_run(status: AgentRunStatus) -> None:
    current = run(
        status=status,
        attempt_count=0 if status == AgentRunStatus.QUEUED else 1,
    )
    document_value = document(parsing_run_id=current.id)
    session = ScriptedSession(USER_ID, document_value, current)

    response = asyncio.run(
        service(session).start(user_id=USER_ID, resume_document_id=DOCUMENT_ID)
    )

    assert response.status == status.value
    assert response.run_id == current.id
    assert document_value.parsing_run_id == current.id
    assert session.commit_count == 1


def test_start_failed_run_requires_explicit_retry() -> None:
    current = run(
        status=AgentRunStatus.FAILED,
        attempt_count=3,
        error_code="provider_timeout",
    )
    session = ScriptedSession(USER_ID, document(parsing_run_id=current.id), current)

    with pytest.raises(APIError) as error:
        asyncio.run(
            service(session).start(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
            )
        )

    assert_api_error(error, RESUME_PARSING_RETRY_REQUIRED)
    assert session.commit_count == 0
    assert session.rollback_count == 1


@pytest.mark.parametrize(
    ("document_value", "provider", "model", "code"),
    [
        (document(), "qwen", "model", None),
        (document(text=None), "qwen", "model", RESUME_DOCUMENT_TEXT_MISSING),
        (document(text="   "), "qwen", "model", RESUME_DOCUMENT_TEXT_MISSING),
        (document(), "qwen", "   ", RESUME_PARSING_UNAVAILABLE),
        (document(), "openai", "model", RESUME_PARSING_UNAVAILABLE),
    ],
)
def test_start_checks_document_and_provider_before_enqueue(
    document_value: ResumeDocument,
    provider: str,
    model: str,
    code: str | None,
) -> None:
    session = ScriptedSession(USER_ID, document_value)

    if code is None:
        document_value.extraction_status = "pending"
        code = RESUME_DOCUMENT_NOT_READY

    with pytest.raises(APIError) as error:
        asyncio.run(
            service(
                session,
                provider=provider,
                model=model,
            ).start(user_id=USER_ID, resume_document_id=DOCUMENT_ID)
        )

    assert_api_error(error, code)
    assert session.rollback_count == 1


def test_retry_creates_new_run_and_supersedes_failed_ready_draft() -> None:
    failed = run(
        status=AgentRunStatus.FAILED,
        attempt_count=3,
        error_code="provider_timeout",
    )
    new_run = run()
    document_value = document(parsing_run_id=failed.id)
    old_result = result(failed.id)
    old_draft = draft(failed.id)
    session = ScriptedSession(USER_ID, document_value, failed, old_result, old_draft)
    calls: list[dict[str, object]] = []

    response = asyncio.run(
        service(session, calls=calls, next_run=new_run).retry(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
        )
    )

    assert response.status == "queued"
    assert document_value.parsing_run_id == new_run.id
    assert failed.status == AgentRunStatus.FAILED
    assert failed.error_code == "provider_timeout"
    assert old_result.result_version == 1
    assert old_result.source_agent_run_id == failed.id
    assert old_draft.status == "superseded"
    assert old_draft.draft_version == 1
    assert old_draft.source_agent_run_id == failed.id
    assert calls[0]["prompt_version"] == RESUME_PARSING_PROMPT_V2.version
    assert calls[0]["idempotency_key"] == (
        f"resume-parsing:{DOCUMENT_ID}:retry:{failed.id}"
    )
    assert session.commit_count == 1


def test_retry_allows_superseded_draft_from_an_earlier_run() -> None:
    run_a_id = uuid4()
    failed_b = run(
        status=AgentRunStatus.FAILED,
        attempt_count=3,
        error_code="provider_timeout",
    )
    run_c = run()
    document_value = document(parsing_run_id=failed_b.id)
    old_result = result(run_a_id)
    old_draft = draft(run_a_id, status="superseded")
    old_draft.summary = "Original draft"
    old_draft.skills = [{"id": str(uuid4()), "name": "Python"}]
    old_draft.applied_profile_version = None
    old_draft.applied_at = None
    draft_snapshot = {
        "source_agent_run_id": old_draft.source_agent_run_id,
        "draft_version": old_draft.draft_version,
        "status": old_draft.status,
        "summary": old_draft.summary,
        "skills": old_draft.skills.copy(),
        "applied_profile_version": old_draft.applied_profile_version,
        "applied_at": old_draft.applied_at,
    }
    session = ScriptedSession(
        USER_ID,
        document_value,
        failed_b,
        old_result,
        old_draft,
    )
    calls: list[dict[str, object]] = []

    response = asyncio.run(
        service(session, calls=calls, next_run=run_c).retry(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
        )
    )

    assert response.run_id == run_c.id
    assert document_value.parsing_run_id == run_c.id
    assert {
        "source_agent_run_id": old_draft.source_agent_run_id,
        "draft_version": old_draft.draft_version,
        "status": old_draft.status,
        "summary": old_draft.summary,
        "skills": old_draft.skills,
        "applied_profile_version": old_draft.applied_profile_version,
        "applied_at": old_draft.applied_at,
    } == draft_snapshot
    assert old_result.source_agent_run_id == run_a_id
    assert old_result.result_version == 1
    assert len(calls) == 1


def test_retry_allows_result_from_an_earlier_run_without_modifying_it() -> None:
    run_a_id = uuid4()
    failed_b = run(
        status=AgentRunStatus.FAILED,
        attempt_count=3,
        error_code="provider_timeout",
    )
    run_c = run()
    document_value = document(parsing_run_id=failed_b.id)
    old_result = result(run_a_id)
    result_snapshot = {
        "source_agent_run_id": old_result.source_agent_run_id,
        "result_version": old_result.result_version,
        "summary": old_result.summary,
        "skills": old_result.skills.copy(),
    }
    session = ScriptedSession(
        USER_ID,
        document_value,
        failed_b,
        old_result,
        None,
    )

    response = asyncio.run(
        service(session, next_run=run_c).retry(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
        )
    )

    assert response.run_id == run_c.id
    assert {
        "source_agent_run_id": old_result.source_agent_run_id,
        "result_version": old_result.result_version,
        "summary": old_result.summary,
        "skills": old_result.skills,
    } == result_snapshot


def test_retry_rejects_ready_draft_from_another_run() -> None:
    failed = run(
        status=AgentRunStatus.FAILED,
        attempt_count=3,
        error_code="provider_timeout",
    )
    old_draft = draft(uuid4(), status="ready")
    document_value = document(parsing_run_id=failed.id)
    session = ScriptedSession(USER_ID, document_value, failed, None, old_draft)
    calls: list[dict[str, object]] = []

    with pytest.raises(APIError) as error:
        asyncio.run(
            service(session, calls=calls, next_run=run()).retry(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
            )
        )

    assert_api_error(error, RESUME_PARSING_STATE_CONFLICT)
    assert document_value.parsing_run_id == failed.id
    assert old_draft.status == "ready"
    assert calls == []


def test_retry_rejects_applied_draft_without_enqueue() -> None:
    failed = run(
        status=AgentRunStatus.FAILED,
        attempt_count=3,
        error_code="provider_timeout",
    )
    applied = draft(failed.id, status="applied")
    applied.applied_profile_version = 1
    applied.applied_at = NOW
    document_value = document(parsing_run_id=failed.id)
    session = ScriptedSession(USER_ID, document_value, failed, None, applied)
    calls: list[dict[str, object]] = []

    with pytest.raises(APIError) as error:
        asyncio.run(
            service(session, calls=calls, next_run=run()).retry(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
            )
        )

    assert_api_error(error, RESUME_PARSING_STATE_CONFLICT)
    assert document_value.parsing_run_id == failed.id
    assert applied.status == "applied"
    assert calls == []


def test_retry_rejects_invalid_draft_status_without_enqueue() -> None:
    failed = run(
        status=AgentRunStatus.FAILED,
        attempt_count=3,
        error_code="provider_timeout",
    )
    invalid = draft(uuid4(), status="invalid")
    document_value = document(parsing_run_id=failed.id)
    session = ScriptedSession(USER_ID, document_value, failed, None, invalid)
    calls: list[dict[str, object]] = []

    with pytest.raises(APIError) as error:
        asyncio.run(
            service(session, calls=calls, next_run=run()).retry(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
            )
        )

    assert_api_error(error, RESUME_PARSING_STATE_CONFLICT)
    assert document_value.parsing_run_id == failed.id
    assert calls == []


def test_retry_without_start_returns_not_started() -> None:
    session = ScriptedSession(USER_ID, document())

    with pytest.raises(APIError) as error:
        asyncio.run(
            service(session).retry(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
            )
        )

    assert_api_error(error, RESUME_PARSING_NOT_STARTED)


def test_retry_pointer_run_identity_conflict_is_not_not_started() -> None:
    current = run()
    current.agent_id = "other-agent"
    session = ScriptedSession(USER_ID, document(parsing_run_id=current.id), current)

    with pytest.raises(APIError) as error:
        asyncio.run(
            service(session).retry(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
            )
        )

    assert_api_error(error, RESUME_PARSING_STATE_CONFLICT)


def test_status_succeeded_validates_result_and_draft_together() -> None:
    output = parsed_output().model_dump(mode="json")
    current = run(
        status=AgentRunStatus.SUCCEEDED,
        attempt_count=1,
        output=output,
    )
    document_value = document(parsing_run_id=current.id)
    persisted_result = result(current.id)
    persisted_draft = draft(current.id)
    session = ScriptedSession(
        document_value,
        current,
        persisted_result,
        persisted_draft,
    )

    response = asyncio.run(
        service(session).get_status(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
        )
    )

    assert response.status == "succeeded"
    assert response.result_version == 1
    assert response.draft_version == 1
    assert response.draft_status == "ready"
    assert session.commit_count == 0
    assert session.rollback_count == 0


def test_status_keeps_historical_v1_succeeded_run_readable() -> None:
    current = run(
        prompt_version=RESUME_PARSING_PROMPT_V1.version,
        status=AgentRunStatus.SUCCEEDED,
        attempt_count=1,
        output=parsed_output().model_dump(mode="json"),
    )
    session = ScriptedSession(
        document(parsing_run_id=current.id),
        current,
        result(current.id),
        draft(current.id),
    )

    response = asyncio.run(
        service(session).get_status(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
        )
    )

    assert response.status == "succeeded"
    assert response.run_id == current.id


def test_status_hides_partial_artifacts_for_failed_run() -> None:
    current = run(
        status=AgentRunStatus.FAILED,
        attempt_count=3,
        error_code="provider_timeout",
        output=None,
    )
    session = ScriptedSession(
        document(parsing_run_id=current.id),
        current,
        result(current.id),
        draft(current.id),
    )

    response = asyncio.run(
        service(session).get_status(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
        )
    )

    assert response.status == "failed"
    assert response.error_code == "provider_timeout"
    assert response.failure_reason is not None
    assert response.result_version is None
    assert response.draft_version is None
    assert response.draft_status is None


def test_invalid_succeeded_result_is_a_state_conflict() -> None:
    current = run(
        status=AgentRunStatus.SUCCEEDED,
        attempt_count=1,
        output={"summary": "not a complete output"},
    )
    session = ScriptedSession(
        document(parsing_run_id=current.id),
        current,
        result(current.id),
        draft(current.id),
    )

    with pytest.raises(APIError) as error:
        asyncio.run(
            service(session).get_status(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
            )
        )

    assert_api_error(error, RESUME_PARSING_STATE_CONFLICT)


def test_invalid_succeeded_draft_is_reported_as_draft_invalid() -> None:
    output = parsed_output().model_dump(mode="json")
    current = run(
        status=AgentRunStatus.SUCCEEDED,
        attempt_count=1,
        output=output,
    )
    persisted_draft = draft(current.id)
    persisted_draft.skills = [{"invalid": "draft"}]
    session = ScriptedSession(
        document(parsing_run_id=current.id),
        current,
        result(current.id),
        persisted_draft,
    )

    with pytest.raises(APIError) as error:
        asyncio.run(
            service(session).get_status(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
            )
        )

    assert_api_error(error, RESUME_IMPORT_DRAFT_INVALID)


def test_commit_failure_rolls_back() -> None:
    new_run = run()
    session = ScriptedSession(
        USER_ID,
        document(),
        commit_error=RuntimeError("commit failed"),
    )

    with pytest.raises(RuntimeError, match="commit failed"):
        asyncio.run(
            service(session, next_run=new_run).start(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
            )
        )

    assert session.commit_count == 0
    assert session.rollback_count == 1
