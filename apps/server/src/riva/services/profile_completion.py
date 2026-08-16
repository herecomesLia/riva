from riva.models import CareerProfile


def career_profile_completed(profile: CareerProfile) -> bool:
    if any(
        not isinstance(skill.name, str) or not skill.name.strip()
        for skill in profile.skills
    ):
        return False
    has_named_skill = bool(profile.skills)
    return has_named_skill and bool(
        profile.education
        or profile.work_experiences
        or profile.project_experiences
    )


def career_profile_fully_complete(profile: CareerProfile) -> bool:
    """Return whether every profile section required by Interview is present."""

    if not (
        profile.education
        and profile.work_experiences
        and profile.project_experiences
        and profile.skills
    ):
        return False

    return all(
        isinstance(skill.name, str) and bool(skill.name.strip())
        for skill in profile.skills
    )


__all__ = [
    "career_profile_completed",
    "career_profile_fully_complete",
]
