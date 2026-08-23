from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from riva.agents.resumes.types import ResumeParsingOutput
from riva.models import (
    CareerProfile,
    CareerProfileEducation,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
)
from riva.schemas.profile import EmploymentType
from riva.services.resumes.drafts import (
    RESUME_IMPORT_NAMESPACE,
    ResumeImportStateError,
    build_resume_import_draft_data,
    build_resume_import_item_id,
    canonicalize_resume_import_identity,
)

USER_ID = UUID("11111111-1111-4111-8111-111111111111")
OTHER_USER_ID = UUID("22222222-2222-4222-8222-222222222222")
NOW = datetime(2026, 8, 5, 12, 0, tzinfo=UTC)


def parsed_output() -> ResumeParsingOutput:
    return ResumeParsingOutput(
        summary="Parsed summary",
        education=[
            {
                "school": "Example University",
                "degree": "BSc",
                "major": "Computer Science",
                "start_date": "2020-09",
                "end_date": "2024-06",
                "is_current": False,
            },
            {
                "school": "Incomplete University",
                "degree": None,
                "major": None,
                "start_date": "2020",
                "end_date": "2024-06",
                "is_current": False,
            },
        ],
        work_experiences=[
            {
                "company": "Example Co",
                "title": "Engineer",
                "employment_type": EmploymentType.FULL_TIME,
                "location": "Remote",
                "start_date": "2024-07",
                "end_date": None,
                "is_current": True,
                "responsibilities": ["Build APIs"],
                "achievements": ["Shipped platform"],
                "skills": ["Python"],
            },
            {
                "company": "Unknown Type Co",
                "title": "Consultant",
                "employment_type": None,
                "location": None,
                "start_date": "2022-01",
                "end_date": "2023-01",
                "is_current": False,
                "responsibilities": [],
                "achievements": [],
                "skills": [],
            },
        ],
        project_experiences=[
            {
                "name": "Open Project",
                "role": "Developer",
                "start_date": "2023-01",
                "end_date": None,
                "is_current": None,
                "responsibilities": ["Design"],
                "achievements": ["Released"],
                "skills": ["Python", "SQL"],
                "project_url": "https://example.com/project",
            },
            {
                "name": "Imprecise Project",
                "role": None,
                "start_date": "2023-01",
                "end_date": "2024",
                "is_current": False,
                "responsibilities": [],
                "achievements": [],
                "skills": [],
                "project_url": None,
            },
        ],
        skills=["Python", "SQL"],
        unresolved_items=["Confirm certification"],
    )


def simple_output() -> ResumeParsingOutput:
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
        work_experiences=[
            {
                "company": "Example Co",
                "title": "Engineer",
                "employment_type": "fullTime",
                "location": None,
                "start_date": "2024-07",
                "end_date": None,
                "is_current": True,
                "responsibilities": ["Build APIs"],
                "achievements": [],
                "skills": ["Python"],
            }
        ],
        project_experiences=[],
        skills=["Python"],
        unresolved_items=[],
    )


def ordinary_technical_resume_output() -> ResumeParsingOutput:
    return ResumeParsingOutput(
        summary=None,
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
                "title": "Backend Engineer",
                "employment_type": EmploymentType.FULL_TIME,
                "location": "Shanghai",
                "start_date": "2024-07",
                "end_date": None,
                "is_current": True,
                "responsibilities": ["Build Python APIs"],
                "achievements": ["Improved service reliability"],
                "skills": ["Python"],
            }
        ],
        project_experiences=[
            {
                "name": "API Platform",
                "role": "Developer",
                "start_date": "2023-01",
                "end_date": None,
                "is_current": None,
                "responsibilities": ["Design service integrations"],
                "achievements": ["Released the first version"],
                "skills": ["Python"],
                "project_url": None,
            }
        ],
        skills=["Python"],
        unresolved_items=[],
    )


