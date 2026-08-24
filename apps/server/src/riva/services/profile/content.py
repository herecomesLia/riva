from typing import Any

from riva.services.profile.types import ProfileContent


def parse_content(value: dict[str, Any]) -> ProfileContent:
    return ProfileContent.model_validate(value)


def has_required_content(content: ProfileContent) -> bool:
    return bool(
        content.skills or content.work_experiences or content.project_experiences
    )
