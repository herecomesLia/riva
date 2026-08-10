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
    CareerProfileEducation,
    CareerProfileProjectExperience,
    CareerProfileProjectSkill,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
    MatchingAnalysis,
    ResumeDocument,
    ResumeImportDraft,
    ResumeParsingResult,
    TargetRole,
    User,
)
from riva.prompts import RESUME_PARSING_PROMPT
from riva.schemas.resume_parsing import ResumeParsingOutput
from riva.services.resume_import_application import (
    ResumeImportApplicationService,
)
from riva.services.resume_imports import (
    ResumeImportDraftService,
    build_resume_import_draft_data,
)


pytestmark = pytest.mark.integration
NOW = datetime(2026, 8, 5, 12, 0, tzinfo=UTC)


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def parsing_output(*, extra: bool = False) -> ResumeParsingOutput:
    education = [
        {
            "school": "Example University",
            "degree": "BSc",
            "major": "Computer Science",
            "start_date": "2020-09",
            "end_date": "2024-06",
            "is_current": False,
        }
    ]
    projects = [
        {
            "name": "Import Project",
            "role": "Developer",
            "start_date": "2023-01",
            "end_date": None,
            "is_current": None,
            "responsibilities": ["Design"],
            "achievements": ["Released"],
            "skills": ["Python"],
            "project_url": "https://example.com/project",
        }
    ]
    if extra:
        education.append(
            {
                "school": "New University",
                "degree": "MSc",
                "major": "Systems",
                "start_date": "2024-09",
                "end_date": "2026-06",
                "is_current": False,
            }
        )
        projects.append(
            {
                "name": "New Project",
                "role": "Engineer",
                "start_date": "2024-01",
                "end_date": None,
                "is_current": None,
                "responsibilities": ["Build"],
                "achievements": ["Shipped"],
                "skills": ["SQL"],
                "project_url": "https://example.com/new-project",
            }
        )
    return ResumeParsingOutput(
        summary="Parsed summary",
        education=education,
        work_experiences=[
            {
                "company": "Example Co",
                "title": "Engineer",
                "employment_type": "fullTime",
                "location": "Remote",
                "start_date": "2024-07",
                "end_date": None,
                "is_current": True,
                "responsibilities": ["Build APIs"],
                "achievements": ["Shipped platform"],
                "skills": ["Python"],
            }
        ],
        project_experiences=projects,
        skills=["Python", "SQL"],
        unresolved_items=[],
    )


async def seed(
    database: Database,
    suffix: str,
    *,
    output: ResumeParsingOutput | None = None,
) -> tuple[UUID, UUID, UUID]:
    user_id = uuid4()
    document_id = uuid4()
    source_run_id = uuid4()
    user = User(
        id=user_id,
        username=f"application-{suffix}",
        normalized_username=f"application-{suffix}",
        password_hash="hash",
        display_name="Application Test",
    )
    run = AgentRun(
        id=source_run_id,
        user_id=user_id,
        agent_id="resume-parser",
        prompt_id=RESUME_PARSING_PROMPT.prompt_id,
        prompt_version="2",
        output_schema_id=RESUME_PARSING_PROMPT.output_schema_id,
        payload={"resumeDocumentId": str(document_id)},
        idempotency_key=f"application-{suffix}-{uuid4()}",
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
        parsing_run_id=source_run_id,
        created_at=NOW,
        updated_at=NOW,
    )
    parsed = output or parsing_output()
    values = parsed.model_dump(mode="json", by_alias=False)
    result = ResumeParsingResult(
        resume_document_id=document_id,
        user_id=user_id,
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
    async with database.sessionmaker() as session:
        session.add_all([user, run, document, result])
        await session.commit()
    return user_id, document_id, source_run_id


def profile_loader_options():
    return (
        selectinload(CareerProfile.education),
        selectinload(CareerProfile.skills),
        selectinload(CareerProfile.work_experiences)
        .selectinload(CareerProfileWorkExperience.skill_links)
        .selectinload(CareerProfileWorkSkill.skill),
        selectinload(CareerProfile.project_experiences)
        .selectinload(CareerProfileProjectExperience.skill_links)
        .selectinload(CareerProfileProjectSkill.skill),
    )


async def load_profile(session, user_id: UUID) -> CareerProfile | None:
    return await session.scalar(
        select(CareerProfile)
        .options(*profile_loader_options())
        .where(CareerProfile.user_id == user_id)
    )


async def build_draft(
    database: Database,
    user_id: UUID,
    document_id: UUID,
) -> int:
    async with database.sessionmaker() as session:
        draft = await ResumeImportDraftService(
            session,
            clock=lambda: NOW,
        ).build_draft(
            user_id=user_id,
            resume_document_id=document_id,
        )
        return draft.draft_version


def test_first_import_creates_profile_and_applies_draft() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            user_id, document_id, _ = await seed(database, "first")
            draft_version = await build_draft(database, user_id, document_id)

            async with database.sessionmaker() as session:
                applied = await ResumeImportApplicationService(
                    session,
                    clock=lambda: NOW,
                ).apply_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                    draft_version=draft_version,
                )
                assert applied.profile_created is True
                assert applied.profile_changed is True
                assert applied.profile.version == 1
                assert applied.draft.status == "applied"
                assert applied.draft.applied_profile_version == 1

            async with database.sessionmaker() as session:
                profile = await load_profile(session, user_id)
                draft = await session.get(ResumeImportDraft, document_id)
                assert profile is not None
                assert draft is not None
                assert profile.version == 1
                assert draft.status == "applied"
                assert all(
                    item.source == "resumeExtracted"
                    for item in (
                        *profile.education,
                        *profile.work_experiences,
                        *profile.project_experiences,
                        *profile.skills,
                    )
                )
                assert [item.position for item in profile.education] == [0]
                assert [item.position for item in profile.work_experiences] == [0]
                assert [item.position for item in profile.project_experiences] == [0]
                assert [item.position for item in profile.skills] == [0, 1]
                assert profile.work_experiences[0].skill_ids == [
                    profile.skills[0].id
                ]

    asyncio.run(run())


