import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pytest

from riva.models import (
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
)
from riva.schemas.resume_imports import ResumeImportDraftData
from riva.schemas.resume_parsing import ResumeParsingOutput
from riva.services.resume_import_application import (
    ResumeImportApplicationService,
    apply_resume_import_draft_data,
    merge_resume_import_skills,
    reconcile_project_skill_links,
    reconcile_work_skill_links,
)
from riva.services.resume_imports import (
    RESUME_IMPORT_APPLY_CONFLICT,
    RESUME_IMPORT_DRAFT_INVALID,
    RESUME_IMPORT_PROFILE_INVALID,
    RESUME_IMPORT_PROFILE_VERSION_CONFLICT,
    ResumeImportStateError,
    build_resume_import_draft_data,
)

NOW = datetime(2026, 8, 5, 12, 0, tzinfo=UTC)
USER_ID = UUID("11111111-1111-4111-8111-111111111111")
DOCUMENT_ID = UUID("22222222-2222-4222-8222-222222222222")
SOURCE_RUN_ID = UUID("33333333-3333-4333-8333-333333333333")
EDUCATION_ID = UUID("44444444-4444-4444-8444-444444444444")
WORK_ID = UUID("45444444-4444-4444-8444-444444444444")
PROJECT_ID = UUID("46444444-4444-4444-8444-444444444444")
SKILL_ID = UUID("47444444-4444-4444-8444-444444444444")


class ScalarList:
    def __init__(self, values: list[object]) -> None:
        self.values = values

    def all(self) -> list[object]:
        return self.values


class ApplicationSession:
    def __init__(
        self,
        *scalar_values: object,
        scalar_lists: list[list[object]] | None = None,
        flush_error: BaseException | None = None,
        refresh_error: BaseException | None = None,
        commit_error: BaseException | None = None,
    ) -> None:
        self.scalar_values = list(scalar_values)
        self.scalar_lists = list(scalar_lists or [])
        self.statements: list[Any] = []
        self.added: list[object] = []
        self.events: list[str] = []
        self.flush_error = flush_error
        self.refresh_error = refresh_error
        self.commit_error = commit_error
        self.commit_count = 0
        self.rollback_count = 0
        self.refresh_calls: list[tuple[object, list[str] | None]] = []

    async def scalar(self, statement: Any) -> object:
        self.statements.append(statement)
        if not self.scalar_values:
            raise AssertionError("unexpected scalar query")
        return self.scalar_values.pop(0)

    async def scalars(self, statement: Any) -> ScalarList:
        self.statements.append(statement)
        if not self.scalar_lists:
            raise AssertionError("unexpected scalars query")
        return ScalarList(self.scalar_lists.pop(0))

    def add(self, value: object) -> None:
        self.added.append(value)

    async def flush(self) -> None:
        self.events.append("flush")
        if self.flush_error is not None:
            raise self.flush_error

    async def commit(self) -> None:
        self.events.append("commit")
        if self.commit_error is not None:
            raise self.commit_error
        self.commit_count += 1

    async def rollback(self) -> None:
        self.events.append("rollback")
        self.rollback_count += 1

    async def refresh(
        self,
        instance: object,
        *,
        attribute_names: list[str] | None = None,
    ) -> None:
        self.events.append("refresh")
        if self.refresh_error is not None:
            raise self.refresh_error
        self.refresh_calls.append((instance, attribute_names))


def empty_profile(*, version: int = 1, summary: str | None = None) -> CareerProfile:
    return CareerProfile(
        profile_id=uuid4(),
        user_id=USER_ID,
        summary=summary,
        version=version,
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=[],
    )


def parsing_output(summary: str | None = "Resume summary") -> ResumeParsingOutput:
    return ResumeParsingOutput(
        summary=summary,
        education=[
            {
                "school": "Example University",
                "degree": "BSc",
                "major": "Computer Science",
                "start_date": "2020-09",
                "end_date": "2024-06",
                "is_current": False,
            }
        ],
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
        project_experiences=[
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
        ],
        skills=["Python"],
        unresolved_items=[],
    )


def empty_data() -> ResumeImportDraftData:
    return ResumeImportDraftData.model_validate(
        {
            "summary": None,
            "summary_action": "none",
            "education": [],
            "work_experiences": [],
            "project_experiences": [],
            "skills": [],
            "unresolved_items": [],
            "skipped_items": [],
            "protected_items": [],
            "change_summary": {
                "new_items": 0,
                "changed_items": 0,
                "missing_items": 0,
            },
        }
    )


