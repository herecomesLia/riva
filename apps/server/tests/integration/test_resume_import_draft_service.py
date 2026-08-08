import asyncio
import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from riva.db.database import Database
from riva.models import (
    AgentRun,
    CareerProfile,
    ResumeDocument,
    ResumeImportDraft,
    ResumeParsingResult,
    User,
)
from riva.prompts import RESUME_PARSING_PROMPT_V2
from riva.schemas.resume_imports import ResumeImportDraftData
from riva.services.resume_imports import (
    ResumeImportDraftService,
    ResumeImportStateError,
)
from riva.utils import utc_now


pytestmark = pytest.mark.integration
NOW = datetime(2026, 8, 5, 12, 0, tzinfo=UTC)


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def seed_graph(suffix: str):
    user_id = uuid4()
    document_id = uuid4()
    user = User(
        id=user_id,
        username=f"import-service-{suffix}",
        normalized_username=f"import-service-{suffix}",
        password_hash="hash",
        display_name="Import Service Test",
    )
    run = AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="resume-parser",
        prompt_id=RESUME_PARSING_PROMPT_V2.prompt_id,
        prompt_version=RESUME_PARSING_PROMPT_V2.version,
        output_schema_id=RESUME_PARSING_PROMPT_V2.output_schema_id,
        payload={"resumeDocumentId": str(document_id)},
        idempotency_key=f"import-service-{suffix}-{uuid4()}",
        max_attempts=3,
        model="test-model",
    )
    document = ResumeDocument(
        id=document_id,
        user_id=user_id,
        source_type="pastedText",
        original_filename=None,
        media_type="text/plain",
        byte_size=1,
        sha256=(str(document_id).replace("-", "") + "0" * 64)[:64],
        storage_key=None,
        extraction_status="succeeded",
        extracted_text="Resume text",
        extraction_failure_code=None,
        uploaded_at=NOW,
        extracted_at=NOW,
        parsing_run_id=run.id,
        created_at=NOW,
        updated_at=NOW,
    )
    result = ResumeParsingResult(
        resume_document_id=document_id,
        user_id=user_id,
        result_version=1,
        source_agent_run_id=run.id,
        parsed_at=NOW,
        summary="Parsed summary",
        education=[
            {
                "school": "Example University",
                "degree": None,
                "major": None,
                "start_date": "2020",
                "end_date": "2024-06",
                "is_current": False,
            }
        ],
        work_experiences=[],
        project_experiences=[],
        skills=["Python"],
        unresolved_items=["Confirm certification"],
    )
    return user, run, document, result


async def seed(database: Database, suffix: str):
    user, run, document, result = seed_graph(suffix)
    async with database.sessionmaker() as session:
        session.add_all([user, run, document, result])
        await session.commit()
    return user, run, document, result


def test_service_persists_skips_and_is_idempotent_after_reload() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            user, agent_run, document, result = await seed(database, "basic")
            user_id = user.id
            document_id = document.id
            source_agent_run_id = agent_run.id

            async with database.sessionmaker() as session:
                draft = await ResumeImportDraftService(
                    session,
                    clock=lambda: NOW,
                ).build_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                )
                assert draft.draft_version == 1
                assert draft.status == "ready"
                assert draft.source_agent_run_id == source_agent_run_id
                assert draft.skipped_items[0]["reasons"] == [
                    "start_date_precision_insufficient"
                ]
                first_updated_at = draft.updated_at

            async with database.sessionmaker() as session:
                second = await ResumeImportDraftService(
                    session,
                    clock=lambda: (_ for _ in ()).throw(
                        AssertionError("idempotent path called clock")
                    ),
                ).build_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                )
                assert second.draft_version == 1
                assert second.updated_at == first_updated_at
                parsed = ResumeImportDraftData.model_validate(
                    {
                        "summary": second.summary,
                        "summary_action": second.summary_action,
                        "education": second.education,
                        "work_experiences": second.work_experiences,
                        "project_experiences": second.project_experiences,
                        "skills": second.skills,
                        "unresolved_items": second.unresolved_items,
                        "skipped_items": second.skipped_items,
                        "protected_items": second.protected_items,
                        "change_summary": second.change_summary,
                    }
                )
                assert parsed.unresolved_items == ["Confirm certification"]

    asyncio.run(run())