def test_existing_profile_merge_preserves_manual_and_missing_items() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            output = parsing_output(extra=True)
            user_id, document_id, _ = await seed(
                database,
                "merge",
                output=output,
            )
            candidate = build_resume_import_draft_data(
                user_id=user_id,
                result=output,
                profile=None,
            )
            profile_id = uuid4()
            manual_skill_id = uuid4()
            manual_education_id = uuid4()
            missing_education_id = uuid4()
            manual_project_id = uuid4()
            existing_work_skill_id = uuid4()
            async with database.sessionmaker() as session:
                profile = CareerProfile(
                    profile_id=profile_id,
                    user_id=user_id,
                    summary="Existing summary",
                    version=1,
                    education=[
                        CareerProfileEducation(
                            id=manual_education_id,
                            career_profile_id=profile_id,
                            position=0,
                            school="Manual University",
                            degree=None,
                            major=None,
                            start_date="2010-01",
                            end_date="2014-01",
                            is_current=False,
                            source="userEdited",
                        ),
                        CareerProfileEducation(
                            id=candidate.education[0].id,
                            career_profile_id=profile_id,
                            position=1,
                            school="Old University",
                            degree=None,
                            major=None,
                            start_date="2019-01",
                            end_date="2020-01",
                            is_current=False,
                            source="resumeExtracted",
                        ),
                        CareerProfileEducation(
                            id=missing_education_id,
                            career_profile_id=profile_id,
                            position=2,
                            school="Missing University",
                            degree=None,
                            major=None,
                            start_date="2000-01",
                            end_date="2004-01",
                            is_current=False,
                            source="resumeExtracted",
                        ),
                    ],
                    skills=[
                        CareerProfileSkill(
                            id=manual_skill_id,
                            career_profile_id=profile_id,
                            position=0,
                            name="Python",
                            normalized_name="python",
                            source="userEdited",
                        )
                    ],
                    work_experiences=[
                        CareerProfileWorkExperience(
                            id=candidate.work_experiences[0].id,
                            career_profile_id=profile_id,
                            position=0,
                            company="Old Co",
                            title="Old title",
                            employment_type="fullTime",
                            location=None,
                            start_date="2024-07",
                            end_date=None,
                            is_current=True,
                            responsibilities=["Old"],
                            achievements=[],
                            source="resumeExtracted",
                            skill_links=[
                                CareerProfileWorkSkill(
                                    id=existing_work_skill_id,
                                    career_profile_id=profile_id,
                                    work_experience_id=candidate.work_experiences[0].id,
                                    skill_id=manual_skill_id,
                                    position=0,
                                )
                            ],
                        )
                    ],
                    project_experiences=[
                        CareerProfileProjectExperience(
                            id=manual_project_id,
                            career_profile_id=profile_id,
                            position=0,
                            name="Manual project",
                            role=None,
                            start_date="2010-01",
                            end_date=None,
                            responsibilities=["Keep"],
                            achievements=[],
                            project_url=None,
                            source="userAdded",
                            skill_links=[
                                CareerProfileProjectSkill(
                                    id=uuid4(),
                                    career_profile_id=profile_id,
                                    project_experience_id=manual_project_id,
                                    skill_id=manual_skill_id,
                                    position=0,
                                )
                            ],
                        )
                    ],
                )
                session.add(profile)
                await session.commit()

            draft_version = await build_draft(database, user_id, document_id)
            async with database.sessionmaker() as session:
                applied = await ResumeImportApplicationService(
                    session,
                    clock=lambda: NOW,
                ).apply_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                    draft_version=draft_version,
                )
                assert applied.profile_changed is True
                assert applied.profile.version == 2

            async with database.sessionmaker() as session:
                profile = await load_profile(session, user_id)
                assert profile is not None
                assert profile.summary == "Existing summary"
                assert profile.version == 2
                assert [item.id for item in profile.education] == [
                    manual_education_id,
                    candidate.education[0].id,
                    missing_education_id,
                    candidate.education[1].id,
                ]
                assert profile.education[0].school == "Manual University"
                assert profile.education[1].school == "Example University"
                assert profile.education[2].school == "Missing University"
                assert profile.education[3].source == "resumeExtracted"
                assert [item.id for item in profile.project_experiences] == [
                    manual_project_id,
                    candidate.project_experiences[0].id,
                    candidate.project_experiences[1].id,
                ]
                assert profile.project_experiences[0].name == "Manual project"
                assert profile.work_experiences[0].title == "Engineer"
                assert profile.work_experiences[0].skill_ids == [manual_skill_id]
                assert [link.id for link in profile.work_experiences[0].skill_links] == [
                    existing_work_skill_id
                ]
                assert profile.work_experiences[0].skill_links[0].skill.id == (
                    manual_skill_id
                )
                work_skill_rows = (
                    await session.scalars(
                        select(CareerProfileWorkSkill).where(
                            CareerProfileWorkSkill.work_experience_id
                            == candidate.work_experiences[0].id,
                            CareerProfileWorkSkill.skill_id == manual_skill_id,
                        )
                    )
                ).all()
                assert len(work_skill_rows) == 1
                assert work_skill_rows[0].id == existing_work_skill_id
                assert [item.name for item in profile.skills] == ["Python", "SQL"]
                assert profile.skills[0].id == manual_skill_id
                assert [item.position for item in profile.skills] == [0, 1]

    asyncio.run(run())