def full_data() -> ResumeImportDraftData:
    return ResumeImportDraftData.model_validate(
        {
            "summary": "Resume summary",
            "summary_action": "set",
            "education": [
                {
                    "id": str(EDUCATION_ID),
                    "school": "Example University",
                    "degree": "BSc",
                    "major": "Computer Science",
                    "start_date": "2020-09",
                    "end_date": "2024-06",
                    "is_current": False,
                }
            ],
            "work_experiences": [
                {
                    "id": str(WORK_ID),
                    "company": "Example Co",
                    "title": "Engineer",
                    "employment_type": "fullTime",
                    "location": "Remote",
                    "start_date": "2024-07",
                    "end_date": None,
                    "is_current": True,
                    "responsibilities": ["Build APIs"],
                    "achievements": ["Shipped platform"],
                    "skill_ids": [str(SKILL_ID)],
                }
            ],
            "project_experiences": [
                {
                    "id": str(PROJECT_ID),
                    "name": "Import Project",
                    "role": "Developer",
                    "start_date": "2023-01",
                    "end_date": None,
                    "responsibilities": ["Design"],
                    "achievements": ["Released"],
                    "skill_ids": [str(SKILL_ID)],
                    "project_url": "https://example.com/project",
                }
            ],
            "skills": [{"id": str(SKILL_ID), "name": "Python"}],
            "unresolved_items": [],
            "skipped_items": [],
            "protected_items": [],
            "change_summary": {
                "new_items": 0,
                "changed_items": 0,
                "missing_items": 0,
            },
        }
    )


def skills_by_id(
    profile_id: UUID,
    skill_ids: list[UUID],
) -> dict[UUID, CareerProfileSkill]:
    return {
        skill_id: CareerProfileSkill(
            id=skill_id,
            career_profile_id=profile_id,
            position=position,
            name=f"Skill {position}",
            normalized_name=f"skill {position}",
            source="resumeExtracted",
        )
        for position, skill_id in enumerate(skill_ids)
    }


def work_with_skill_links(
    profile_id: UUID,
    experience_id: UUID,
    skill_ids: list[UUID],
    link_ids: list[UUID],
) -> CareerProfileWorkExperience:
    experience = CareerProfileWorkExperience(
        id=experience_id,
        career_profile_id=profile_id,
        position=0,
        company="Example Co",
        title="Engineer",
        employment_type="fullTime",
        location=None,
        start_date="2024-01",
        end_date=None,
        is_current=True,
        responsibilities=[],
        achievements=[],
        source="resumeExtracted",
    )
    experience.skill_links = [
        CareerProfileWorkSkill(
            id=link_id,
            career_profile_id=profile_id,
            work_experience_id=experience_id,
            skill_id=skill_id,
            position=position,
        )
        for position, (skill_id, link_id) in enumerate(zip(skill_ids, link_ids))
    ]
    return experience


def project_with_skill_links(
    profile_id: UUID,
    project_id: UUID,
    skill_ids: list[UUID],
    link_ids: list[UUID],
) -> CareerProfileProjectExperience:
    project = CareerProfileProjectExperience(
        id=project_id,
        career_profile_id=profile_id,
        position=0,
        name="Example Project",
        role="Engineer",
        start_date="2024-01",
        end_date=None,
        responsibilities=[],
        achievements=[],
        project_url=None,
        source="resumeExtracted",
    )
    project.skill_links = [
        CareerProfileProjectSkill(
            id=link_id,
            career_profile_id=profile_id,
            project_experience_id=project_id,
            skill_id=skill_id,
            position=position,
        )
        for position, (skill_id, link_id) in enumerate(zip(skill_ids, link_ids))
    ]
    return project


def graph(
    *,
    parsed_output: ResumeParsingOutput | None = None,
) -> tuple[ResumeDocument, ResumeParsingResult]:
    document = ResumeDocument(
        id=DOCUMENT_ID,
        user_id=USER_ID,
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
        parsing_run_id=SOURCE_RUN_ID,
        created_at=NOW,
        updated_at=NOW,
    )
    output = parsed_output or parsing_output()
    values = output.model_dump(mode="json", by_alias=False)
    result = ResumeParsingResult(
        resume_document_id=DOCUMENT_ID,
        user_id=USER_ID,
        result_version=1,
        source_agent_run_id=SOURCE_RUN_ID,
        parsed_at=NOW,
        summary=values["summary"],
        education=values["education"],
        work_experiences=values["work_experiences"],
        project_experiences=values["project_experiences"],
        skills=values["skills"],
        unresolved_items=values["unresolved_items"],
    )
    return document, result