def test_first_import_applied_draft_stays_applied_after_profile_creation() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            user, _, document, _ = await seed(database, "applied-first")
            user_id = user.id
            document_id = document.id
            profile_id = uuid4()

            async with database.sessionmaker() as session:
                draft = await ResumeImportDraftService(
                    session,
                    clock=lambda: NOW,
                ).build_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                )
                assert draft.base_profile_id is None
                assert draft.base_profile_version is None
                before_apply = (
                    draft.draft_version,
                    draft.summary,
                    draft.education,
                    draft.work_experiences,
                    draft.project_experiences,
                    draft.skills,
                    draft.unresolved_items,
                    draft.skipped_items,
                    draft.protected_items,
                    draft.change_summary,
                )

            async with database.sessionmaker() as session:
                session.add(
                    CareerProfile(
                        profile_id=profile_id,
                        user_id=user_id,
                        summary=None,
                        version=1,
                        education=[],
                        work_experiences=[],
                        project_experiences=[],
                        skills=[],
                    )
                )
                stored_draft = await session.get(
                    ResumeImportDraft,
                    document_id,
                )
                assert stored_draft is not None
                stored_draft.status = "applied"
                stored_draft.applied_profile_version = 1
                stored_draft.applied_at = NOW
                await session.commit()

            async with database.sessionmaker() as session:
                returned = await ResumeImportDraftService(
                    session,
                    clock=lambda: (_ for _ in ()).throw(
                        AssertionError("idempotent path called clock")
                    ),
                ).build_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                )
                assert returned.status == "applied"
                assert returned.draft_version == before_apply[0]
                assert returned.base_profile_id is None
                assert returned.base_profile_version is None
                assert returned.applied_profile_version == 1
                assert returned.applied_at == NOW
                assert (
                    returned.draft_version,
                    returned.summary,
                    returned.education,
                    returned.work_experiences,
                    returned.project_experiences,
                    returned.skills,
                    returned.unresolved_items,
                    returned.skipped_items,
                    returned.protected_items,
                    returned.change_summary,
                ) == before_apply

    asyncio.run(run())


def test_existing_applied_draft_stays_applied_until_profile_changes() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            user, _, document, _ = await seed(database, "applied-existing")
            user_id = user.id
            document_id = document.id
            profile_id = uuid4()

            async with database.sessionmaker() as session:
                session.add(
                    CareerProfile(
                        profile_id=profile_id,
                        user_id=user_id,
                        summary="Existing",
                        version=3,
                        education=[],
                        work_experiences=[],
                        project_experiences=[],
                        skills=[],
                    )
                )
                await session.commit()

            async with database.sessionmaker() as session:
                draft = await ResumeImportDraftService(
                    session,
                    clock=lambda: NOW,
                ).build_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                )
                assert draft.base_profile_id == profile_id
                assert draft.base_profile_version == 3

            async with database.sessionmaker() as session:
                stored_profile = await session.get(CareerProfile, profile_id)
                stored_draft = await session.get(
                    ResumeImportDraft,
                    document_id,
                )
                assert stored_profile is not None
                assert stored_draft is not None
                stored_profile.version = 4
                stored_draft.status = "applied"
                stored_draft.applied_profile_version = 4
                stored_draft.applied_at = NOW
                await session.commit()

            async with database.sessionmaker() as session:
                applied = await ResumeImportDraftService(
                    session,
                    clock=lambda: (_ for _ in ()).throw(
                        AssertionError("applied idempotent path called clock")
                    ),
                ).build_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                )
                assert applied.status == "applied"
                assert applied.draft_version == 1
                assert applied.base_profile_id == profile_id
                assert applied.base_profile_version == 3
                assert applied.applied_profile_version == 4
                assert applied.applied_at == NOW

            async with database.sessionmaker() as session:
                stored_profile = await session.get(CareerProfile, profile_id)
                assert stored_profile is not None
                stored_profile.version = 5
                await session.commit()

            async with database.sessionmaker() as session:
                rebuilt = await ResumeImportDraftService(
                    session,
                    clock=lambda: NOW,
                ).build_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                )
                assert rebuilt.status == "ready"
                assert rebuilt.draft_version == 2
                assert rebuilt.base_profile_id == profile_id
                assert rebuilt.base_profile_version == 5
                assert rebuilt.applied_profile_version is None
                assert rebuilt.applied_at is None

    asyncio.run(run())


