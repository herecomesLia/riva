import asyncio
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from riva.agents.resume_parsing import ResumeParsingAgent
from riva.core.app import create_app
from riva.core.config import Settings
from riva.core.errors import APIError
from riva.core.security import hash_password
from riva.db.database import Database
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    CareerProfileEducation,
    CareerProfileProjectExperience,
    CareerProfileProjectSkill,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
    ResumeDocument,
    ResumeImportDraft,
    ResumeParsingResult,
    User,
)
from riva.schemas.profile import CareerProfilePutRequest, CareerProfileResponse
from riva.schemas.resume_parsing import ResumeParsingOutput
from riva.services.profile import CareerProfileService
from riva.services.resume_import_api import ResumeImportAPIService
from riva.services.resume_imports import (
    ResumeImportDraftService,
    build_resume_import_draft_data,
)

pytestmark = pytest.mark.integration
NOW = datetime(2026, 8, 6, 12, 0, tzinfo=UTC)
TRUSTED_ORIGIN = "http://localhost:5173"
HTTP_PASSWORD = "Password123!"


@dataclass(frozen=True)
class SeededResume:
    user_id: UUID
    document_id: UUID
    run_id: UUID
    parsed: ResumeParsingOutput


@dataclass(frozen=True)
class ExistingProfileSeed:
    profile_id: UUID
    old_updated_at: datetime
    resume_education_id: UUID
    manual_education_id: UUID
    resume_work_id: UUID
    manual_work_id: UUID
    resume_project_id: UUID
    manual_project_id: UUID
    manual_skill_id: UUID
    work_link_ids: tuple[UUID, ...]
    project_link_ids: tuple[UUID, ...]


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


def rich_output(
    *,
    summary: str = "Imported summary",
    company: str = "New Company",
    project_name: str = "Import Project",
) -> ResumeParsingOutput:
    return ResumeParsingOutput.model_validate(
        {
            "summary": summary,
            "education": [
                {
                    "school": "New University",
                    "degree": "BSc",
                    "major": "Computer Science",
                    "start_date": "2020-09",
                    "end_date": "2024-06",
                    "is_current": False,
                }
            ],
            "work_experiences": [
                {
                    "company": company,
                    "title": "Software Engineer",
                    "employment_type": "fullTime",
                    "location": "Remote",
                    "start_date": "2024-07",
                    "end_date": "2026-06",
                    "is_current": False,
                    "responsibilities": ["Built import workflows"],
                    "achievements": ["Reduced review time"],
                    "skills": ["Python", "Kotlin"],
                }
            ],
            "project_experiences": [
                {
                    "name": project_name,
                    "role": "Lead developer",
                    "start_date": "2024-08",
                    "end_date": "2025-12",
                    "is_current": False,
                    "responsibilities": ["Designed the integration"],
                    "achievements": ["Shipped the first release"],
                    "skills": ["Python"],
                    "project_url": "https://example.com/import-project",
                }
            ],
            "skills": ["Python", "Kotlin"],
            "unresolved_items": [],
        }
    )


def make_user(
    user_id: UUID,
    *,
    password_hash: str = "hash",
) -> User:
    username = f"import-api-{user_id.hex[:12]}"
    return User(
        id=user_id,
        username=username,
        normalized_username=username,
        password_hash=password_hash,
        display_name="Import API Test",
    )


def make_run(
    user_id: UUID,
    document_id: UUID,
    parsed: ResumeParsingOutput,
    *,
    status: AgentRunStatus = AgentRunStatus.SUCCEEDED,
    suffix: str = "resume",
) -> AgentRun:
    run = AgentRun(
        id=uuid4(),
        user_id=user_id,
        agent_id="resume-parser",
        prompt_id=ResumeParsingAgent.agent_id,
        prompt_version="2",
        output_schema_id=ResumeParsingAgent.output_schema_id,
        status=status,
        payload={"resumeDocumentId": str(document_id)},
        idempotency_key=f"import-api-{suffix}-{uuid4()}",
        attempt_count=0 if status == AgentRunStatus.QUEUED else 1,
        max_attempts=3,
        model="test-model",
        started_at=None if status == AgentRunStatus.QUEUED else NOW,
        finished_at=NOW if status != AgentRunStatus.QUEUED else None,
        provider="test-provider" if status == AgentRunStatus.SUCCEEDED else None,
        input_tokens=1 if status == AgentRunStatus.SUCCEEDED else None,
        output_tokens=1 if status == AgentRunStatus.SUCCEEDED else None,
        result=(
            parsed.model_dump(mode="json", by_alias=False)
            if status == AgentRunStatus.SUCCEEDED
            else None
        ),
        error_code="provider_timeout" if status == AgentRunStatus.FAILED else None,
        created_at=NOW,
        updated_at=NOW,
    )
    return run


