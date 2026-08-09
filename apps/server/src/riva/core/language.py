from typing import Literal


InteractionLanguage = Literal["zh-CN", "en"]
DEFAULT_INTERACTION_LANGUAGE: InteractionLanguage = "zh-CN"


def normalize_interaction_language(value: str | None) -> InteractionLanguage:
    """Normalize an Accept-Language value to RIVA's supported languages."""

    if not value:
        return DEFAULT_INTERACTION_LANGUAGE

    candidate = value.split(",", 1)[0].split(";", 1)[0].strip().casefold()
    if candidate == "zh" or candidate.startswith("zh-"):
        return "zh-CN"
    if candidate == "en" or candidate.startswith("en-"):
        return "en"
    return DEFAULT_INTERACTION_LANGUAGE


__all__ = [
    "DEFAULT_INTERACTION_LANGUAGE",
    "InteractionLanguage",
    "normalize_interaction_language",
]