def draft_from_data(
    data: ResumeImportDraftData,
    *,
    status: str = "ready",
    base_profile_id: UUID | None = None,
    base_profile_version: int | None = None,
    applied_profile_version: int | None = None,
    applied_at: datetime | None = None,
) -> ResumeImportDraft:
    values = data.model_dump(mode="json", by_alias=False)
    return ResumeImportDraft(
        resume_document_id=DOCUMENT_ID,
        user_id=USER_ID,
        parsing_result_version=1,
        source_agent_run_id=SOURCE_RUN_ID,
        base_profile_id=base_profile_id,
        base_profile_version=base_profile_version,
        draft_version=1,
        status=status,
        summary=values["summary"],
        summary_action=values["summary_action"],
        education=values["education"],
        work_experiences=values["work_experiences"],
        project_experiences=values["project_experiences"],
        skills=values["skills"],
        unresolved_items=values["unresolved_items"],
        skipped_items=values["skipped_items"],
        protected_items=values["protected_items"],
        change_summary=values["change_summary"],
        applied_profile_version=applied_profile_version,
        applied_at=applied_at,
        created_at=NOW,
        updated_at=NOW,
    )


def ready_application_session(
    *,
    profile: CareerProfile | None = None,
    **session_kwargs: object,
) -> ApplicationSession:
    document, result = graph()
    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=_parsed_output_from_result(result),
        profile=profile,
    )
    draft = draft_from_data(
        data,
        base_profile_id=profile.profile_id if profile is not None else None,
        base_profile_version=profile.version if profile is not None else None,
    )
    return ApplicationSession(
        USER_ID,
        document,
        result,
        profile,
        draft,
        scalar_lists=[[]],
        **session_kwargs,
    )


def test_merge_skills_reuses_normalized_names_and_preserves_manual_values() -> None:
    current_resume_id = uuid4()
    current_manual_id = uuid4()
    profile = empty_profile()
    profile.skills = [
        CareerProfileSkill(
            id=current_resume_id,
            career_profile_id=profile.profile_id,
            position=0,
            name="Python",
            normalized_name="python",
            source="resumeExtracted",
        ),
        CareerProfileSkill(
            id=current_manual_id,
            career_profile_id=profile.profile_id,
            position=1,
            name="SQL Server",
            normalized_name="sql server",
            source="userEdited",
        ),
    ]
    draft_python_id = uuid4()
    draft_sql_id = uuid4()
    draft_new_id = uuid4()
    draft = [
        {"id": str(draft_python_id), "name": "PYTHON"},
        {"id": str(draft_sql_id), "name": " sql   server "},
        {"id": str(draft_new_id), "name": "Go"},
    ]
    from riva.schemas.profile import CareerProfileSkillInput

    mapping = merge_resume_import_skills(
        profile,
        [CareerProfileSkillInput.model_validate(item) for item in draft],
    )

    assert mapping == {
        draft_python_id: current_resume_id,
        draft_sql_id: current_manual_id,
        draft_new_id: draft_new_id,
    }
    assert [item.id for item in profile.skills] == [
        current_resume_id,
        current_manual_id,
        draft_new_id,
    ]
    assert [item.position for item in profile.skills] == [0, 1, 2]
    assert profile.skills[0].name == "PYTHON"
    assert profile.skills[1].name == "SQL Server"
    assert profile.skills[1].source == "userEdited"
    assert profile.skills[2].source == "resumeExtracted"