def test_existing_resume_project_reuses_skill_link() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            output = parsing_output()
            user_id, document_id, _ = await seed(
                database,
                "project-link-reuse",
                output=output,
            )
            candidate = build_resume_import_draft_data(
                user_id=user_id,
                result=output,
                profile=None,
            )
            profile_id = uuid4()
            manual_skill_id = uuid4()
            existing_project_skill_id = uuid4()
            async with database.sessionmaker() as session:
                project_id = candidate.project_experiences[0].id
                profile = CareerProfile(
                    profile_id=profile_id,
                    user_id=user_id,
                    summary="Existing summary",
                    version=1,
                    education=[],
                    work_experiences=[],
                    skills=[
                        CareerProfileSkill(
                            id=manual_skill_id,
                            career_profile_id=profile_id,
                            position=0,
                            name="Python",
                            normalized_name="python",
                            source="userEdited",
                        )
                    ],
                    project_experiences=[
                        CareerProfileProjectExperience(
                            id=project_id,
                            career_profile_id=profile_id,
                            position=0,
                            name="Import Project",
                            role="Developer",
                            start_date="2023-01",
                            end_date=None,
                            responsibilities=["Design"],
                            achievements=["Released"],
                            project_url="https://example.com/project",
                            source="resumeExtracted",
                            skill_links=[
                                CareerProfileProjectSkill(
                                    id=existing_project_skill_id,
                                    career_profile_id=profile_id,
                                    project_experience_id=project_id,
                                    skill_id=manual_skill_id,
                                    position=0,
                                )
                            ],
                        )
                    ],
                )
                session.add(profile)
                await session.commit()

            draft_version = await build_draft(database, user_id, document_id)
            async with database.sessionmaker() as session:
                applied = await ResumeImportApplicationService(
                    session,
                    clock=lambda: NOW,
                ).apply_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                    draft_version=draft_version,
                )
                assert applied.profile_changed is True
                assert applied.profile.version == 2

            async with database.sessionmaker() as session:
                profile = await load_profile(session, user_id)
                assert profile is not None
                project = profile.project_experiences[0]
                assert project.skill_ids == [manual_skill_id]
                assert [link.id for link in project.skill_links] == [
                    existing_project_skill_id
                ]
                assert project.skill_links[0].skill.id == manual_skill_id
                project_skill_rows = (
                    await session.scalars(
                        select(CareerProfileProjectSkill).where(
                            CareerProfileProjectSkill.project_experience_id
                            == project.id,
                            CareerProfileProjectSkill.skill_id == manual_skill_id,
                        )
                    )
                ).all()
                assert len(project_skill_rows) == 1
                assert project_skill_rows[0].id == existing_project_skill_id

    asyncio.run(run())