def test_deterministic_ids_are_user_and_section_scoped() -> None:
    key = '["example","2024-01"]'
    first = build_resume_import_item_id(
        user_id=USER_ID,
        section="education",
        identity_key=key,
        occurrence=0,
    )
    assert first == build_resume_import_item_id(
        user_id=USER_ID,
        section="education",
        identity_key=key,
        occurrence=0,
    )
    assert first == build_resume_import_item_id(
        user_id=USER_ID,
        section="education",
        identity_key=key,
        occurrence=0,
    )
    assert first != build_resume_import_item_id(
        user_id=OTHER_USER_ID,
        section="education",
        identity_key=key,
        occurrence=0,
    )
    assert first != build_resume_import_item_id(
        user_id=USER_ID,
        section="workExperience",
        identity_key=key,
        occurrence=0,
    )
    assert first != build_resume_import_item_id(
        user_id=USER_ID,
        section="education",
        identity_key=key,
        occurrence=1,
    )
    assert RESUME_IMPORT_NAMESPACE.version == 4


def test_identity_canonicalization_is_nfc_whitespace_and_case_stable() -> None:
    assert canonicalize_resume_import_identity(" e\u0301\t  PYTHON ") == "é python"
    assert canonicalize_resume_import_identity(None) == ""


def test_conversion_filters_lossy_sections_without_filling_values() -> None:
    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=parsed_output(),
        profile=None,
    )

    assert len(data.education) == 1
    assert data.education[0].start_date == "2020-09"
    assert len(data.work_experiences) == 1
    assert data.work_experiences[0].employment_type == EmploymentType.FULL_TIME
    assert len(data.project_experiences) == 1
    assert data.project_experiences[0].end_date is None
    assert str(data.project_experiences[0].project_url) == (
        "https://example.com/project"
    )
    assert [skill.name for skill in data.skills] == ["Python", "SQL"]
    assert data.work_experiences[0].skill_ids == [data.skills[0].id]
    assert data.project_experiences[0].skill_ids == [
        data.skills[0].id,
        data.skills[1].id,
    ]
    assert [
        (item.section, item.source_index, item.reasons) for item in data.skipped_items
    ] == [
        (
            "education",
            1,
            ["start_date_precision_insufficient"],
        ),
        (
            "workExperience",
            1,
            ["employment_type_unknown"],
        ),
        (
            "projectExperience",
            1,
            ["end_date_precision_insufficient"],
        ),
    ]


def test_same_result_has_stable_ids_across_documents_and_summary_actions() -> None:
    result = simple_output()
    first = build_resume_import_draft_data(
        user_id=USER_ID,
        result=result,
        profile=None,
    )
    second = build_resume_import_draft_data(
        user_id=USER_ID,
        result=ResumeParsingOutput.model_validate(result.model_dump()),
        profile=None,
    )
    assert first.model_dump() == second.model_dump()
    assert first.summary_action == "set"

    no_summary = ResumeParsingOutput.model_validate(
        {**result.model_dump(), "summary": None}
    )
    assert (
        build_resume_import_draft_data(
            user_id=USER_ID,
            result=no_summary,
            profile=None,
        ).summary_action
        == "none"
    )

    profile = CareerProfile(
        profile_id=uuid4(),
        user_id=USER_ID,
        summary="Existing summary",
        version=1,
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=[],
    )
    assert (
        build_resume_import_draft_data(
            user_id=USER_ID,
            result=result,
            profile=profile,
        ).summary_action
        == "preserve"
    )


def test_ordinary_technical_resume_without_summary_builds_none_action() -> None:
    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=ordinary_technical_resume_output(),
        profile=None,
    )

    assert data.summary is None
    assert data.summary_action == "none"
    assert len(data.education) == 1
    assert len(data.work_experiences) == 1
    assert len(data.project_experiences) == 1
    assert [skill.name for skill in data.skills] == ["Python"]


