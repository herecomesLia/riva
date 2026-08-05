import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pytest

from riva.models import (
    ResumeDocument,
    ResumeImportDraft,
    ResumeParsingResult,
    User,
)
from riva.schemas.resume_parsing import ResumeParsingOutput
from riva.services.resume_imports import (
    ResumeImportDraftService,
    ResumeImportStateError,
)


NOW = datetime(2026, 8, 5, 12, 0, tzinfo=UTC)


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


def output() -> ResumeParsingOutput:
    return ResumeParsingOutput(
        summary="Parsed summary",
        education=[
            {
                "school": "Example University",
                "degree": "BSc",
                "major": "CS",
                "start_date": "2020-09",
                "end_date": "2024-06",
                "is_current": False,
            }
        ],
        work_experiences=[],
        project_experiences=[],
        skills=["Python"],
        unresolved_items=[],
    )


def graph() -> tuple[UUID, ResumeDocument, ResumeParsingResult]:
    user_id = UUID("11111111-1111-4111-8111-111111111111")
    document_id = UUID("22222222-2222-4222-8222-222222222222")
    source_run_id = UUID("33333333-3333-4333-8333-333333333333")
    document = ResumeDocument(
        id=document_id,
        user_id=user_id,
        source_type="pastedText",
        original_filename=None,
        media_type="text/plain",
        byte_size=1,
        sha256="a" * 64,
        storage_key=None,
        extraction_status="succeeded",
        extracted_text="Resume",
        extraction_failure_code=None,
        uploaded_at=NOW,
        extracted_at=NOW,
        parsing_run_id=source_run_id,
        created_at=NOW,
        updated_at=NOW,
    )
    parsed = output().model_dump(mode="json")
    result = ResumeParsingResult(
        resume_document_id=document_id,
        user_id=user_id,
        result_version=4,
        source_agent_run_id=source_run_id,
        parsed_at=NOW,
        summary=parsed["summary"],
        education=parsed["education"],
        work_experiences=parsed["work_experiences"],
        project_experiences=parsed["project_experiences"],
        skills=parsed["skills"],
        unresolved_items=parsed["unresolved_items"],
    )
    return user_id, document, result


def empty_profile(user_id: UUID, *, version: int = 1):
    from riva.models import CareerProfile

    return CareerProfile(
        profile_id=uuid4(),
        user_id=user_id,
        summary=None,
        version=version,
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=[],
    )