def test_skill_order_change_reuses_link_ids_and_increments_profile_once() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            output = parsing_output()
            output.skills = ["Python", "SQL"]
            output.work_experiences[0].skills = ["SQL", "Python"]
            user_id, document_id, _ = await seed(
                database,
                "skill-order",
                output=output,
            )
            candidate = build_resume_import_draft_data(
                user_id=user_id,
                result=output,
                profile=None,
            )
            profile_id = uuid4()
            python_id = candidate.skills[0].id
            sql_id = candidate.skills[1].id
            work_id = candidate.work_experiences[0].id
            project_id = candidate.project_experiences[0].id
            link_python_id = uuid4()
            link_sql_id = uuid4()
            async with database.sessionmaker() as session:
                education = candidate.education[0]
                work = candidate.work_experiences[0]
                project = candidate.project_experiences[0]
                profile = CareerProfile(
                    profile_id=profile_id,
                    user_id=user_id,
                    summary="Existing summary",
                    version=1,
                    education=[
                        CareerProfileEducation(
                            id=education.id,
                            career_profile_id=profile_id,
                            position=0,
                            school=education.school,
                            degree=education.degree,
                            major=education.major,
                            start_date=education.start_date,
                            end_date=education.end_date,
                            is_current=education.is_current,
                            source="resumeExtracted",
                        )
                    ],
                    skills=[
                        CareerProfileSkill(
                            id=python_id,
                            career_profile_id=profile_id,
                            position=0,
                            name="Python",
                            normalized_name="python",
                            source="resumeExtracted",
                        ),
                        CareerProfileSkill(
                            id=sql_id,
                            career_profile_id=profile_id,
                            position=1,
                            name="SQL",
                            normalized_name="sql",
                            source="resumeExtracted",
                        ),
                    ],
                    work_experiences=[
                        CareerProfileWorkExperience(
                            id=work_id,
                            career_profile_id=profile_id,
                            position=0,
                            company=work.company,
                            title=work.title,
                            employment_type=work.employment_type.value,
                            location=work.location,
                            start_date=work.start_date,
                            end_date=work.end_date,
                            is_current=work.is_current,
                            responsibilities=list(work.responsibilities),
                            achievements=list(work.achievements),
                            source="resumeExtracted",
                            skill_links=[
                                CareerProfileWorkSkill(
                                    id=link_python_id,
                                    career_profile_id=profile_id,
                                    work_experience_id=work_id,
                                    skill_id=python_id,
                                    position=0,
                                ),
                                CareerProfileWorkSkill(
                                    id=link_sql_id,
                                    career_profile_id=profile_id,
                                    work_experience_id=work_id,
                                    skill_id=sql_id,
                                    position=1,
                                ),
                            ],
                        )
                    ],
                    project_experiences=[
                        CareerProfileProjectExperience(
                            id=project_id,
                            career_profile_id=profile_id,
                            position=0,
                            name=project.name,
                            role=project.role,
                            start_date=project.start_date,
                            end_date=project.end_date,
                            responsibilities=list(project.responsibilities),
                            achievements=list(project.achievements),
                            project_url=(
                                str(project.project_url)
                                if project.project_url is not None
                                else None
                            ),
                            source="resumeExtracted",
                            skill_links=[
                                CareerProfileProjectSkill(
                                    id=uuid4(),
                                    career_profile_id=profile_id,
                                    project_experience_id=project_id,
                                    skill_id=python_id,
                                    position=0,
                                )
                            ],
                        )
                    ],
                )
                session.add(profile)
                await session.commit()

            draft_version = await build_draft(database, user_id, document_id)
            async with database.sessionmaker() as session:
                applied = await ResumeImportApplicationService(
                    session,
                    clock=lambda: NOW,
                ).apply_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                    draft_version=draft_version,
                )
                assert applied.profile_changed is True
                assert applied.profile.version == 2

            async with database.sessionmaker() as session:
                profile = await load_profile(session, user_id)
                assert profile is not None
                work = profile.work_experiences[0]
                assert [link.skill_id for link in work.skill_links] == [
                    sql_id,
                    python_id,
                ]
                assert [link.id for link in work.skill_links] == [
                    link_sql_id,
                    link_python_id,
                ]
                assert [link.position for link in work.skill_links] == [0, 1]

    asyncio.run(run())