def test_merge_sections_updates_resume_items_and_protects_manual_items() -> None:
    data = full_data()
    profile = empty_profile()
    manual_education_id = uuid4()
    missing_education_id = uuid4()
    manual_work_id = uuid4()
    manual_project_id = uuid4()
    manual_skill_id = uuid4()
    profile.skills = [
        CareerProfileSkill(
            id=manual_skill_id,
            career_profile_id=profile.profile_id,
            position=0,
            name="Python",
            normalized_name="python",
            source="userAdded",
        )
    ]
    profile.education = [
        CareerProfileEducation(
            id=manual_education_id,
            career_profile_id=profile.profile_id,
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
            id=EDUCATION_ID,
            career_profile_id=profile.profile_id,
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
            career_profile_id=profile.profile_id,
            position=2,
            school="Missing Resume University",
            degree=None,
            major=None,
            start_date="2000-01",
            end_date="2004-01",
            is_current=False,
            source="resumeExtracted",
        ),
    ]
    manual_work = CareerProfileWorkExperience(
        id=manual_work_id,
        career_profile_id=profile.profile_id,
        position=0,
        company="Manual Co",
        title="Manual title",
        employment_type="fullTime",
        location=None,
        start_date="2010-01",
        end_date="2011-01",
        is_current=False,
        responsibilities=["Keep"],
        achievements=[],
        source="userAdded",
    )
    manual_work_link = CareerProfileWorkSkill(
        id=uuid4(),
        career_profile_id=profile.profile_id,
        work_experience_id=manual_work_id,
        skill_id=manual_skill_id,
        position=0,
    )
    manual_work.skill_links = [manual_work_link]
    profile.work_experiences = [manual_work]
    manual_project = CareerProfileProjectExperience(
        id=manual_project_id,
        career_profile_id=profile.profile_id,
        position=0,
        name="Manual project",
        role=None,
        start_date="2010-01",
        end_date=None,
        responsibilities=["Keep"],
        achievements=[],
        project_url=None,
        source="userEdited",
    )
    manual_project_link = CareerProfileProjectSkill(
        id=uuid4(),
        career_profile_id=profile.profile_id,
        project_experience_id=manual_project_id,
        skill_id=manual_skill_id,
        position=0,
    )
    manual_project.skill_links = [manual_project_link]
    profile.project_experiences = [manual_project]

    apply_resume_import_draft_data(profile, data)

    assert profile.summary == "Resume summary"
    assert [item.id for item in profile.education] == [
        manual_education_id,
        EDUCATION_ID,
        missing_education_id,
    ]
    assert profile.education[0].school == "Manual University"
    assert profile.education[1].school == "Example University"
    assert profile.education[2].school == "Missing Resume University"
    assert profile.education[1].source == "resumeExtracted"
    assert [item.position for item in profile.education] == [0, 1, 2]

    assert [item.id for item in profile.work_experiences] == [
        manual_work_id,
        WORK_ID,
    ]
    assert profile.work_experiences[0].title == "Manual title"
    assert profile.work_experiences[0].skill_ids == [manual_skill_id]
    assert profile.work_experiences[0].skill_links[0] is manual_work_link
    assert profile.work_experiences[0].source == "userAdded"
    assert profile.work_experiences[1].title == "Engineer"
    assert profile.work_experiences[1].skill_ids == [manual_skill_id]

    assert [item.id for item in profile.project_experiences] == [
        manual_project_id,
        PROJECT_ID,
    ]
    assert profile.project_experiences[0].name == "Manual project"
    assert profile.project_experiences[0].skill_ids == [manual_skill_id]
    assert profile.project_experiences[0].skill_links[0] is manual_project_link
    assert profile.project_experiences[0].source == "userEdited"
    assert profile.project_experiences[1].skill_ids == [manual_skill_id]
    assert [item.position for item in profile.project_experiences] == [0, 1]


def test_reconcile_work_skill_links_reuses_existing_link() -> None:
    profile_id = uuid4()
    experience_id = uuid4()
    draft_skill_id = uuid4()
    persisted_skill_id = uuid4()
    link_id = uuid4()
    skills = skills_by_id(profile_id, [persisted_skill_id])
    experience = work_with_skill_links(
        profile_id,
        experience_id,
        [persisted_skill_id],
        [link_id],
    )
    existing_link = experience.skill_links[0]

    reconciled = reconcile_work_skill_links(
        profile_id=profile_id,
        experience=experience,
        draft_skill_ids=[draft_skill_id],
        persisted_skill_ids={draft_skill_id: persisted_skill_id},
        skills_by_id=skills,
    )

    assert reconciled == [existing_link]
    assert reconciled[0] is existing_link
    assert reconciled[0].id == link_id
    assert reconciled[0].position == 0


def test_reconcile_project_skill_links_reuses_existing_link() -> None:
    profile_id = uuid4()
    project_id = uuid4()
    draft_skill_id = uuid4()
    persisted_skill_id = uuid4()
    link_id = uuid4()
    skills = skills_by_id(profile_id, [persisted_skill_id])
    project = project_with_skill_links(
        profile_id,
        project_id,
        [persisted_skill_id],
        [link_id],
    )
    existing_link = project.skill_links[0]

    reconciled = reconcile_project_skill_links(
        profile_id=profile_id,
        project=project,
        draft_skill_ids=[draft_skill_id],
        persisted_skill_ids={draft_skill_id: persisted_skill_id},
        skills_by_id=skills,
    )

    assert reconciled == [existing_link]
    assert reconciled[0] is existing_link
    assert reconciled[0].id == link_id
    assert reconciled[0].position == 0


