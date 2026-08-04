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