def test_skill_link_delete_keep_add_persists_expected_rows() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            output = parsing_output()
            output.skills = ["Python", "SQL", "Go"]
            output.work_experiences[0].skills = ["SQL", "Go"]
            user_id, document_id, _ = await seed(
                database,
                "skill-link-diff",
                output=output,
            )
            candidate = build_resume_import_draft_data(
                user_id=user_id,
                result=output,
                profile=None,
            )
            profile_id = uuid4()
            python_id = candidate.skills[0].id
            sql_id = candidate.skills[1].id
            go_id = candidate.skills[2].id
            work = candidate.work_experiences[0]
            link_python_id = uuid4()
            link_sql_id = uuid4()
            async with database.sessionmaker() as session:
                profile = CareerProfile(
                    profile_id=profile_id,
                    user_id=user_id,
                    summary="Existing summary",
                    version=1,
                    education=[],
                    project_experiences=[],
                    skills=[
                        CareerProfileSkill(
                            id=python_id,
                            career_profile_id=profile_id,
                            position=0,
                            name="Python",
                            normalized_name="python",
                            source="resumeExtracted",
                        ),
                        CareerProfileSkill(
                            id=sql_id,
                            career_profile_id=profile_id,
                            position=1,
                            name="SQL",
                            normalized_name="sql",
                            source="resumeExtracted",
                        ),
                    ],
                    work_experiences=[
                        CareerProfileWorkExperience(
                            id=work.id,
                            career_profile_id=profile_id,
                            position=0,
                            company=work.company,
                            title=work.title,
                            employment_type=work.employment_type.value,
                            location=work.location,
                            start_date=work.start_date,
                            end_date=work.end_date,
                            is_current=work.is_current,
                            responsibilities=list(work.responsibilities),
                            achievements=list(work.achievements),
                            source="resumeExtracted",
                            skill_links=[
                                CareerProfileWorkSkill(
                                    id=link_python_id,
                                    career_profile_id=profile_id,
                                    work_experience_id=work.id,
                                    skill_id=python_id,
                                    position=0,
                                ),
                                CareerProfileWorkSkill(
                                    id=link_sql_id,
                                    career_profile_id=profile_id,
                                    work_experience_id=work.id,
                                    skill_id=sql_id,
                                    position=1,
                                ),
                            ],
                        )
                    ],
                )
                session.add(profile)
                await session.commit()

            draft_version = await build_draft(database, user_id, document_id)
            async with database.sessionmaker() as session:
                applied = await ResumeImportApplicationService(
                    session,
                    clock=lambda: NOW,
                ).apply_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                    draft_version=draft_version,
                )
                assert applied.profile.version == 2

            async with database.sessionmaker() as session:
                profile = await load_profile(session, user_id)
                assert profile is not None
                work = profile.work_experiences[0]
                assert [link.skill_id for link in work.skill_links] == [sql_id, go_id]
                assert [link.id for link in work.skill_links][0] == link_sql_id
                assert link_python_id not in {link.id for link in work.skill_links}
                assert len({link.skill_id for link in work.skill_links}) == 2
                rows = (
                    await session.scalars(
                        select(CareerProfileWorkSkill).where(
                            CareerProfileWorkSkill.work_experience_id == work.id
                        )
                    )
                ).all()
                assert len(rows) == 2
                assert {(row.work_experience_id, row.skill_id) for row in rows} == {
                    (work.id, sql_id),
                    (work.id, go_id),
                }

    asyncio.run(run())