def test_reconcile_work_skill_links_reorders_and_reuses_links() -> None:
    profile_id = uuid4()
    experience_id = uuid4()
    skill_a, skill_b = uuid4(), uuid4()
    draft_a, draft_b = uuid4(), uuid4()
    link_a, link_b = uuid4(), uuid4()
    experience = work_with_skill_links(
        profile_id,
        experience_id,
        [skill_a, skill_b],
        [link_a, link_b],
    )

    reconciled = reconcile_work_skill_links(
        profile_id=profile_id,
        experience=experience,
        draft_skill_ids=[draft_b, draft_a],
        persisted_skill_ids={draft_a: skill_a, draft_b: skill_b},
        skills_by_id=skills_by_id(profile_id, [skill_a, skill_b]),
    )

    assert [link.id for link in reconciled] == [link_b, link_a]
    assert [link.skill_id for link in reconciled] == [skill_b, skill_a]
    assert [link.position for link in reconciled] == [0, 1]


def test_reconcile_work_skill_links_removes_old_and_creates_new_link() -> None:
    profile_id = uuid4()
    experience_id = uuid4()
    skill_a, skill_b, skill_c = uuid4(), uuid4(), uuid4()
    draft_a, draft_b, draft_c = uuid4(), uuid4(), uuid4()
    link_a, link_b = uuid4(), uuid4()
    experience = work_with_skill_links(
        profile_id,
        experience_id,
        [skill_a, skill_b],
        [link_a, link_b],
    )

    reconciled = reconcile_work_skill_links(
        profile_id=profile_id,
        experience=experience,
        draft_skill_ids=[draft_b, draft_c],
        persisted_skill_ids={
            draft_a: skill_a,
            draft_b: skill_b,
            draft_c: skill_c,
        },
        skills_by_id=skills_by_id(profile_id, [skill_a, skill_b, skill_c]),
    )

    assert [link.id for link in reconciled] == [link_b, reconciled[1].id]
    assert reconciled[1].id not in {link_a, link_b}
    assert [link.skill_id for link in reconciled] == [skill_b, skill_c]
    assert [link.position for link in reconciled] == [0, 1]
    assert link_a not in {link.id for link in reconciled}


def test_reconcile_project_skill_links_reorders_and_replaces_links() -> None:
    profile_id = uuid4()
    project_id = uuid4()
    skill_a, skill_b, skill_c = uuid4(), uuid4(), uuid4()
    draft_a, draft_b, draft_c = uuid4(), uuid4(), uuid4()
    link_a, link_b = uuid4(), uuid4()
    project = project_with_skill_links(
        profile_id,
        project_id,
        [skill_a, skill_b],
        [link_a, link_b],
    )

    reconciled = reconcile_project_skill_links(
        profile_id=profile_id,
        project=project,
        draft_skill_ids=[draft_b, draft_c],
        persisted_skill_ids={
            draft_a: skill_a,
            draft_b: skill_b,
            draft_c: skill_c,
        },
        skills_by_id=skills_by_id(profile_id, [skill_a, skill_b, skill_c]),
    )

    assert reconciled[0] is project.skill_links[1]
    assert [link.skill_id for link in reconciled] == [skill_b, skill_c]
    assert [link.position for link in reconciled] == [0, 1]
    assert reconciled[1].id not in {link_a, link_b}
    assert link_a not in {link.id for link in reconciled}


def test_reconcile_rejects_duplicate_draft_skill_mapping_without_links() -> None:
    profile_id = uuid4()
    experience = work_with_skill_links(profile_id, uuid4(), [], [])
    skill_id = uuid4()
    draft_a, draft_b = uuid4(), uuid4()

    with pytest.raises(ResumeImportStateError) as exc_info:
        reconcile_work_skill_links(
            profile_id=profile_id,
            experience=experience,
            draft_skill_ids=[draft_a, draft_b],
            persisted_skill_ids={draft_a: skill_id, draft_b: skill_id},
            skills_by_id=skills_by_id(profile_id, [skill_id]),
        )

    assert exc_info.value.code == RESUME_IMPORT_APPLY_CONFLICT
    assert experience.skill_links == []


def test_reconcile_rejects_duplicate_existing_skill_links() -> None:
    profile_id = uuid4()
    skill_id = uuid4()
    experience = work_with_skill_links(
        profile_id,
        uuid4(),
        [skill_id, skill_id],
        [uuid4(), uuid4()],
    )
    draft_skill_id = uuid4()

    with pytest.raises(ResumeImportStateError) as exc_info:
        reconcile_work_skill_links(
            profile_id=profile_id,
            experience=experience,
            draft_skill_ids=[draft_skill_id],
            persisted_skill_ids={draft_skill_id: skill_id},
            skills_by_id=skills_by_id(profile_id, [skill_id]),
        )

    assert exc_info.value.code == RESUME_IMPORT_PROFILE_INVALID