def test_profile_version_change_rebuilds_and_profile_rows_remain_unchanged() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            user, _, document, _ = await seed(database, "profile")
            user_id = user.id
            document_id = document.id
            profile_id = uuid4()
            profile = CareerProfile(
                profile_id=profile_id,
                user_id=user_id,
                summary="Existing",
                version=1,
                education=[],
                work_experiences=[],
                project_experiences=[],
                skills=[],
            )
            async with database.sessionmaker() as session:
                session.add(profile)
                await session.commit()

            async with database.sessionmaker() as session:
                first = await ResumeImportDraftService(
                    session,
                    clock=lambda: NOW,
                ).build_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                )
                assert first.base_profile_id == profile_id
                assert first.base_profile_version == 1

            async with database.sessionmaker() as session:
                stored_profile = await session.get(CareerProfile, profile_id)
                assert stored_profile is not None
                stored_profile.version = 2
                await session.commit()

            async with database.sessionmaker() as session:
                rebuilt = await ResumeImportDraftService(
                    session,
                    clock=lambda: NOW,
                ).build_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                )
                assert rebuilt.draft_version == 2
                assert rebuilt.base_profile_version == 2

            async with database.sessionmaker() as session:
                stored_profile = await session.scalar(
                    select(CareerProfile)
                    .options(
                        selectinload(CareerProfile.education),
                        selectinload(CareerProfile.skills),
                        selectinload(CareerProfile.work_experiences),
                        selectinload(CareerProfile.project_experiences),
                    )
                    .where(CareerProfile.profile_id == profile_id)
                )
                assert stored_profile is not None
                assert stored_profile.summary == "Existing"
                assert stored_profile.version == 2
                assert stored_profile.education == []
                assert stored_profile.work_experiences == []
                assert stored_profile.project_experiences == []
                assert stored_profile.skills == []

    asyncio.run(run())


def test_two_sessions_build_one_draft_without_spurious_version_increment() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            user, _, document, _ = await seed(database, "concurrent")
            user_id = user.id
            document_id = document.id

            async def build_once():
                async with database.sessionmaker() as session:
                    return await ResumeImportDraftService(
                        session,
                        clock=lambda: NOW,
                    ).build_draft(
                        user_id=user_id,
                        resume_document_id=document_id,
                    )

            first, second = await asyncio.gather(build_once(), build_once())
            assert first.draft_version == 1
            assert second.draft_version == 1

            async with database.sessionmaker() as session:
                drafts = (
                    await session.scalars(
                        select(ResumeImportDraft).where(
                            ResumeImportDraft.resume_document_id == document_id
                        )
                    )
                ).all()
                assert len(drafts) == 1
                assert drafts[0].draft_version == 1

    asyncio.run(run())


def test_service_rejects_isolation_superseded_and_invalid_json_transactionally() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            user, _, document, result = await seed(database, "errors")
            user_id = user.id
            document_id = document.id
            source_agent_run_id = result.source_agent_run_id

            async with database.sessionmaker() as session:
                stored_document = await session.get(ResumeDocument, document_id)
                assert stored_document is not None
                stored_document.parsing_run_id = None
                await session.commit()

            async with database.sessionmaker() as session:
                with pytest.raises(ResumeImportStateError) as exc_info:
                    await ResumeImportDraftService(session).build_draft(
                        user_id=user_id,
                        resume_document_id=document_id,
                    )
                assert exc_info.value.code == "resume_parsing_result_superseded"

            async with database.sessionmaker() as session:
                stored_document = await session.get(ResumeDocument, document_id)
                stored_result = await session.get(ResumeParsingResult, document_id)
                assert stored_document is not None
                assert stored_result is not None
                stored_document.parsing_run_id = source_agent_run_id
                stored_result.education = [{"bad": "json"}]
                await session.commit()

            async with database.sessionmaker() as session:
                with pytest.raises(ResumeImportStateError) as exc_info:
                    await ResumeImportDraftService(session).build_draft(
                        user_id=user_id,
                        resume_document_id=document_id,
                    )
                assert exc_info.value.code == "resume_parsing_result_invalid"
                assert await session.scalar(
                    select(ResumeImportDraft.resume_document_id)
                ) is None

            async with database.sessionmaker() as session:
                with pytest.raises(ResumeImportStateError) as exc_info:
                    await ResumeImportDraftService(
                        session,
                        clock=lambda: datetime(2026, 8, 5, 12, 0),
                    ).build_draft(
                        user_id=uuid4(),
                        resume_document_id=document_id,
                    )
                assert exc_info.value.code == "resume_document_not_found"

    asyncio.run(run())