def make_document(
    user_id: UUID,
    document_id: UUID,
    run_id: UUID,
) -> ResumeDocument:
    return ResumeDocument(
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


def make_result(
    user_id: UUID,
    document_id: UUID,
    run_id: UUID,
    parsed: ResumeParsingOutput,
) -> ResumeParsingResult:
    values = parsed.model_dump(mode="json", by_alias=False)
    return ResumeParsingResult(
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


async def seed_resume(
    database: Database,
    *,
    user_id: UUID | None = None,
    parsed: ResumeParsingOutput | None = None,
    status: AgentRunStatus = AgentRunStatus.SUCCEEDED,
    password_hash: str = "hash",
    suffix: str = "resume",
) -> SeededResume:
    user_id = user_id or uuid4()
    document_id = uuid4()
    parsed = parsed or output()
    user = make_user(user_id, password_hash=password_hash)
    run = make_run(
        user_id,
        document_id,
        parsed,
        status=status,
        suffix=suffix,
    )
    document = make_document(user_id, document_id, run.id)
    result = (
        make_result(user_id, document_id, run.id, parsed)
        if status == AgentRunStatus.SUCCEEDED
        else None
    )
    async with database.sessionmaker() as session:
        existing_user = await session.get(User, user_id)
        if existing_user is None:
            session.add(user)
        session.add(document)
        session.add(run)
        if result is not None:
            session.add(result)
        await session.commit()

    if status == AgentRunStatus.SUCCEEDED:
        async with database.sessionmaker() as session:
            draft = await ResumeImportDraftService(session).build_draft(
                user_id=user_id,
                resume_document_id=document_id,
            )
            assert draft.user_id == user_id
            assert draft.resume_document_id == document_id
            assert draft.source_agent_run_id == run.id
            assert draft.status == "ready"
            assert draft.parsing_result_version == 1
            assert draft.draft_version == 1
    else:
        async with database.sessionmaker() as session:
            assert await session.get(ResumeParsingResult, document_id) is None
            assert await session.get(ResumeImportDraft, document_id) is None

    return SeededResume(user_id, document_id, run.id, parsed)


def _profile_options():
    return (
        selectinload(CareerProfile.education),
        selectinload(CareerProfile.skills),
        selectinload(CareerProfile.work_experiences).selectinload(
            CareerProfileWorkExperience.skill_links
        ),
        selectinload(CareerProfile.project_experiences).selectinload(
            CareerProfileProjectExperience.skill_links
        ),
    )


async def profile_response(
    database: Database,
    user_id: UUID,
) -> CareerProfileResponse:
    async with database.sessionmaker() as session:
        profile = await session.scalar(
            select(CareerProfile)
            .options(*_profile_options())
            .where(CareerProfile.user_id == user_id)
        )
        assert profile is not None
        return CareerProfileResponse.model_validate(profile)


async def seed_existing_profile(
    database: Database,
    seeded: SeededResume,
) -> ExistingProfileSeed:
    parsed = seeded.parsed
    draft_data = build_resume_import_draft_data(
        user_id=seeded.user_id,
        result=parsed,
        profile=None,
    )
    profile_id = uuid4()
    old_updated_at = NOW - timedelta(days=1)
    candidate_skills = {skill.name: skill for skill in draft_data.skills}
    python = candidate_skills["Python"]
    kotlin = candidate_skills["Kotlin"]
    manual_skill_id = uuid4()

    skills = [
        CareerProfileSkill(
            id=python.id,
            career_profile_id=profile_id,
            position=0,
            name=python.name,
            normalized_name=python.name.casefold(),
            source="resumeExtracted",
        ),
        CareerProfileSkill(
            id=kotlin.id,
            career_profile_id=profile_id,
            position=1,
            name=kotlin.name,
            normalized_name=kotlin.name.casefold(),
            source="userEdited",
        ),
        CareerProfileSkill(
            id=manual_skill_id,
            career_profile_id=profile_id,
            position=2,
            name="Rust",
            normalized_name="rust",
            source="userAdded",
        ),
    ]
    candidate_education = draft_data.education[0]
    resume_education = CareerProfileEducation(
        id=candidate_education.id,
        career_profile_id=profile_id,
        position=0,
        school="Old University",
        degree=candidate_education.degree,
        major=candidate_education.major,
        start_date=candidate_education.start_date,
        end_date=candidate_education.end_date,
        is_current=candidate_education.is_current,
        source="resumeExtracted",
    )
    manual_education_id = uuid4()
    manual_education = CareerProfileEducation(
        id=manual_education_id,
        career_profile_id=profile_id,
        position=1,
        school="Manual College",
        degree="Certificate",
        major="Writing",
        start_date="2018-01",
        end_date="2019-01",
        is_current=False,
        source="userAdded",
    )

    candidate_work = draft_data.work_experiences[0]
    resume_work_id = candidate_work.id
    resume_work = CareerProfileWorkExperience(
        id=resume_work_id,
        career_profile_id=profile_id,
        position=0,
        company="Old Company",
        title=candidate_work.title,
        employment_type=candidate_work.employment_type.value,
        location=candidate_work.location,
        start_date=candidate_work.start_date,
        end_date=candidate_work.end_date,
        is_current=candidate_work.is_current,
        responsibilities=["Old responsibility"],
        achievements=["Old achievement"],
        source="resumeExtracted",
    )
    resume_work_links = [
        CareerProfileWorkSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            work_experience_id=resume_work_id,
            skill_id=python.id,
            position=0,
        ),
        CareerProfileWorkSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            work_experience_id=resume_work_id,
            skill_id=kotlin.id,
            position=1,
        ),
    ]
    resume_work.skill_links = resume_work_links
    manual_work_id = uuid4()
    manual_work = CareerProfileWorkExperience(
        id=manual_work_id,
        career_profile_id=profile_id,
        position=1,
        company="Manual Company",
        title="Manual title",
        employment_type="partTime",
        location="Manual location",
        start_date="2021-01",
        end_date="2022-01",
        is_current=False,
        responsibilities=["Keep this responsibility"],
        achievements=["Keep this achievement"],
        source="userEdited",
    )
    manual_work.skill_links = [
        CareerProfileWorkSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            work_experience_id=manual_work_id,
            skill_id=manual_skill_id,
            position=0,
        )
    ]

    candidate_project = draft_data.project_experiences[0]
    resume_project_id = candidate_project.id
    resume_project = CareerProfileProjectExperience(
        id=resume_project_id,
        career_profile_id=profile_id,
        position=0,
        name="Old Project",
        role=candidate_project.role,
        start_date=candidate_project.start_date,
        end_date=candidate_project.end_date,
        responsibilities=["Old project responsibility"],
        achievements=["Old project achievement"],
        project_url=None,
        source="resumeExtracted",
    )
    resume_project_links = [
        CareerProfileProjectSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            project_experience_id=resume_project_id,
            skill_id=python.id,
            position=0,
        )
    ]
    resume_project.skill_links = resume_project_links
    manual_project_id = uuid4()
    manual_project = CareerProfileProjectExperience(
        id=manual_project_id,
        career_profile_id=profile_id,
        position=1,
        name="Manual Project",
        role="Manual role",
        start_date="2022-01",
        end_date="2023-01",
        responsibilities=["Keep this project"],
        achievements=["Keep this achievement"],
        project_url=None,
        source="userAdded",
    )
    manual_project.skill_links = [
        CareerProfileProjectSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            project_experience_id=manual_project_id,
            skill_id=manual_skill_id,
            position=0,
        )
    ]

    profile = CareerProfile(
        profile_id=profile_id,
        user_id=seeded.user_id,
        summary="Manual summary",
        version=1,
        education=[resume_education, manual_education],
        work_experiences=[resume_work, manual_work],
        project_experiences=[resume_project, manual_project],
        skills=skills,
        created_at=NOW - timedelta(days=2),
        updated_at=old_updated_at,
    )
    async with database.sessionmaker() as session:
        session.add(profile)
        await session.commit()

    return ExistingProfileSeed(
        profile_id=profile_id,
        old_updated_at=old_updated_at,
        resume_education_id=resume_education.id,
        manual_education_id=manual_education.id,
        resume_work_id=resume_work_id,
        manual_work_id=manual_work_id,
        resume_project_id=resume_project_id,
        manual_project_id=manual_project_id,
        manual_skill_id=manual_skill_id,
        work_link_ids=tuple(link.id for link in resume_work_links),
        project_link_ids=tuple(link.id for link in resume_project_links),
    )