@pytest.mark.parametrize(
    ("attribute", "value"),
    [
        ("id", "not-a-uuid"),
        ("skill_id", "not-a-uuid"),
        ("career_profile_id", uuid4()),
        ("work_experience_id", uuid4()),
    ],
)
def test_reconcile_rejects_inconsistent_existing_work_link(
    attribute: str,
    value: object,
) -> None:
    profile_id = uuid4()
    skill_id = uuid4()
    experience = work_with_skill_links(
        profile_id,
        uuid4(),
        [skill_id],
        [uuid4()],
    )
    setattr(experience.skill_links[0], attribute, value)
    draft_skill_id = uuid4()

    with pytest.raises(ResumeImportStateError) as exc_info:
        reconcile_work_skill_links(
            profile_id=profile_id,
            experience=experience,
            draft_skill_ids=[draft_skill_id],
            persisted_skill_ids={draft_skill_id: skill_id},
            skills_by_id=skills_by_id(profile_id, [skill_id]),
        )

    assert exc_info.value.code == RESUME_IMPORT_PROFILE_INVALID


def test_merge_rejects_skill_id_collision() -> None:
    profile = empty_profile()
    occupied_id = uuid4()
    profile.skills = [
        CareerProfileSkill(
            id=occupied_id,
            career_profile_id=profile.profile_id,
            position=0,
            name="Existing",
            normalized_name="existing",
            source="userAdded",
        )
    ]
    from riva.schemas.profile import CareerProfileSkillInput

    with pytest.raises(ResumeImportStateError) as exc_info:
        merge_resume_import_skills(
            profile,
            [CareerProfileSkillInput(id=occupied_id, name="Different")],
        )
    assert exc_info.value.code == RESUME_IMPORT_APPLY_CONFLICT


def test_apply_creates_profile_with_deterministic_ids_and_applies_draft() -> None:
    document, result = graph()
    parsed = _parsed_output_from_result(result)
    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=parsed,
        profile=None,
    )
    draft = draft_from_data(data)
    session = ApplicationSession(
        USER_ID,
        document,
        result,
        None,
        draft,
        scalar_lists=[[]],
    )
    profile_id = uuid4()
    factory_calls = 0

    def factory() -> UUID:
        nonlocal factory_calls
        factory_calls += 1
        return profile_id

    application = asyncio.run(
        ResumeImportApplicationService(
            session,
            clock=lambda: NOW,
            profile_id_factory=factory,
        ).apply_draft(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
            draft_version=1,
        )
    )

    assert application.profile.profile_id == profile_id
    assert application.profile.user_id == USER_ID
    assert application.profile.version == 1
    assert application.profile_created is True
    assert application.profile_changed is True
    assert draft.status == "applied"
    assert draft.applied_profile_version == 1
    assert draft.applied_at == NOW
    assert factory_calls == 1
    assert session.commit_count == 1
    assert session.rollback_count == 0
    assert session.events == ["flush", "refresh", "commit"]
    assert session.refresh_calls == [
        (application.profile, ["updated_at"]),
    ]
    assert len(session.statements) == 6
    assert all("FOR UPDATE" in str(statement) for statement in session.statements)
    assert all(
        item.source == "resumeExtracted"
        for item in (
            *application.profile.education,
            *application.profile.work_experiences,
            *application.profile.project_experiences,
            *application.profile.skills,
        )
    )
    assert [item.id for item in application.profile.education] == [data.education[0].id]
    assert application.profile.work_experiences[0].skill_ids == [data.skills[0].id]


def test_existing_profile_change_flushes_refreshes_then_commits() -> None:
    profile = empty_profile()
    session = ready_application_session(profile=profile)

    application = asyncio.run(
        ResumeImportApplicationService(
            session,
            clock=lambda: NOW,
        ).apply_draft(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
            draft_version=1,
        )
    )

    assert application.profile_changed is True
    assert application.profile.version == 2
    assert session.events == ["flush", "refresh", "commit"]
    assert session.commit_count == 1
    assert session.refresh_calls == [
        (profile, ["updated_at"]),
    ]


def test_first_import_with_no_summary_keeps_profile_summary_none() -> None:
    document, result = graph(parsed_output=parsing_output(summary=None))
    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=_parsed_output_from_result(result),
        profile=None,
    )
    draft = draft_from_data(data)
    session = ApplicationSession(
        USER_ID,
        document,
        result,
        None,
        draft,
        scalar_lists=[[]],
    )

    application = asyncio.run(
        ResumeImportApplicationService(session, clock=lambda: NOW).apply_draft(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
            draft_version=1,
        )
    )

    assert application.profile.summary is None
    assert application.profile.version == 1
    assert application.profile_created is True
    assert application.profile.education
    assert application.profile.work_experiences
    assert application.profile.project_experiences
    assert application.profile.skills


