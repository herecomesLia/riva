from uuid import uuid4

import pytest

from riva.models import (
    CareerProfile,
    CareerProfileEducation,
    CareerProfileProjectExperience,
    CareerProfileSkill,
    CareerProfileWorkExperience,
)
from riva.services.profile.completion import career_profile_completed


def _profile(
    *,
    education: bool = False,
    skills: bool = False,
    work: bool = False,
    project: bool = False,
    blank_skill: bool = False,
) -> CareerProfile:
    profile = CareerProfile(profile_id=uuid4(), user_id=uuid4(), version=1)
    if education:
        profile.education = [
            CareerProfileEducation(
                id=uuid4(),
                career_profile_id=profile.profile_id,
                position=0,
                school="University",
                start_date="2020-09",
                end_date="2024-06",
                is_current=False,
            )
        ]
    if skills or blank_skill:
        name = "Python" if skills else "   "
        profile.skills = [
            CareerProfileSkill(
                id=uuid4(),
                career_profile_id=profile.profile_id,
                position=0,
                name=name,
                normalized_name=name.strip().lower(),
            )
        ]
    if work:
        profile.work_experiences = [
            CareerProfileWorkExperience(
                id=uuid4(),
                career_profile_id=profile.profile_id,
                position=0,
                company="Riva",
                title="Engineer",
                employment_type="fullTime",
                start_date="2024-01",
                end_date=None,
                is_current=True,
            )
        ]
    if project:
        profile.project_experiences = [
            CareerProfileProjectExperience(
                id=uuid4(),
                career_profile_id=profile.profile_id,
                position=0,
                name="Riva",
                start_date="2024-01",
                end_date=None,
                responsibilities=[],
                achievements=[],
            )
        ]
    return profile


@pytest.mark.parametrize(
    ("skills", "work", "project"),
    [
        (True, False, False),
        (False, True, False),
        (False, False, True),
        (True, True, False),
        (True, False, True),
        (False, True, True),
        (True, True, True),
    ],
)
def test_career_profile_ready_with_any_career_evidence(
    skills: bool,
    work: bool,
    project: bool,
) -> None:
    assert career_profile_completed(_profile(skills=skills, work=work, project=project))


@pytest.mark.parametrize(
    "profile",
    [
        _profile(),
        _profile(education=True),
        _profile(blank_skill=True),
    ],
    ids=["empty", "education-only", "blank-skill-only"],
)
def test_career_profile_not_ready_without_career_evidence(
    profile: CareerProfile,
) -> None:
    assert not career_profile_completed(profile)


@pytest.mark.parametrize(
    ("skills", "work", "project"),
    [
        (True, False, False),
        (False, True, False),
        (False, False, True),
        (True, True, False),
        (True, False, True),
        (False, True, True),
        (True, True, True),
    ],
)
def test_education_does_not_change_existing_readiness(
    skills: bool,
    work: bool,
    project: bool,
) -> None:
    without_education = _profile(skills=skills, work=work, project=project)
    with_education = _profile(
        education=True,
        skills=skills,
        work=work,
        project=project,
    )

    assert career_profile_completed(without_education)
    assert career_profile_completed(with_education)


@pytest.mark.parametrize("evidence", ["work", "project"])
def test_blank_skill_does_not_override_valid_experience(evidence: str) -> None:
    assert career_profile_completed(_profile(blank_skill=True, **{evidence: True}))
