import asyncio
from datetime import UTC, datetime
from typing import Any, Callable
from uuid import uuid4

import pytest

from riva.models import AgentRun, ResumeDocument, ResumeParsingResult, User
from riva.prompts import RESUME_PARSING_PROMPT_V1, RESUME_PARSING_PROMPT_V2
from riva.schemas.resume_parsing import ResumeParsingOutput
from riva.services.resume_parsing import (
    INVALID_RESUME_PARSING_RUN,
    RESUME_DOCUMENT_NOT_FOUND,
    RESUME_DOCUMENT_NOT_READY,
    RESUME_DOCUMENT_TEXT_MISSING,
    RESUME_PARSING_RESULT_CONFLICT,
    RESUME_PARSING_SUPERSEDED,
    ResumeParsingService,
    ResumeParsingStateError,
)


NOW = datetime(2026, 8, 5, 10, 30, tzinfo=UTC)


class ScriptedSession:
    def __init__(self, *scalar_values: object, commit_error: Exception | None = None):
        self.scalar_values = list(scalar_values)
        self.statements: list[Any] = []
        self.added: list[object] = []
        self.commit_error = commit_error
        self.commit_count = 0
        self.rollback_count = 0

    async def scalar(self, statement: Any) -> object:
        self.statements.append(statement)
        if not self.scalar_values:
            raise AssertionError("unexpected scalar query")
        return self.scalar_values.pop(0)

    def add(self, value: object) -> None:
        self.added.append(value)

    async def commit(self) -> None:
        if self.commit_error is not None:
            raise self.commit_error
        self.commit_count += 1

    async def rollback(self) -> None:
        self.rollback_count += 1


def graph(
    *,
    prompt_version: str = RESUME_PARSING_PROMPT_V2.version,
    extracted_text: str | None = "姓名不应输出\n负责 Python API。",
) -> tuple[User, ResumeDocument, AgentRun]:
    owner = User(
        id=uuid4(),
        username="resume-parsing-unit",
        normalized_username="resume-parsing-unit",
        password_hash="hash",
        display_name="Resume Parsing Unit",
    )
    run = AgentRun(
        id=uuid4(),
        user_id=owner.id,
        agent_id="resume-parser",
        prompt_id=RESUME_PARSING_PROMPT_V2.prompt_id,
        prompt_version=prompt_version,
        output_schema_id=RESUME_PARSING_PROMPT_V2.output_schema_id,
        payload={"resumeDocumentId": str(uuid4())},
        idempotency_key=f"resume-unit-{uuid4()}",
        max_attempts=3,
        model="test-model",
    )
    document_id = uuid4()
    run.payload["resumeDocumentId"] = str(document_id)
    document = ResumeDocument(
        id=document_id,
        user_id=owner.id,
        source_type="pastedText",
        original_filename=None,
        media_type="text/plain",
        byte_size=1,
        sha256="a" * 64,
        storage_key=None,
        extraction_status="succeeded",
        extracted_text=extracted_text,
        extraction_failure_code=None,
        uploaded_at=NOW,
        extracted_at=NOW,
        created_at=NOW,
        updated_at=NOW,
        parsing_run_id=run.id,
    )
    return owner, document, run


def output(summary: str | None = "Structured resume") -> ResumeParsingOutput:
    return ResumeParsingOutput(
        summary=summary,
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=["Python"],
        unresolved_items=[],
    )


def result(
    owner: User,
    document: ResumeDocument,
    run: AgentRun,
    *,
    source_run_id=None,
) -> ResumeParsingResult:
    return ResumeParsingResult(
        resume_document_id=document.id,
        user_id=owner.id,
        result_version=1,
        source_agent_run_id=source_run_id or run.id,
        parsed_at=NOW,
        summary="Original",
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=["Original"],
        unresolved_items=[],
    )


def invalid_contract_cases() -> list[tuple[str, Callable[[AgentRun], None]]]:
    return [
        ("agent_id", lambda run: setattr(run, "agent_id", "wrong-agent")),
        ("prompt_id", lambda run: setattr(run, "prompt_id", "wrong-prompt")),
        (
            "prompt_version",
            lambda run: setattr(run, "prompt_version", "999"),
        ),
        (
            "output_schema_id",
            lambda run: setattr(run, "output_schema_id", "wrong-schema"),
        ),
        ("payload_missing", lambda run: run.payload.pop("resumeDocumentId")),
        (
            "payload_extra",
            lambda run: run.payload.update({"storageKey": "secret"}),
        ),
        (
            "payload_invalid_uuid",
            lambda run: run.payload.update({"resumeDocumentId": "not-a-uuid"}),
        ),
    ]