def test_application_preserves_matching_analysis_and_replays_idempotently() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            user_id, document_id, source_run_id = await seed(database, "replay")
            profile_id = uuid4()
            role_id = uuid4()
            matching_run_id = uuid4()
            async with database.sessionmaker() as session:
                profile = CareerProfile(
                    profile_id=profile_id,
                    user_id=user_id,
                    summary=None,
                    version=1,
                    education=[],
                    work_experiences=[],
                    project_experiences=[],
                    skills=[],
                )
                role = TargetRole(
                    id=role_id,
                    user_id=user_id,
                    title="Backend Engineer",
                    company="Riva",
                    preparation_status="preparing",
                    job_description_status="missing",
                    version=1,
                )
                matching_run = AgentRun(
                    id=matching_run_id,
                    user_id=user_id,
                    agent_id="matching-analyzer",
                    prompt_id="matching-analyzer",
                    prompt_version="1",
                    output_schema_id="matching-analysis-v1",
                    payload={},
                    idempotency_key=f"matching-{uuid4()}",
                    max_attempts=3,
                    model="test-model",
                )
                analysis = MatchingAnalysis(
                    role_id=role_id,
                    user_id=user_id,
                    profile_id=profile_id,
                    profile_version=1,
                    job_description_version=1,
                    job_description_analysis_version=1,
                    source_agent_run_id=matching_run_id,
                    generated_at=NOW,
                    overall_match_score=80,
                    core_requirements_summary="Build APIs",
                    matched_capabilities=["Python"],
                    missing_capabilities=[],
                    underrepresented_capabilities=[],
                    resume_highlights=[],
                    resume_gaps=[],
                    high_risk_questions=[],
                    preparation_recommendations=[],
                )
                session.add_all([profile, role, matching_run, analysis])
                await session.commit()

            draft_version = await build_draft(database, user_id, document_id)
            async with database.sessionmaker() as session:
                applied = await ResumeImportApplicationService(
                    session,
                    clock=lambda: NOW,
                ).apply_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                    draft_version=draft_version,
                )
                applied_at = applied.draft.applied_at
                assert applied.profile.version == 2

            async with database.sessionmaker() as session:
                persisted_analysis = await session.get(
                    MatchingAnalysis,
                    role_id,
                )
                assert persisted_analysis is not None
                assert persisted_analysis.profile_version == 1

            async with database.sessionmaker() as session:
                replay = await ResumeImportApplicationService(
                    session,
                    clock=lambda: (_ for _ in ()).throw(
                        AssertionError("replay called clock")
                    ),
                ).apply_draft(
                    user_id=user_id,
                    resume_document_id=document_id,
                    draft_version=draft_version,
                )
                assert replay.profile_changed is False
                assert replay.profile_created is False
                assert replay.profile.version == 2
                assert replay.draft.applied_at == applied_at

    asyncio.run(run())


def test_concurrent_application_of_same_draft_changes_profile_once() -> None:
    async def run() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            user_id, document_id, _ = await seed(database, "concurrent")
            draft_version = await build_draft(database, user_id, document_id)

            async def apply_once():
                async with database.sessionmaker() as session:
                    return await ResumeImportApplicationService(
                        session,
                        clock=lambda: NOW,
                    ).apply_draft(
                        user_id=user_id,
                        resume_document_id=document_id,
                        draft_version=draft_version,
                    )

            first, second = await asyncio.gather(apply_once(), apply_once())
            assert sorted(
                (first.profile_changed, second.profile_changed)
            ) == [False, True]
            assert sorted(
                (first.profile_created, second.profile_created)
            ) == [False, True]

            async with database.sessionmaker() as session:
                profile = await load_profile(session, user_id)
                draft = await session.get(ResumeImportDraft, document_id)
                assert profile is not None
                assert draft is not None
                assert profile.version == 1
                assert draft.status == "applied"

    asyncio.run(run())
