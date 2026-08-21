from riva.models import CareerProfile


def career_profile_completed(profile: CareerProfile) -> bool:
    """Return whether the profile has enough information for RIVA core features.

    This readiness check does not mean that every resume section is filled in.
    """

    has_named_skill = any(
        isinstance(skill.name, str) and bool(skill.name.strip())
        for skill in profile.skills
    )
    return bool(
        has_named_skill or profile.work_experiences or profile.project_experiences
    )


__all__ = ["career_profile_completed"]
