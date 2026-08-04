from riva.models import CareerProfile


def career_profile_completed(profile: CareerProfile) -> bool:
    return bool(profile.skills) and bool(
        profile.education
        or profile.work_experiences
        or profile.project_experiences
    )