def test_load_input_commits_and_preserves_database_text() -> None:
    _, document, run = graph(extracted_text="第一行\n  第二行\t保留")
    session = ScriptedSession(document)

    loaded = asyncio.run(ResumeParsingService(session).load_input(run))

    assert loaded.resume_text == document.extracted_text
    assert session.commit_count == 1
    assert session.rollback_count == 0
    assert len(session.statements) == 1
    assert "FOR UPDATE" not in str(session.statements[0])


@pytest.mark.parametrize("case_name,mutate", invalid_contract_cases())
@pytest.mark.parametrize("operation", ["load", "persist"])
def test_invalid_run_contract_is_safe_and_transactional(
    case_name: str,
    mutate: Callable[[AgentRun], None],
    operation: str,
) -> None:
    _, _, run = graph()
    mutate(run)
    session = ScriptedSession()
    service = ResumeParsingService(session, clock=lambda: NOW)

    with pytest.raises(ResumeParsingStateError) as exc_info:
        if operation == "load":
            asyncio.run(service.load_input(run))
        else:
            asyncio.run(service.persist_success(run, output()))

    assert case_name
    assert exc_info.value.code == INVALID_RESUME_PARSING_RUN
    assert str(exc_info.value) == ResumeParsingStateError.safe_message
    assert session.commit_count == 0
    assert session.rollback_count == 1
    assert session.added == []


@pytest.mark.parametrize("operation", ["load", "persist"])
def test_missing_or_other_user_document_is_not_exposed(
    operation: str,
) -> None:
    _, _, run = graph()
    session = ScriptedSession(None)
    service = ResumeParsingService(session, clock=lambda: NOW)

    with pytest.raises(ResumeParsingStateError) as exc_info:
        if operation == "load":
            asyncio.run(service.load_input(run))
        else:
            asyncio.run(service.persist_success(run, output()))

    assert exc_info.value.code == RESUME_DOCUMENT_NOT_FOUND
    assert str(exc_info.value) == ResumeParsingStateError.safe_message
    assert session.rollback_count == 1


@pytest.mark.parametrize(
    ("attribute", "value", "expected"),
    [
        ("parsing_run_id", uuid4(), RESUME_PARSING_SUPERSEDED),
        ("extraction_status", "pending", RESUME_DOCUMENT_NOT_READY),
        ("extraction_status", "failed", RESUME_DOCUMENT_NOT_READY),
        ("extracted_text", None, RESUME_DOCUMENT_TEXT_MISSING),
        ("extracted_text", "   ", RESUME_DOCUMENT_TEXT_MISSING),
    ],
)
@pytest.mark.parametrize("operation", ["load", "persist"])
def test_document_state_is_revalidated(
    attribute: str,
    value: object,
    expected: str,
    operation: str,
) -> None:
    _, document, run = graph()
    setattr(document, attribute, value)
    session_values = (document,) if operation == "load" else (run.user_id, document, None, None)
    session = ScriptedSession(*session_values)
    service = ResumeParsingService(session, clock=lambda: NOW)

    with pytest.raises(ResumeParsingStateError) as exc_info:
        if operation == "load":
            asyncio.run(service.load_input(run))
        else:
            asyncio.run(service.persist_success(run, output()))

    assert exc_info.value.code == expected
    assert session.commit_count == 0
    assert session.rollback_count == 1
    assert session.added == []


def test_persist_success_locks_user_document_result_in_order_and_copies_json() -> None:
    owner, document, run = graph()
    persisted_output = output()
    session = ScriptedSession(owner.id, document, None, None)

    persisted = asyncio.run(
        ResumeParsingService(session, clock=lambda: NOW).persist_success(
            run,
            persisted_output,
        )
    )

    assert persisted.resume_document_id == document.id
    assert persisted.user_id == owner.id
    assert persisted.result_version == 1
    assert persisted.source_agent_run_id == run.id
    assert persisted.summary == "Structured resume"
    assert persisted.skills == ["Python"]
    assert document.parsing_run_id == run.id
    assert session.commit_count == 1
    assert session.rollback_count == 0
    assert len(session.statements) == 4
    assert all("FOR UPDATE" in str(statement) for statement in session.statements)
    assert len(session.added) == 1

    persisted_output.skills.append("Mutated after persistence")
    assert persisted.skills == ["Python"]


def test_persist_success_preserves_null_summary() -> None:
    owner, document, run = graph(
        extracted_text=(
            "教育经历：某大学，计算机科学，2020-2024。"
            " 工作经历：Example Co，后端工程师，2024-至今。"
            " 项目经历：API Platform。技能：Python。"
            " 求职方向：后端开发工程师。"
        )
    )
    session = ScriptedSession(owner.id, document, None, None)

    persisted = asyncio.run(
        ResumeParsingService(session, clock=lambda: NOW).persist_success(
            run,
            output(None),
        )
    )

    assert persisted.summary is None