def test_applied_replay_is_idempotent_without_clock_or_factory() -> None:
    document, result = graph()
    parsed = _parsed_output_from_result(result)
    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=parsed,
        profile=None,
    )
    profile = empty_profile(version=1, summary="Resume summary")
    profile.updated_at = NOW
    draft = draft_from_data(
        data,
        status="applied",
        applied_profile_version=1,
        applied_at=NOW,
    )
    session = ApplicationSession(USER_ID, document, result, profile, draft)

    def fail_clock() -> datetime:
        raise AssertionError("idempotent replay called clock")

    def fail_factory() -> UUID:
        raise AssertionError("idempotent replay called factory")

    application = asyncio.run(
        ResumeImportApplicationService(
            session,
            clock=fail_clock,
            profile_id_factory=fail_factory,
        ).apply_draft(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
            draft_version=1,
        )
    )

    assert application.profile is profile
    assert application.draft is draft
    assert application.profile_created is False
    assert application.profile_changed is False
    assert profile.version == 1
    assert draft.applied_at == NOW
    assert session.commit_count == 1
    assert session.rollback_count == 0
    assert profile.updated_at == NOW
    assert session.events == ["commit"]
    assert session.refresh_calls == []


@pytest.mark.parametrize(
    ("failure", "expected_events"),
    [
        (RuntimeError("refresh failed"), ["flush", "refresh", "rollback"]),
        (asyncio.CancelledError(), ["flush", "refresh", "rollback"]),
    ],
)
def test_refresh_failure_rolls_back_before_commit(
    failure: BaseException,
    expected_events: list[str],
) -> None:
    session = ready_application_session(refresh_error=failure)

    with pytest.raises(type(failure)):
        asyncio.run(
            ResumeImportApplicationService(session, clock=lambda: NOW).apply_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
                draft_version=1,
            )
        )

    assert session.events == expected_events
    assert session.commit_count == 0
    assert session.rollback_count == 1
    assert session.refresh_calls == []


def test_flush_failure_rolls_back_before_refresh_or_commit() -> None:
    session = ready_application_session(flush_error=RuntimeError("flush failed"))

    with pytest.raises(RuntimeError, match="flush failed"):
        asyncio.run(
            ResumeImportApplicationService(session, clock=lambda: NOW).apply_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
                draft_version=1,
            )
        )

    assert session.events == ["flush", "rollback"]
    assert session.commit_count == 0
    assert session.rollback_count == 1
    assert session.refresh_calls == []


def test_commit_failure_rolls_back_without_post_commit_database_operations() -> None:
    session = ready_application_session(commit_error=RuntimeError("commit failed"))

    with pytest.raises(RuntimeError, match="commit failed"):
        asyncio.run(
            ResumeImportApplicationService(session, clock=lambda: NOW).apply_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
                draft_version=1,
            )
        )

    assert session.events == ["flush", "refresh", "commit", "rollback"]
    assert session.commit_count == 0
    assert session.rollback_count == 1
    assert session.refresh_calls == [
        (session.added[0], ["updated_at"]),
    ]


def test_ready_base_profile_conflict_does_not_apply() -> None:
    document, result = graph()
    parsed = _parsed_output_from_result(result)
    profile = empty_profile(version=2)
    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=parsed,
        profile=None,
    )
    draft = draft_from_data(data)
    session = ApplicationSession(USER_ID, document, result, profile, draft)

    with pytest.raises(ResumeImportStateError) as exc_info:
        asyncio.run(
            ResumeImportApplicationService(session).apply_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
                draft_version=1,
            )
        )

    assert exc_info.value.code == RESUME_IMPORT_PROFILE_VERSION_CONFLICT
    assert draft.status == "ready"
    assert session.commit_count == 0
    assert session.rollback_count == 1


def test_tampered_draft_json_rolls_back() -> None:
    document, result = graph()
    parsed = _parsed_output_from_result(result)
    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=parsed,
        profile=None,
    )
    draft = draft_from_data(data)
    draft.education[0]["school"] = "Tampered"
    session = ApplicationSession(USER_ID, document, result, None, draft)

    with pytest.raises(ResumeImportStateError) as exc_info:
        asyncio.run(
            ResumeImportApplicationService(session).apply_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
                draft_version=1,
            )
        )

    assert exc_info.value.code == RESUME_IMPORT_DRAFT_INVALID
    assert session.added == []
    assert session.commit_count == 0
    assert session.rollback_count == 1


