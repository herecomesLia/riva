from copy import deepcopy
from uuid import uuid4

import pytest

from riva.models import (
    CareerProfile,
    CareerProfileEducation,
    CareerProfileProjectExperience,
    CareerProfileProjectSkill,
    CareerProfileSkill,
    CareerProfileWorkExperience,
    CareerProfileWorkSkill,
    JobDescriptionAnalysis,
    TargetRole,
)
from riva.services.matching_analyses import (
    build_matching_career_profile,
    build_matching_job_context,
    stable_unique_texts,
)


def test_stable_unique_texts_normalizes_before_truncating() -> None:
    values = [" A ", "", "A", " B ", "B", "C"]

    assert stable_unique_texts(values, limit=2) == ["A", "B"]
    assert values == [" A ", "", "A", " B ", "B", "C"]


def test_matching_career_profile_uses_ordered_skill_names_and_does_not_mutate() -> None:
    user_id = uuid4()
    profile_id = uuid4()
    python = CareerProfileSkill(
        id=uuid4(),
        career_profile_id=profile_id,
        position=1,
        name=" Python ",
        normalized_name="python",
    )
    fastapi = CareerProfileSkill(
        id=uuid4(),
        career_profile_id=profile_id,
        position=0,
        name="FastAPI",
        normalized_name="fastapi",
    )
    work = CareerProfileWorkExperience(
        id=uuid4(),
        career_profile_id=profile_id,
        position=1,
        company="Riva",
        title="Backend Engineer",
        employment_type="fullTime",
        start_date="2021-01",
        end_date=None,
        is_current=True,
        responsibilities=[" Build APIs ", "", "Build APIs"],
        achievements=[" Improved reliability ", "Improved reliability"],
    )
    work.skill_links = [
        CareerProfileWorkSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            work_experience_id=work.id,
            skill_id=python.id,
            position=1,
            skill=python,
        ),
        CareerProfileWorkSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            work_experience_id=work.id,
            skill_id=fastapi.id,
            position=0,
            skill=fastapi,
        ),
    ]
    project = CareerProfileProjectExperience(
        id=uuid4(),
        career_profile_id=profile_id,
        position=0,
        name="Riva Profile",
        role="Developer",
        start_date="2024-01",
        end_date="2024-06",
        responsibilities=[" Designed schema "],
        achievements=[],
    )
    project.skill_links = [
        CareerProfileProjectSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            project_experience_id=project.id,
            skill_id=fastapi.id,
            position=0,
            skill=fastapi,
        )
    ]
    education = CareerProfileEducation(
        id=uuid4(),
        career_profile_id=profile_id,
        position=0,
        school="Tongji University",
        degree="Master",
        major="Software Engineering",
        start_date="2018-09",
        end_date="2021-06",
        is_current=False,
    )
    profile = CareerProfile(
        profile_id=profile_id,
        user_id=user_id,
        summary=" Backend engineer ",
        version=2,
        education=[education],
        work_experiences=[work],
        project_experiences=[project],
        skills=[python, fastapi],
    )
    before = deepcopy(
        {
            "responsibilities": work.responsibilities,
            "achievements": work.achievements,
            "skills": [skill.name for skill in profile.skills],
        }
    )

    result = build_matching_career_profile(profile)

    assert result.summary == "Backend engineer"
    assert [item.school for item in result.education] == ["Tongji University"]
    assert result.work_experiences[0].skills == ["FastAPI", "Python"]
    assert result.work_experiences[0].responsibilities == ["Build APIs"]
    assert result.work_experiences[0].achievements == ["Improved reliability"]
    assert result.project_experiences[0].skills == ["FastAPI"]
    assert result.skills == ["FastAPI", "Python"]
    assert {
        "responsibilities": work.responsibilities,
        "achievements": work.achievements,
        "skills": [skill.name for skill in profile.skills],
    } == before


def test_matching_job_context_validates_structured_analysis_and_excludes_raw_text() -> None:
    role = TargetRole(
        id=uuid4(),
        user_id=uuid4(),
        title="Backend Engineer",
        company="Riva",
        job_description_status="saved",
        raw_job_description="Do not send this raw text.",
        job_description_version=2,
    )
    analysis = JobDescriptionAnalysis(
        role_id=role.id,
        user_id=role.user_id,
        job_description_version=2,
        analysis_version=3,
        source_agent_run_id=uuid4(),
        parsed_at=role.created_at,
        riva_summary="Build reliable APIs.",
        responsibilities=["Design APIs"],
        qualification_requirements={
            "education": [],
            "graduation_cohorts": [],
            "majors": [],
            "experience": [],
            "languages": [],
            "certifications": [],
            "other": [],
        },
        required_skills={
            "programming_languages": ["Python"],
            "frameworks_and_libraries": [],
            "platforms": [],
            "tools": [],
            "concepts_and_methods": [],
            "databases_and_middleware": [],
            "other": [],
        },
        preferred_qualifications=[],
        soft_skills=[],
        business_domains=[],
    )

    result = build_matching_job_context(role, analysis)

    assert result.role_title == "Backend Engineer"
    assert result.company == "Riva"
    assert result.job_description_analysis.required_skills.programming_languages == [
        "Python"
    ]
    assert "raw_job_description" not in result.model_dump()


@pytest.mark.parametrize(
    "has_skills,has_section,expected",
    [
        (False, False, False),
        (False, True, False),
        (True, False, False),
        (True, True, True),
    ],
)
def test_matching_completion_rule_matches_roles_page(
    has_skills: bool,
    has_section: bool,
    expected: bool,
) -> None:
    profile = CareerProfile(profile_id=uuid4(), user_id=uuid4(), version=1)
    if has_skills:
        profile.skills = [
            CareerProfileSkill(
                id=uuid4(),
                position=0,
                name="Python",
                normalized_name="python",
            )
        ]
    if has_section:
        profile.education = [
            CareerProfileEducation(
                id=uuid4(),
                position=0,
                school="University",
                start_date="2020-01",
                end_date="2024-01",
                is_current=False,
            )
        ]

    from riva.services.profile_completion import career_profile_completed

    assert career_profile_completed(profile) is expected


def test_matching_completion_rule_accepts_work_and_project_sections() -> None:
    profile = CareerProfile(
        profile_id=uuid4(),
        user_id=uuid4(),
        version=1,
        skills=[
            CareerProfileSkill(
                id=uuid4(),
                position=0,
                name="Python",
                normalized_name="python",
            )
        ],
    )
    profile.work_experiences = [
        CareerProfileWorkExperience(
            id=uuid4(),
            position=0,
            company="Riva",
            title="Engineer",
            employment_type="fullTime",
            start_date="2021-01",
            end_date=None,
            is_current=True,
        )
    ]

    from riva.services.profile_completion import career_profile_completed

    assert career_profile_completed(profile) is True

    profile.work_experiences = []
    profile.project_experiences = [
        CareerProfileProjectExperience(
            id=uuid4(),
            position=0,
            name="Riva Project",
            start_date="2024-01",
            end_date="2024-06",
            responsibilities=[],
            achievements=[],
        )
    ]
    assert career_profile_completed(profile) is True