def test_profile_preview_protects_manual_items_and_counts_missing() -> None:
    result = simple_output()
    empty_profile_data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=result,
        profile=None,
    )
    candidate_education = empty_profile_data.education[0]
    candidate_skill = empty_profile_data.skills[0]
    extra_resume_education_id = uuid4()
    profile = CareerProfile(
        profile_id=uuid4(),
        user_id=USER_ID,
        summary=None,
        version=3,
        education=[
            CareerProfileEducation(
                id=candidate_education.id,
                career_profile_id=uuid4(),
                position=0,
                school=candidate_education.school,
                degree=candidate_education.degree,
                major=candidate_education.major,
                start_date=candidate_education.start_date,
                end_date=candidate_education.end_date,
                is_current=candidate_education.is_current,
                source="userEdited",
            ),
            CareerProfileEducation(
                id=extra_resume_education_id,
                career_profile_id=uuid4(),
                position=1,
                school="Old",
                degree=None,
                major=None,
                start_date="2010-01",
                end_date="2011-01",
                is_current=False,
                source="resumeExtracted",
            ),
        ],
        work_experiences=[],
        project_experiences=[],
        skills=[
            CareerProfileSkill(
                id=uuid4(),
                career_profile_id=uuid4(),
                position=0,
                name=candidate_skill.name,
                normalized_name=candidate_skill.name.casefold(),
                source="userAdded",
            )
        ],
    )

    data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=result,
        profile=profile,
    )
    assert {(item.section, item.source) for item in data.protected_items} == {
        ("education", "userEdited"),
        ("skills", "userAdded"),
    }
    assert data.change_summary.new_items == 1
    assert data.change_summary.changed_items == 0
    assert data.change_summary.missing_items == 1


def test_resume_extracted_work_skill_names_are_compared_without_uuid_identity() -> None:
    result = simple_output()
    candidate_data = build_resume_import_draft_data(
        user_id=USER_ID,
        result=result,
        profile=None,
    )
    candidate_work = candidate_data.work_experiences[0]
    candidate_skill = candidate_data.skills[0]
    current_skill_id = uuid4()
    profile_id = uuid4()
    current_work = CareerProfileWorkExperience(
        id=candidate_work.id,
        career_profile_id=profile_id,
        position=0,
        company=candidate_work.company,
        title=candidate_work.title,
        employment_type=candidate_work.employment_type.value,
        location=candidate_work.location,
        start_date=candidate_work.start_date,
        end_date=candidate_work.end_date,
        is_current=candidate_work.is_current,
        responsibilities=list(candidate_work.responsibilities),
        achievements=list(candidate_work.achievements),
        source="resumeExtracted",
    )
    current_work.skill_links = [
        CareerProfileWorkSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            work_experience_id=current_work.id,
            skill_id=current_skill_id,
            position=0,
        )
    ]
    profile = CareerProfile(
        profile_id=profile_id,
        user_id=USER_ID,
        summary=None,
        version=1,
        education=[],
        work_experiences=[current_work],
        project_experiences=[],
        skills=[
            CareerProfileSkill(
                id=current_skill_id,
                career_profile_id=profile_id,
                position=0,
                name=candidate_skill.name,
                normalized_name=candidate_skill.name.casefold(),
                source="resumeExtracted",
            )
        ],
    )
    unchanged = build_resume_import_draft_data(
        user_id=USER_ID,
        result=result,
        profile=profile,
    )
    assert unchanged.change_summary.changed_items == 0

    current_work.responsibilities = ["Different"]
    changed = build_resume_import_draft_data(
        user_id=USER_ID,
        result=result,
        profile=profile,
    )
    assert changed.change_summary.changed_items == 1


def test_invalid_profile_source_is_safe() -> None:
    profile = CareerProfile(
        profile_id=uuid4(),
        user_id=USER_ID,
        summary=None,
        version=1,
        education=[],
        work_experiences=[],
        project_experiences=[],
        skills=[
            CareerProfileSkill(
                id=uuid4(),
                career_profile_id=uuid4(),
                position=0,
                name="Python",
                normalized_name="python",
                source="databaseGenerated",
            )
        ],
    )
    with pytest.raises(ResumeImportStateError) as exc_info:
        build_resume_import_draft_data(
            user_id=USER_ID,
            result=simple_output(),
            profile=profile,
        )
    assert exc_info.value.code == "resume_import_profile_invalid"
    assert str(USER_ID) not in str(exc_info.value)