async def seed_profile_with_manual_skill(
    database: Database,
    seeded: SeededResume,
) -> UUID:
    profile_id = uuid4()
    skill_id = uuid4()
    profile = CareerProfile(
        profile_id=profile_id,
        user_id=seeded.user_id,
        summary="Original summary",
        version=1,
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=[
            CareerProfileSkill(
                id=skill_id,
                career_profile_id=profile_id,
                position=0,
                name="Python",
                normalized_name="python",
                source="userEdited",
            )
        ],
    )
    async with database.sessionmaker() as session:
        session.add(profile)
        await session.commit()
    return skill_id


def assert_api_error(
    error: APIError,
    *,
    status_code: int,
    code: str,
) -> None:
    assert error.status_code == status_code
    assert error.error == code


def test_api_first_apply_and_repeated_apply_are_consistent() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                seeded = await seed_resume(database)

                async with database.sessionmaker() as session:
                    api = ResumeImportAPIService(session)
                    ready = await api.get_draft(
                        user_id=seeded.user_id,
                        resume_document_id=seeded.document_id,
                    )
                    assert ready.status == "ready"
                    assert ready.can_apply is True
                    assert ready.summary == "Parsed summary"

                async with database.sessionmaker() as session:
                    applied = await ResumeImportAPIService(session).apply_draft(
                        user_id=seeded.user_id,
                        resume_document_id=seeded.document_id,
                        draft_version=ready.draft_version,
                    )
                    assert applied.profile_created is True
                    assert applied.profile_changed is True
                    assert applied.draft.status == "applied"
                    assert applied.profile.version == 1

                async with database.sessionmaker() as session:
                    replayed = await ResumeImportAPIService(session).apply_draft(
                        user_id=seeded.user_id,
                        resume_document_id=seeded.document_id,
                        draft_version=ready.draft_version,
                    )
                    assert replayed.profile_created is False
                    assert replayed.profile_changed is False
                    assert replayed.draft.status == "applied"

                async with database.sessionmaker() as session:
                    current = await ResumeImportAPIService(session).get_draft(
                        user_id=seeded.user_id,
                        resume_document_id=seeded.document_id,
                    )
                    assert current.status == "applied"
                    assert current.can_apply is False
                    assert current.summary == "Parsed summary"
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_existing_profile_api_response_preserves_manual_items_and_links() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                seeded = await seed_resume(
                    database,
                    parsed=rich_output(),
                    suffix="existing",
                )
                existing = await seed_existing_profile(database, seeded)

                async with database.sessionmaker() as session:
                    ready = await ResumeImportAPIService(session).get_draft(
                        user_id=seeded.user_id,
                        resume_document_id=seeded.document_id,
                    )
                    assert ready.status == "ready"
                    assert ready.base_profile_version == 1
                    assert ready.draft_version == 2

                async with database.sessionmaker() as session:
                    applied = await ResumeImportAPIService(session).apply_draft(
                        user_id=seeded.user_id,
                        resume_document_id=seeded.document_id,
                        draft_version=ready.draft_version,
                    )

                assert applied.profile_created is False
                assert applied.profile_changed is True
                assert applied.profile.version == 2
                assert applied.profile.summary == "Manual summary"
                assert applied.profile.updated_at > existing.old_updated_at

                work_by_id = {
                    item.id: item for item in applied.profile.work_experiences
                }
                project_by_id = {
                    item.id: item for item in applied.profile.project_experiences
                }
                education_by_id = {item.id: item for item in applied.profile.education}
                skill_by_id = {item.id: item for item in applied.profile.skills}
                skill_by_name = {item.name: item for item in applied.profile.skills}
                assert (
                    education_by_id[existing.resume_education_id].school
                    == "New University"
                )
                assert (
                    education_by_id[existing.manual_education_id].school
                    == "Manual College"
                )
                assert work_by_id[existing.resume_work_id].company == "New Company"
                assert work_by_id[existing.resume_work_id].source == "resumeExtracted"
                assert work_by_id[existing.manual_work_id].company == "Manual Company"
                assert work_by_id[existing.manual_work_id].source == "userEdited"
                assert (
                    project_by_id[existing.resume_project_id].name == "Import Project"
                )
                assert (
                    project_by_id[existing.manual_project_id].name == "Manual Project"
                )
                assert skill_by_id[existing.manual_skill_id].name == "Rust"
                assert skill_by_id[existing.manual_skill_id].source == "userAdded"
                assert skill_by_name["Python"].source == "resumeExtracted"
                assert skill_by_name["Kotlin"].source == "userEdited"
                assert work_by_id[existing.resume_work_id].skill_ids == [
                    skill_by_name["Python"].id,
                    skill_by_name["Kotlin"].id,
                ]
                assert work_by_id[existing.manual_work_id].skill_ids == [
                    existing.manual_skill_id
                ]
                assert project_by_id[existing.resume_project_id].skill_ids == [
                    skill_by_name["Python"].id
                ]
                assert project_by_id[existing.manual_project_id].skill_ids == [
                    existing.manual_skill_id
                ]

                async with database.sessionmaker() as session:
                    work_links = list(
                        (
                            await session.scalars(
                                select(CareerProfileWorkSkill)
                                .where(
                                    CareerProfileWorkSkill.work_experience_id
                                    == existing.resume_work_id
                                )
                                .order_by(CareerProfileWorkSkill.position)
                            )
                        ).all()
                    )
                    project_links = list(
                        (
                            await session.scalars(
                                select(CareerProfileProjectSkill)
                                .where(
                                    CareerProfileProjectSkill.project_experience_id
                                    == existing.resume_project_id
                                )
                                .order_by(CareerProfileProjectSkill.position)
                            )
                        ).all()
                    )
                    all_work_links = list(
                        (
                            await session.scalars(
                                select(CareerProfileWorkSkill).where(
                                    CareerProfileWorkSkill.career_profile_id
                                    == existing.profile_id
                                )
                            )
                        ).all()
                    )
                    all_project_links = list(
                        (
                            await session.scalars(
                                select(CareerProfileProjectSkill).where(
                                    CareerProfileProjectSkill.career_profile_id
                                    == existing.profile_id
                                )
                            )
                        ).all()
                    )

                assert [link.id for link in work_links] == list(existing.work_link_ids)
                assert [link.skill_id for link in work_links] == [
                    skill_by_name["Python"].id,
                    skill_by_name["Kotlin"].id,
                ]
                assert [link.position for link in work_links] == [0, 1]
                work_combinations = [
                    (link.work_experience_id, link.skill_id) for link in all_work_links
                ]
                assert len(work_combinations) == len(set(work_combinations))

                assert [link.id for link in project_links] == list(
                    existing.project_link_ids
                )
                assert [link.skill_id for link in project_links] == [
                    skill_by_name["Python"].id
                ]
                assert [link.position for link in project_links] == [0]
                project_combinations = [
                    (link.project_experience_id, link.skill_id)
                    for link in all_project_links
                ]
                assert len(project_combinations) == len(set(project_combinations))

                fresh = await profile_response(database, seeded.user_id)
                assert applied.profile.model_dump(
                    mode="json", by_alias=True
                ) == fresh.model_dump(mode="json", by_alias=True)

                applied_updated_at = applied.profile.updated_at
                applied_at = applied.draft.applied_at
                async with database.sessionmaker() as session:
                    replayed = await ResumeImportAPIService(session).apply_draft(
                        user_id=seeded.user_id,
                        resume_document_id=seeded.document_id,
                        draft_version=ready.draft_version,
                    )
                assert replayed.profile_changed is False
                assert replayed.profile.updated_at == applied_updated_at
                assert replayed.draft.applied_at == applied_at
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_stale_draft_rebuilds_after_profile_version_conflict() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                seeded = await seed_resume(
                    database,
                    parsed=rich_output(),
                    suffix="stale",
                )
                manual_skill_id = await seed_profile_with_manual_skill(
                    database,
                    seeded,
                )

                async with database.sessionmaker() as session:
                    ready = await ResumeImportAPIService(session).get_draft(
                        user_id=seeded.user_id,
                        resume_document_id=seeded.document_id,
                    )

                async with database.sessionmaker() as session:
                    user = await session.get(User, seeded.user_id)
                    assert user is not None
                    payload = CareerProfilePutRequest.model_validate(
                        {
                            "version": 1,
                            "summary": "Manual update",
                            "education": [],
                            "workExperiences": [],
                            "projectExperiences": [],
                            "skills": [{"id": manual_skill_id, "name": "Python"}],
                        }
                    )
                    await CareerProfileService(session).replace_profile(
                        user,
                        payload,
                    )

                with pytest.raises(APIError) as error:
                    async with database.sessionmaker() as session:
                        await ResumeImportAPIService(session).apply_draft(
                            user_id=seeded.user_id,
                            resume_document_id=seeded.document_id,
                            draft_version=ready.draft_version,
                        )
                assert_api_error(
                    error.value,
                    status_code=409,
                    code="resume_import_profile_version_conflict",
                )

                async with database.sessionmaker() as session:
                    profile = await session.scalar(
                        select(CareerProfile).where(
                            CareerProfile.user_id == seeded.user_id
                        )
                    )
                    draft = await session.get(
                        ResumeImportDraft,
                        seeded.document_id,
                    )
                    assert profile is not None
                    assert profile.summary == "Manual update"
                    assert profile.version == 2
                    assert draft is not None
                    assert draft.status == "ready"
                    assert draft.applied_at is None

                async with database.sessionmaker() as session:
                    rebuilt = await ResumeImportAPIService(session).get_draft(
                        user_id=seeded.user_id,
                        resume_document_id=seeded.document_id,
                    )
                assert rebuilt.status == "ready"
                assert rebuilt.draft_version == ready.draft_version + 1
                assert rebuilt.base_profile_version == 2
                assert any(
                    item.item_id == manual_skill_id and item.source == "userEdited"
                    for item in rebuilt.protected_items
                )

                async with database.sessionmaker() as session:
                    applied = await ResumeImportAPIService(session).apply_draft(
                        user_id=seeded.user_id,
                        resume_document_id=seeded.document_id,
                        draft_version=rebuilt.draft_version,
                    )
                assert applied.draft.status == "applied"
                assert applied.profile_changed is True
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_concurrent_apply_serializes_to_one_profile_change() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                seeded = await seed_resume(
                    database,
                    parsed=rich_output(),
                    suffix="concurrent",
                )
                async with database.sessionmaker() as session:
                    ready = await ResumeImportAPIService(session).get_draft(
                        user_id=seeded.user_id,
                        resume_document_id=seeded.document_id,
                    )

                async def apply_once():
                    async with database.sessionmaker() as session:
                        return await ResumeImportAPIService(session).apply_draft(
                            user_id=seeded.user_id,
                            resume_document_id=seeded.document_id,
                            draft_version=ready.draft_version,
                        )

                first, second = await asyncio.gather(apply_once(), apply_once())
                assert sorted((first.profile_changed, second.profile_changed)) == [
                    False,
                    True,
                ]
                assert {first.profile.version, second.profile.version} == {1}
                assert first.draft.applied_at == second.draft.applied_at

                async with database.sessionmaker() as session:
                    profile = await session.scalar(
                        select(CareerProfile).where(
                            CareerProfile.user_id == seeded.user_id
                        )
                    )
                    draft = await session.get(
                        ResumeImportDraft,
                        seeded.document_id,
                    )
                    assert profile is not None
                    assert profile.version == 1
                    assert draft is not None
                    assert draft.status == "applied"
                    applied_at = draft.applied_at
                    updated_at = profile.updated_at

                async with database.sessionmaker() as session:
                    replayed = await ResumeImportAPIService(session).apply_draft(
                        user_id=seeded.user_id,
                        resume_document_id=seeded.document_id,
                        draft_version=ready.draft_version,
                    )
                assert replayed.draft.applied_at == applied_at
                assert replayed.profile.updated_at == updated_at
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_multiple_resume_drafts_supersede_and_rebuild() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                first = await seed_resume(
                    database,
                    parsed=rich_output(
                        summary="Resume A",
                        company="Company A",
                        project_name="Project A",
                    ),
                    suffix="multi-a",
                )
                second = await seed_resume(
                    database,
                    user_id=first.user_id,
                    parsed=rich_output(
                        summary="Resume B",
                        company="Company B",
                        project_name="Project B",
                    ),
                    suffix="multi-b",
                )

                async with database.sessionmaker() as session:
                    api = ResumeImportAPIService(session)
                    first_draft = await api.get_draft(
                        user_id=first.user_id,
                        resume_document_id=first.document_id,
                    )
                async with database.sessionmaker() as session:
                    second_draft = await ResumeImportAPIService(session).get_draft(
                        user_id=second.user_id,
                        resume_document_id=second.document_id,
                    )

                async with database.sessionmaker() as session:
                    applied_first = await ResumeImportAPIService(session).apply_draft(
                        user_id=first.user_id,
                        resume_document_id=first.document_id,
                        draft_version=first_draft.draft_version,
                    )
                assert applied_first.profile_changed is True
                assert applied_first.draft.status == "applied"

                with pytest.raises(APIError) as error:
                    async with database.sessionmaker() as session:
                        await ResumeImportAPIService(session).apply_draft(
                            user_id=second.user_id,
                            resume_document_id=second.document_id,
                            draft_version=second_draft.draft_version,
                        )
                assert_api_error(
                    error.value,
                    status_code=409,
                    code="resume_import_draft_not_ready",
                )

                async with database.sessionmaker() as session:
                    rebuilt = await ResumeImportAPIService(session).get_draft(
                        user_id=second.user_id,
                        resume_document_id=second.document_id,
                    )
                assert rebuilt.status == "ready"
                assert rebuilt.can_apply is True
                assert rebuilt.draft_version == second_draft.draft_version + 1

                async with database.sessionmaker() as session:
                    applied_second = await ResumeImportAPIService(session).apply_draft(
                        user_id=second.user_id,
                        resume_document_id=second.document_id,
                        draft_version=rebuilt.draft_version,
                    )
                assert applied_second.draft.status == "applied"
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_import_api_isolates_users_and_rejects_tampered_or_partial_state() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner = await seed_resume(
                    database,
                    parsed=rich_output(),
                    suffix="tamper-owner",
                )
                other = await seed_resume(
                    database,
                    parsed=rich_output(summary="Other user"),
                    suffix="tamper-other",
                )
                other_user_error: APIError
                with pytest.raises(APIError) as error:
                    async with database.sessionmaker() as session:
                        await ResumeImportAPIService(session).get_draft(
                            user_id=other.user_id,
                            resume_document_id=owner.document_id,
                        )
                other_user_error = error.value
                assert_api_error(
                    other_user_error,
                    status_code=404,
                    code="resume_document_not_found",
                )
                with pytest.raises(APIError) as error:
                    async with database.sessionmaker() as session:
                        await ResumeImportAPIService(session).apply_draft(
                            user_id=other.user_id,
                            resume_document_id=owner.document_id,
                            draft_version=1,
                        )
                assert_api_error(
                    error.value,
                    status_code=404,
                    code="resume_document_not_found",
                )

                async with database.sessionmaker() as session:
                    ready = await ResumeImportAPIService(session).get_draft(
                        user_id=owner.user_id,
                        resume_document_id=owner.document_id,
                    )

                tamper_source_run = make_run(
                    owner.user_id,
                    owner.document_id,
                    owner.parsed,
                    status=AgentRunStatus.FAILED,
                    suffix="tamper-source",
                )
                assert tamper_source_run.id != owner.run_id
                async with database.sessionmaker() as session:
                    session.add(tamper_source_run)
                    await session.flush()
                    assert (
                        await session.scalar(
                            select(ResumeImportDraft).where(
                                ResumeImportDraft.source_agent_run_id
                                == tamper_source_run.id
                            )
                        )
                        is None
                    )
                    draft = await session.get(ResumeImportDraft, owner.document_id)
                    assert draft is not None
                    draft.source_agent_run_id = tamper_source_run.id
                    await session.commit()
                async with database.sessionmaker() as session:
                    tampered_draft = await session.get(
                        ResumeImportDraft,
                        owner.document_id,
                    )
                    assert tampered_draft is not None
                    assert tampered_draft.source_agent_run_id == tamper_source_run.id
                    tamper_source_drafts = (
                        await session.scalars(
                            select(ResumeImportDraft).where(
                                ResumeImportDraft.source_agent_run_id
                                == tamper_source_run.id
                            )
                        )
                    ).all()
                    assert len(tamper_source_drafts) == 1
                with pytest.raises(APIError) as error:
                    async with database.sessionmaker() as session:
                        await ResumeImportAPIService(session).get_draft(
                            user_id=owner.user_id,
                            resume_document_id=owner.document_id,
                        )
                assert error.value.status_code == 409
                assert error.value.error == "resume_parsing_state_conflict"

                async with database.sessionmaker() as session:
                    draft = await session.get(ResumeImportDraft, owner.document_id)
                    assert draft is not None
                    draft.source_agent_run_id = owner.run_id
                    await session.commit()

                pointer_run = make_run(
                    owner.user_id,
                    owner.document_id,
                    owner.parsed,
                    suffix="pointer",
                )
                async with database.sessionmaker() as session:
                    draft = await session.get(ResumeImportDraft, owner.document_id)
                    document = await session.get(ResumeDocument, owner.document_id)
                    assert draft is not None
                    assert document is not None
                    draft.source_agent_run_id = owner.run_id
                    session.add(pointer_run)
                    await session.flush()
                    document.parsing_run_id = pointer_run.id
                    await session.commit()
                with pytest.raises(APIError) as error:
                    async with database.sessionmaker() as session:
                        await ResumeImportAPIService(session).get_draft(
                            user_id=owner.user_id,
                            resume_document_id=owner.document_id,
                        )
                assert error.value.status_code == 409
                assert error.value.error == "resume_parsing_state_conflict"

                async with database.sessionmaker() as session:
                    document = await session.get(ResumeDocument, owner.document_id)
                    draft = await session.get(ResumeImportDraft, owner.document_id)
                    assert document is not None
                    assert draft is not None
                    document.parsing_run_id = owner.run_id
                    draft.skills = [{"invalid": "draft"}]
                    await session.commit()
                with pytest.raises(APIError) as error:
                    async with database.sessionmaker() as session:
                        await ResumeImportAPIService(session).get_draft(
                            user_id=owner.user_id,
                            resume_document_id=owner.document_id,
                        )
                assert_api_error(
                    error.value,
                    status_code=409,
                    code="resume_import_draft_invalid",
                )
                async with database.sessionmaker() as session:
                    assert (
                        await session.scalar(
                            select(CareerProfile).where(
                                CareerProfile.user_id == owner.user_id
                            )
                        )
                        is None
                    )
                    unchanged_draft = await session.get(
                        ResumeImportDraft,
                        owner.document_id,
                    )
                    assert unchanged_draft is not None
                    assert unchanged_draft.status == "ready"
                    assert unchanged_draft.applied_at is None

                queued = await seed_resume(
                    database,
                    status=AgentRunStatus.QUEUED,
                    suffix="queued",
                )
                with pytest.raises(APIError) as error:
                    async with database.sessionmaker() as session:
                        await ResumeImportAPIService(session).get_draft(
                            user_id=queued.user_id,
                            resume_document_id=queued.document_id,
                        )
                assert_api_error(
                    error.value,
                    status_code=409,
                    code="resume_import_draft_not_ready",
                )

                failed = await seed_resume(
                    database,
                    status=AgentRunStatus.FAILED,
                    suffix="failed",
                )
                with pytest.raises(APIError) as error:
                    async with database.sessionmaker() as session:
                        await ResumeImportAPIService(session).get_draft(
                            user_id=failed.user_id,
                            resume_document_id=failed.document_id,
                        )
                assert_api_error(
                    error.value,
                    status_code=409,
                    code="resume_import_draft_not_ready",
                )

                applied = await seed_resume(
                    database,
                    parsed=output(),
                    suffix="missing-profile",
                )
                async with database.sessionmaker() as session:
                    ready_applied = await ResumeImportAPIService(session).get_draft(
                        user_id=applied.user_id,
                        resume_document_id=applied.document_id,
                    )
                async with database.sessionmaker() as session:
                    await ResumeImportAPIService(session).apply_draft(
                        user_id=applied.user_id,
                        resume_document_id=applied.document_id,
                        draft_version=ready_applied.draft_version,
                    )
                async with database.sessionmaker() as session:
                    await session.execute(
                        delete(CareerProfile).where(
                            CareerProfile.user_id == applied.user_id
                        )
                    )
                    await session.commit()
                with pytest.raises(APIError) as error:
                    async with database.sessionmaker() as session:
                        await ResumeImportAPIService(session).apply_draft(
                            user_id=applied.user_id,
                            resume_document_id=applied.document_id,
                            draft_version=ready_applied.draft_version,
                        )
                assert_api_error(
                    error.value,
                    status_code=409,
                    code="resume_import_apply_conflict",
                )
                async with database.sessionmaker() as session:
                    persisted_draft = await session.get(
                        ResumeImportDraft,
                        applied.document_id,
                    )
                    assert persisted_draft is not None
                    assert persisted_draft.status == "applied"
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_resume_import_api_real_http_flow_with_postgres() -> None:
    url = database_url()

    async def prepare() -> tuple[SeededResume, SeededResume]:
        async with Database(url) as database:
            await database.reset()
            first = await seed_resume(
                database,
                parsed=rich_output(summary="HTTP parsed"),
                password_hash=hash_password(HTTP_PASSWORD),
                suffix="http-first",
            )
            second = await seed_resume(
                database,
                parsed=rich_output(summary="HTTP second"),
                password_hash=hash_password(HTTP_PASSWORD),
                suffix="http-second",
            )
            return first, second

    first, second = asyncio.run(prepare())
    settings = Settings(
        database_url=url,
        cors_allowed_origins=[TRUSTED_ORIGIN],
        session_digest_key="resume-import-api-http-test-key",
        session_cookie_secure=False,
    )
    app = create_app(settings)
    try:
        with TestClient(app) as client:
            unauthenticated = client.get(
                f"/api/profile/resumes/{first.document_id}/import-draft"
            )
            assert unauthenticated.status_code == 401

            login = client.post(
                "/api/auth/login",
                json={
                    "username": f"import-api-{first.user_id.hex[:12]}",
                    "password": HTTP_PASSWORD,
                },
                headers={"Origin": TRUSTED_ORIGIN},
            )
            assert login.status_code == 200

            no_csrf = client.post(
                f"/api/profile/resumes/{first.document_id}/import-draft/apply",
                json={"draftVersion": 1},
            )
            assert no_csrf.status_code == 403

            invalid_version = client.post(
                f"/api/profile/resumes/{first.document_id}/import-draft/apply",
                json={"draftVersion": 0},
                headers={"Origin": TRUSTED_ORIGIN},
            )
            assert invalid_version.status_code == 422

            ready = client.get(f"/api/profile/resumes/{first.document_id}/import-draft")
            assert ready.status_code == 200
            ready_body = ready.json()
            assert ready_body["status"] == "ready"
            assert ready_body["canApply"] is True

            manual_profile = client.put(
                "/api/profile",
                json={
                    "version": None,
                    "summary": "HTTP manual profile",
                    "education": [],
                    "workExperiences": [],
                    "projectExperiences": [],
                    "skills": [],
                },
                headers={"Origin": TRUSTED_ORIGIN},
            )
            assert manual_profile.status_code == 200

            stale_apply = client.post(
                f"/api/profile/resumes/{first.document_id}/import-draft/apply",
                json={"draftVersion": ready_body["draftVersion"]},
                headers={"Origin": TRUSTED_ORIGIN},
            )
            assert stale_apply.status_code == 409
            assert stale_apply.json() == {
                "error": "resume_import_profile_version_conflict"
            }

            rebuilt = client.get(
                f"/api/profile/resumes/{first.document_id}/import-draft"
            )
            assert rebuilt.status_code == 200
            rebuilt_body = rebuilt.json()
            assert rebuilt_body["status"] == "ready"
            assert rebuilt_body["draftVersion"] == ready_body["draftVersion"] + 1

            applied = client.post(
                f"/api/profile/resumes/{first.document_id}/import-draft/apply",
                json={"draftVersion": rebuilt_body["draftVersion"]},
                headers={"Origin": TRUSTED_ORIGIN},
            )
            assert applied.status_code == 200
            applied_body = applied.json()
            assert applied_body["draft"]["status"] == "applied"

            profile = client.get("/api/profile")
            assert profile.status_code == 200
            assert applied_body["profile"] == profile.json()["profile"]

            logout = client.post(
                "/api/auth/logout",
                headers={"Origin": TRUSTED_ORIGIN},
            )
            assert logout.status_code == 204
            second_login = client.post(
                "/api/auth/login",
                json={
                    "username": f"import-api-{second.user_id.hex[:12]}",
                    "password": HTTP_PASSWORD,
                },
                headers={"Origin": TRUSTED_ORIGIN},
            )
            assert second_login.status_code == 200

            other_user_get = client.get(
                f"/api/profile/resumes/{first.document_id}/import-draft"
            )
            assert other_user_get.status_code == 404
            assert other_user_get.json() == {"error": "resume_document_not_found"}
            other_user_apply = client.post(
                f"/api/profile/resumes/{first.document_id}/import-draft/apply",
                json={"draftVersion": rebuilt_body["draftVersion"]},
                headers={"Origin": TRUSTED_ORIGIN},
            )
            assert other_user_apply.status_code == 404
            assert other_user_apply.json() == {"error": "resume_document_not_found"}
    finally:
        asyncio.run(_reset_database(url))


async def _reset_database(url: str) -> None:
    async with Database(url) as database:
        await database.reset()
