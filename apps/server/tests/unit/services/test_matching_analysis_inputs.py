from copy import deepcopy
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
    JobDescriptionAnalysis,
    TargetRole,
)
from riva.services.matching_analyses import (
    MAX_MATCHING_EDUCATION_ITEMS,
    MAX_MATCHING_EXPERIENCE_ACHIEVEMENTS,
    MAX_MATCHING_EXPERIENCE_RESPONSIBILITIES,
    MAX_MATCHING_EXPERIENCE_SKILLS,
    MAX_MATCHING_PROFILE_SKILLS,
    MAX_MATCHING_PROJECT_EXPERIENCE_ITEMS,
    MAX_MATCHING_WORK_EXPERIENCE_ITEMS,
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


def test_matching_career_profile_compresses_every_list_after_deduplication() -> None:
    profile_id = uuid4()
    top_skill_names = [" 技能-0 ", "技能-0"] + [
        f"技能-{index}" for index in range(1, 205)
    ]
    top_skills = [
        CareerProfileSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            position=index,
            name=name,
            normalized_name=name.strip().lower(),
        )
        for index, name in enumerate(top_skill_names)
    ]
    work_skill_names = [" 工作技能-0 ", "工作技能-0"] + [
        f"工作技能-{index}" for index in range(1, 105)
    ]
    work_skills = [
        CareerProfileSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            position=index,
            name=name,
            normalized_name=name.strip().lower(),
        )
        for index, name in enumerate(work_skill_names, start=1_000)
    ]
    work = CareerProfileWorkExperience(
        id=uuid4(),
        career_profile_id=profile_id,
        position=0,
        company="公司",
        title="后端工程师",
        employment_type="fullTime",
        start_date="2021-01",
        end_date=None,
        is_current=True,
        responsibilities=[" 责任-0 ", "", "责任-0"]
        + [f"责任-{index}" for index in range(1, 25)],
        achievements=[" 成果-0 ", "成果-0"]
        + [f"成果-{index}" for index in range(1, 25)],
    )
    work.skill_links = [
        CareerProfileWorkSkill(
            id=uuid4(),
            career_profile_id=profile_id,
            work_experience_id=work.id,
            skill_id=skill.id,
            position=index,
            skill=skill,
        )
        for index, skill in enumerate(work_skills)
    ]
    education = [
        CareerProfileEducation(
            id=UUID(f"00000000-0000-4000-8000-{index:012d}"),
            career_profile_id=profile_id,
            position=index,
            school=f"学校-{index}",
            degree=None,
            major=None,
            start_date="2018-09",
            end_date="2021-06",
            is_current=False,
        )
        for index in range(25)
    ]
    work_experiences = [
        CareerProfileWorkExperience(
            id=uuid4(),
            career_profile_id=profile_id,
            position=index + 1,
            company=f"公司-{index}",
            title="工程师",
            employment_type="fullTime",
            start_date="2021-01",
            end_date=None,
            is_current=True,
            responsibilities=[],
            achievements=[],
        )
        for index in range(21)
    ]
    projects = [
        CareerProfileProjectExperience(
            id=uuid4(),
            career_profile_id=profile_id,
            position=index,
            name=f"项目-{index}",
            role="开发者",
            start_date="2024-01",
            end_date="2024-06",
            responsibilities=[],
            achievements=[],
        )
        for index in range(21)
    ]
    profile = CareerProfile(
        profile_id=profile_id,
        user_id=uuid4(),
        summary="中文档案",
        version=1,
        education=education,
        work_experiences=[work, *work_experiences],
        project_experiences=projects,
        skills=top_skills + work_skills,
    )
    before = {
        "education": [(item.position, item.school) for item in profile.education],
        "work": [
            (item.position, item.company, list(item.responsibilities))
            for item in profile.work_experiences
        ],
        "projects": [
            (item.position, item.name) for item in profile.project_experiences
        ],
        "skills": [item.name for item in profile.skills],
        "work_skills": [link.skill.name for link in work.skill_links],
    }

    result = build_matching_career_profile(profile)

    assert len(result.education) == MAX_MATCHING_EDUCATION_ITEMS
    assert len(result.work_experiences) == MAX_MATCHING_WORK_EXPERIENCE_ITEMS
    assert len(result.project_experiences) == MAX_MATCHING_PROJECT_EXPERIENCE_ITEMS
    assert result.education[0].school == "学校-0"
    assert result.work_experiences[0].company == "公司"
    assert result.work_experiences[1].company == "公司-0"
    assert result.project_experiences[-1].name == "项目-19"
    assert result.work_experiences[0].responsibilities == [
        "责任-0",
        *[f"责任-{index}" for index in range(1, 20)],
    ]
    assert result.work_experiences[0].achievements == [
        "成果-0",
        *[f"成果-{index}" for index in range(1, 20)],
    ]
    assert len(result.work_experiences[0].skills) == (MAX_MATCHING_EXPERIENCE_SKILLS)
    assert result.work_experiences[0].skills[-1] == "工作技能-99"
    assert len(result.skills) == MAX_MATCHING_PROFILE_SKILLS
    assert result.skills[-1] == "技能-199"
    assert len(result.work_experiences[0].responsibilities) == (
        MAX_MATCHING_EXPERIENCE_RESPONSIBILITIES
    )
    assert len(result.work_experiences[0].achievements) == (
        MAX_MATCHING_EXPERIENCE_ACHIEVEMENTS
    )
    assert before == {
        "education": [(item.position, item.school) for item in profile.education],
        "work": [
            (item.position, item.company, list(item.responsibilities))
            for item in profile.work_experiences
        ],
        "projects": [
            (item.position, item.name) for item in profile.project_experiences
        ],
        "skills": [item.name for item in profile.skills],
        "work_skills": [link.skill.name for link in work.skill_links],
    }

    def field_names(value: object) -> set[str]:
        if isinstance(value, dict):
            return set(value) | {
                name for item in value.values() for name in field_names(item)
            }
        if isinstance(value, list):
            return {name for item in value for name in field_names(item)}
        return set()

    assert not field_names(result.model_dump()) & {
        "id",
        "profile_id",
        "user_id",
        "source",
        "normalized_name",
        "position",
        "project_url",
        "created_at",
        "updated_at",
    }


