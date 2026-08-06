import asyncio
import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from riva.db.database import Database
from riva.models import (
    AgentRun,
    AgentRunStatus,
    ResumeDocument,
    ResumeParsingResult,
    User,
)
from riva.prompts import RESUME_PARSING_PROMPT_V1
from riva.schemas.resume_parsing import ResumeParsingOutput
from riva.services.resume_import_api import ResumeImportAPIService


pytestmark = pytest.mark.integration
NOW = datetime(2026, 8, 6, 12, 0, tzinfo=UTC)


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def output() -> ResumeParsingOutput:
    return ResumeParsingOutput(
        summary="Parsed summary",
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=[],
        unresolved_items=[],
    )


async def seed(database: Database) -> tuple[UUID, UUID]:
    user_id = uuid4()
    document_id = uuid4()
    run_id = uuid4()
    parsed = output()
    user = User(
        id=user_id,
        username=f"import-api-{user_id.hex[:12]}",
        normalized_username=f"import-api-{user_id.hex[:12]}",
        password_hash="hash",
        display_name="Import API Test",
    )
    run = AgentRun(
        id=run_id,
        user_id=user_id,
        agent_id="resume-parser",
        prompt_id=RESUME_PARSING_PROMPT_V1.prompt_id,
        prompt_version=RESUME_PARSING_PROMPT_V1.version,
        output_schema_id=RESUME_PARSING_PROMPT_V1.output_schema_id,
        status=AgentRunStatus.SUCCEEDED,
        payload={"resumeDocumentId": str(document_id)},
        idempotency_key=f"import-api-{uuid4()}",
        attempt_count=1,
        max_attempts=3,
        model="test-model",
        started_at=NOW,
        finished_at=NOW,
        provider="test-provider",
        input_tokens=1,
        output_tokens=1,
        result=parsed.model_dump(mode="json", by_alias=False),
        created_at=NOW,
        updated_at=NOW,
    )
    document = ResumeDocument(
        id=document_id,
        user_id=user_id,
        source_type="pastedText",
        original_filename=None,
        media_type="text/plain",
        byte_size=1,
        sha256=(document_id.hex * 2)[:64],
        storage_key=None,
        extraction_status="succeeded",
        extracted_text="Resume text",
        extraction_failure_code=None,
        uploaded_at=NOW,
        extracted_at=NOW,
        parsing_run_id=run_id,
        created_at=NOW,
        updated_at=NOW,
    )
    values = parsed.model_dump(mode="json", by_alias=False)
    result = ResumeParsingResult(
        resume_document_id=document_id,
        user_id=user_id,
        result_version=1,
        source_agent_run_id=run_id,
        parsed_at=NOW,
        summary=values["summary"],
        education=values["education"],
        work_experiences=values["work_experiences"],
        project_experiences=values["project_experiences"],
        skills=values["skills"],
        unresolved_items=values["unresolved_items"],
    )
    async with database.sessionmaker() as session:
        session.add_all([user, run, document, result])
        await session.commit()
    return user_id, document_id


def test_api_first_apply_and_repeated_apply_are_consistent() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                user_id, document_id = await seed(database)

                async with database.sessionmaker() as session:
                    api = ResumeImportAPIService(session)
                    ready = await api.get_draft(
                        user_id=user_id,
                        resume_document_id=document_id,
                    )
                    assert ready.status == "ready"
                    assert ready.can_apply is True
                    assert ready.summary == "Parsed summary"

                async with database.sessionmaker() as session:
                    applied = await ResumeImportAPIService(session).apply_draft(
                        user_id=user_id,
                        resume_document_id=document_id,
                        draft_version=ready.draft_version,
                    )
                    assert applied.profile_created is True
                    assert applied.profile_changed is True
                    assert applied.draft.status == "applied"
                    assert applied.profile.version == 1

                async with database.sessionmaker() as session:
                    replayed = await ResumeImportAPIService(session).apply_draft(
                        user_id=user_id,
                        resume_document_id=document_id,
                        draft_version=ready.draft_version,
                    )
                    assert replayed.profile_created is False
                    assert replayed.profile_changed is False
                    assert replayed.draft.status == "applied"

                async with database.sessionmaker() as session:
                    current = await ResumeImportAPIService(session).get_draft(
                        user_id=user_id,
                        resume_document_id=document_id,
                    )
                    assert current.status == "applied"
                    assert current.can_apply is False
                    assert current.summary == "Parsed summary"
            finally:
                await database.reset()

    asyncio.run(run_test())