def test_non_uuid_profile_factory_rolls_back() -> None:
    document, result = graph()
    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=_parsed_output_from_result(result),
        profile=None,
    )
    draft = draft_from_data(data)
    session = ApplicationSession(USER_ID, document, result, None, draft)

    with pytest.raises(ResumeImportStateError) as exc_info:
        asyncio.run(
            ResumeImportApplicationService(
                session,
                profile_id_factory=lambda: "not-a-uuid",  # type: ignore[return-value]
            ).apply_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
                draft_version=1,
            )
        )

    assert exc_info.value.code == RESUME_IMPORT_APPLY_CONFLICT
    assert session.commit_count == 0
    assert session.rollback_count == 1


def test_profile_change_supersedes_other_ready_drafts() -> None:
    document, result = graph()
    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=_parsed_output_from_result(result),
        profile=None,
    )
    draft = draft_from_data(data)
    other = draft_from_data(empty_data())
    other.resume_document_id = uuid4()
    other.source_agent_run_id = uuid4()
    original_other_version = other.draft_version
    original_other_summary = other.summary
    session = ApplicationSession(
        USER_ID,
        document,
        result,
        None,
        draft,
        scalar_lists=[[other]],
    )

    application = asyncio.run(
        ResumeImportApplicationService(session, clock=lambda: NOW).apply_draft(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
            draft_version=1,
        )
    )

    assert application.profile_changed is True
    assert other.status == "superseded"
    assert other.draft_version == original_other_version
    assert other.summary == original_other_summary
    assert other.applied_profile_version is None
    assert other.applied_at is None


def test_no_profile_business_change_does_not_supersede_other_drafts() -> None:
    document, result = graph()
    parsed = _parsed_output_from_result(result)
    profile = empty_profile()
    initial = build_resume_import_draft_data(
        user_id=USER_ID,
        result=parsed,
        profile=None,
    )
    apply_resume_import_draft_data(profile, initial)
    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=parsed,
        profile=profile,
    )
    draft = draft_from_data(
        data,
        base_profile_id=profile.profile_id,
        base_profile_version=profile.version,
    )
    session = ApplicationSession(USER_ID, document, result, profile, draft)

    application = asyncio.run(
        ResumeImportApplicationService(session, clock=lambda: NOW).apply_draft(
            user_id=USER_ID,
            resume_document_id=DOCUMENT_ID,
            draft_version=1,
        )
    )

    assert application.profile_changed is False
    assert profile.version == 1
    assert draft.status == "applied"
    assert session.events == ["commit"]
    assert session.refresh_calls == []
    assert len(session.statements) == 5


@pytest.mark.parametrize("profile_exists", [False, True])
def test_applied_profile_state_conflicts_without_mutation(
    profile_exists: bool,
) -> None:
    document, result = graph()
    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=_parsed_output_from_result(result),
        profile=None,
    )
    profile = empty_profile(version=2) if profile_exists else None
    draft = draft_from_data(
        data,
        status="applied",
        applied_profile_version=1,
        applied_at=NOW,
    )
    session = ApplicationSession(USER_ID, document, result, profile, draft)
    before = (
        draft.status,
        draft.draft_version,
        draft.applied_profile_version,
        draft.applied_at,
    )

    with pytest.raises(ResumeImportStateError) as exc_info:
        asyncio.run(
            ResumeImportApplicationService(session).apply_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
                draft_version=1,
            )
        )

    assert exc_info.value.code == RESUME_IMPORT_APPLY_CONFLICT
    assert (
        draft.status,
        draft.draft_version,
        draft.applied_profile_version,
        draft.applied_at,
    ) == before
    assert session.commit_count == 0
    assert session.rollback_count == 1


def test_naive_application_clock_rolls_back() -> None:
    document, result = graph()
    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=_parsed_output_from_result(result),
        profile=None,
    )
    draft = draft_from_data(data)
    session = ApplicationSession(USER_ID, document, result, None, draft)

    with pytest.raises(ValueError, match="timezone-aware"):
        asyncio.run(
            ResumeImportApplicationService(
                session,
                clock=lambda: datetime(2026, 8, 5, 12, 0),
            ).apply_draft(
                user_id=USER_ID,
                resume_document_id=DOCUMENT_ID,
                draft_version=1,
            )
        )

    assert session.commit_count == 0
    assert session.rollback_count == 1


def _parsed_output_from_result(result: ResumeParsingResult) -> ResumeParsingOutput:
    return ResumeParsingOutput.model_validate(
        {
            "summary": result.summary,
            "education": result.education,
            "work_experiences": result.work_experiences,
            "project_experiences": result.project_experiences,
            "skills": result.skills,
            "unresolved_items": result.unresolved_items,
        }
    )