def test_matching_job_context_validates_structured_analysis_and_excludes_raw_text() -> (
    None
):
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


def test_matching_career_profile_uses_uuid_as_tie_breaker() -> None:
    profile_id = uuid4()
    earlier_id = UUID("00000000-0000-4000-8000-000000000001")
    later_id = UUID("00000000-0000-4000-8000-000000000002")
    profile = CareerProfile(
        profile_id=profile_id,
        user_id=uuid4(),
        summary="中文档案",
        version=1,
        education=[
            CareerProfileEducation(
                id=later_id,
                career_profile_id=profile_id,
                position=0,
                school="后者",
                start_date="2020-01",
                end_date="2021-01",
                is_current=False,
            ),
            CareerProfileEducation(
                id=earlier_id,
                career_profile_id=profile_id,
                position=0,
                school="前者",
                start_date="2020-01",
                end_date="2021-01",
                is_current=False,
            ),
        ],
        skills=[
            CareerProfileSkill(
                id=uuid4(),
                career_profile_id=profile_id,
                position=0,
                name="Python",
                normalized_name="python",
            )
        ],
    )

    result = build_matching_career_profile(profile)

    assert [item.school for item in result.education] == ["前者", "后者"]


@pytest.mark.parametrize(
    "has_skills,has_section,expected",
    [
        (False, False, False),
        (False, True, False),
        (True, False, True),
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


def test_matching_completion_rule_ignores_blank_skill_names() -> None:
    profile = CareerProfile(
        profile_id=uuid4(),
        user_id=uuid4(),
        version=1,
        education=[
            CareerProfileEducation(
                id=uuid4(),
                position=0,
                school="University",
                start_date="2020-01",
                end_date="2024-01",
                is_current=False,
            )
        ],
        skills=[
            CareerProfileSkill(
                id=uuid4(),
                position=0,
                name="   ",
                normalized_name="",
            )
        ],
    )

    from riva.services.profile_completion import career_profile_completed

    assert career_profile_completed(profile) is False
    profile.skills.append(
        CareerProfileSkill(
            id=uuid4(),
            position=1,
            name="Python",
            normalized_name="python",
        )
    )
    assert career_profile_completed(profile) is True