def test_persist_success_accepts_historical_v1_run() -> None:
    owner, document, run = graph(prompt_version=RESUME_PARSING_PROMPT_V1.version)
    session = ScriptedSession(owner.id, document, None, None)

    persisted = asyncio.run(
        ResumeParsingService(session, clock=lambda: NOW).persist_success(
            run,
            output(),
        )
    )

    assert persisted.source_agent_run_id == run.id


def test_same_run_persist_is_idempotent_and_does_not_call_clock_or_overwrite() -> None:
    owner, document, run = graph()
    existing = result(owner, document, run)

    def fail_clock() -> datetime:
        raise AssertionError("idempotent path must not call clock")

    session = ScriptedSession(owner.id, document, existing)
    returned = asyncio.run(
        ResumeParsingService(session, clock=fail_clock).persist_success(
            run,
            output("Different output"),
        )
    )

    assert returned is existing
    assert existing.result_version == 1
    assert existing.summary == "Original"
    assert existing.skills == ["Original"]
    assert session.commit_count == 1
    assert session.rollback_count == 0
    assert session.added == []


def test_new_run_overwrites_result_and_increments_version() -> None:
    owner, document, old_run = graph()
    new_run = AgentRun(
        id=uuid4(),
        user_id=owner.id,
        agent_id=old_run.agent_id,
        prompt_id=old_run.prompt_id,
        prompt_version=old_run.prompt_version,
        output_schema_id=old_run.output_schema_id,
        payload=old_run.payload.copy(),
        idempotency_key=f"resume-unit-new-{uuid4()}",
        max_attempts=3,
        model="test-model",
    )
    document.parsing_run_id = new_run.id
    existing = result(owner, document, old_run)
    session = ScriptedSession(owner.id, document, existing, None)

    persisted = asyncio.run(
        ResumeParsingService(session, clock=lambda: NOW).persist_success(
            new_run,
            output("Replacement"),
        )
    )

    assert persisted is existing
    assert persisted.result_version == 2
    assert persisted.source_agent_run_id == new_run.id
    assert persisted.summary == "Replacement"
    assert persisted.skills == ["Python"]
    assert session.commit_count == 1


def test_source_run_conflict_is_rejected_without_moving_result() -> None:
    owner, document, run = graph()
    conflicting = result(owner, document, run)
    conflicting.resume_document_id = uuid4()
    session = ScriptedSession(owner.id, document, None, conflicting)

    with pytest.raises(ResumeParsingStateError) as exc_info:
        asyncio.run(
            ResumeParsingService(session, clock=lambda: NOW).persist_success(
                run,
                output(),
            )
        )

    assert exc_info.value.code == RESUME_PARSING_RESULT_CONFLICT
    assert session.commit_count == 0
    assert session.rollback_count == 1
    assert session.added == []


def test_mutated_output_is_revalidated_before_persistence() -> None:
    owner, document, run = graph()
    invalid_output = output()
    invalid_output.skills = [str(uuid4())]
    session = ScriptedSession(owner.id, document, None, None)

    with pytest.raises(ResumeParsingStateError) as exc_info:
        asyncio.run(
            ResumeParsingService(session, clock=lambda: NOW).persist_success(
                run,
                invalid_output,
            )
        )

    assert exc_info.value.code == INVALID_RESUME_PARSING_RUN
    assert session.statements == []
    assert session.added == []
    assert session.rollback_count == 1


def test_naive_clock_is_rejected_before_write() -> None:
    owner, document, run = graph()
    session = ScriptedSession(owner.id, document, None, None)

    with pytest.raises(ValueError, match="timezone-aware"):
        asyncio.run(
            ResumeParsingService(
                session,
                clock=lambda: datetime(2026, 8, 5, 10, 30),
            ).persist_success(run, output())
        )

    assert session.added == []
    assert session.commit_count == 0
    assert session.rollback_count == 1


def test_commit_failure_rolls_back() -> None:
    owner, document, run = graph()
    session = ScriptedSession(
        owner.id,
        document,
        None,
        None,
        commit_error=RuntimeError("commit failed"),
    )

    with pytest.raises(RuntimeError, match="commit failed"):
        asyncio.run(
            ResumeParsingService(session, clock=lambda: NOW).persist_success(
                run,
                output(),
            )
        )

    assert session.commit_count == 0
    assert session.rollback_count == 1