def existing_draft(
    user_id: UUID,
    document_id: UUID,
    source_run_id: UUID,
    *,
    profile_id: UUID | None = None,
    profile_version: int | None = None,
    status: str = "ready",
) -> ResumeImportDraft:
    return ResumeImportDraft(
        resume_document_id=document_id,
        user_id=user_id,
        parsing_result_version=4,
        source_agent_run_id=source_run_id,
        base_profile_id=profile_id,
        base_profile_version=profile_version,
        draft_version=2,
        status=status,
        summary="Old",
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


def test_build_draft_creates_internal_json_and_uses_lock_order() -> None:
    user_id, document, result = graph()
    session = ScriptedSession(
        user_id,
        document,
        result,
        None,
        None,
        None,
    )

    draft = asyncio.run(
        ResumeImportDraftService(session, clock=lambda: NOW).build_draft(
            user_id=user_id,
            resume_document_id=document.id,
        )
    )

    assert draft.draft_version == 1
    assert draft.status == "ready"
    assert draft.parsing_result_version == result.result_version
    assert draft.source_agent_run_id == result.source_agent_run_id
    assert draft.education[0]["start_date"] == "2020-09"
    assert "startDate" not in draft.education[0]
    assert session.added == [draft]
    assert session.commit_count == 1
    assert session.rollback_count == 0
    assert len(session.statements) == 6
    assert all("FOR UPDATE" in str(statement) for statement in session.statements)


def test_same_ready_source_is_idempotent_and_applied_source_does_not_reopen() -> None:
    user_id, document, result = graph()
    ready = existing_draft(user_id, document.id, result.source_agent_run_id)
    session = ScriptedSession(user_id, document, result, None, ready)
    service = ResumeImportDraftService(
        session,
        clock=lambda: (_ for _ in ()).throw(AssertionError("clock called")),
    )

    returned = asyncio.run(
        service.build_draft(
            user_id=user_id,
            resume_document_id=document.id,
        )
    )
    assert returned is ready
    assert ready.draft_version == 2
    assert session.commit_count == 1
    assert len(session.statements) == 5

    applied = existing_draft(
        user_id,
        document.id,
        result.source_agent_run_id,
        status="applied",
    )
    applied.applied_profile_version = 5
    applied.applied_at = NOW
    session = ScriptedSession(user_id, document, result, None, applied)
    returned = asyncio.run(
        ResumeImportDraftService(
            session,
            clock=lambda: (_ for _ in ()).throw(AssertionError("clock called")),
        ).build_draft(
            user_id=user_id,
            resume_document_id=document.id,
        )
    )
    assert returned is applied
    assert applied.status == "applied"
    assert applied.draft_version == 2


def test_profile_version_change_rebuilds_without_mutating_profile() -> None:
    user_id, document, result = graph()
    profile = empty_profile(user_id, version=3)
    draft = existing_draft(
        user_id,
        document.id,
        result.source_agent_run_id,
        profile_id=profile.profile_id,
        profile_version=2,
    )
    snapshot = (profile.summary, profile.version, list(profile.education))
    session = ScriptedSession(user_id, document, result, profile, draft, None)

    rebuilt = asyncio.run(
        ResumeImportDraftService(session, clock=lambda: NOW).build_draft(
            user_id=user_id,
            resume_document_id=document.id,
        )
    )

    assert rebuilt is draft
    assert rebuilt.draft_version == 3
    assert rebuilt.base_profile_version == 3
    assert rebuilt.status == "ready"
    assert (profile.summary, profile.version, list(profile.education)) == snapshot


@pytest.mark.parametrize(
    ("mutation", "code"),
    [
        ("pointer", "resume_parsing_result_superseded"),
        ("json", "resume_parsing_result_invalid"),
    ],
)
def test_invalid_result_state_rolls_back_without_content_in_error(
    mutation: str,
    code: str,
) -> None:
    user_id, document, result = graph()
    if mutation == "pointer":
        document.parsing_run_id = uuid4()
    else:
        result.education = [{"unexpected": "value"}]
    session = ScriptedSession(user_id, document, result)

    with pytest.raises(ResumeImportStateError) as exc_info:
        asyncio.run(
            ResumeImportDraftService(session).build_draft(
                user_id=user_id,
                resume_document_id=document.id,
            )
        )
    assert exc_info.value.code == code
    assert str(exc_info.value) == ResumeImportStateError.safe_message
    assert "Resume" not in str(exc_info.value)
    assert session.rollback_count == 1


def test_naive_clock_and_commit_failure_roll_back() -> None:
    user_id, document, result = graph()
    session = ScriptedSession(user_id, document, result, None, None, None)
    with pytest.raises(ValueError, match="timezone-aware"):
        asyncio.run(
            ResumeImportDraftService(
                session,
                clock=lambda: datetime(2026, 8, 5, 12, 0),
            ).build_draft(
                user_id=user_id,
                resume_document_id=document.id,
            )
        )
    assert session.rollback_count == 1

    session = ScriptedSession(
        user_id,
        document,
        result,
        None,
        None,
        None,
        commit_error=RuntimeError("commit failed"),
    )
    with pytest.raises(RuntimeError, match="commit failed"):
        asyncio.run(
            ResumeImportDraftService(session, clock=lambda: NOW).build_draft(
                user_id=user_id,
                resume_document_id=document.id,
            )
        )
    assert session.rollback_count == 1

