from __future__ import annotations

from collections.abc import Mapping
from typing import Final

COMPETENCY_DISPLAY_NAMES: Final[Mapping[str, str]] = {
    "answer_quality": "Answer Quality",
    "relevance": "Relevance",
    "structure": "Structure",
    "specificity": "Specificity",
    "personal_contribution": "Personal Contribution",
    "results_and_evidence": "Results and Evidence",
    "role_alignment": "Role Alignment",
    "communication": "Communication",
    "risk_control": "Risk Control",
}

# This is the only ordering contract for competency presentation.  Keep it
# explicit so callers do not depend on database insertion order.
CANONICAL_COMPETENCY_KEYS: Final[tuple[str, ...]] = (
    "answer_quality",
    "relevance",
    "structure",
    "specificity",
    "personal_contribution",
    "results_and_evidence",
    "role_alignment",
    "communication",
    "risk_control",
)

DIMENSION_TO_COMPETENCY_KEY: Final[Mapping[str, str]] = {
    "relevance": "relevance",
    "structure": "structure",
    "specificity": "specificity",
    "personalContribution": "personal_contribution",
    "resultsAndEvidence": "results_and_evidence",
    "roleAlignment": "role_alignment",
    "communication": "communication",
    "riskControl": "risk_control",
}

_CANONICAL_COMPETENCY_INDEX: Final[Mapping[str, int]] = {
    key: index for index, key in enumerate(CANONICAL_COMPETENCY_KEYS)
}


def competency_key_for_dimension(dimension: object) -> str:
    """Return the canonical competency key for a persisted dimension value."""

    value = getattr(dimension, "value", dimension)
    if not isinstance(value, str) or value not in DIMENSION_TO_COMPETENCY_KEY:
        raise ValueError(f"unknown competency dimension: {value!r}")
    return DIMENSION_TO_COMPETENCY_KEY[value]


def display_name_for_competency_key(competency_key: object) -> str:
    """Return the canonical display name and reject keys outside the catalog."""

    if not isinstance(competency_key, str):
        raise ValueError(f"unknown competency key: {competency_key!r}")
    try:
        return COMPETENCY_DISPLAY_NAMES[competency_key]
    except KeyError:
        raise ValueError(f"unknown competency key: {competency_key!r}") from None


def canonical_competency_sort_key(competency_key: str) -> tuple[int, str]:
    """Return the stable catalog order, placing uncatalogued keys last."""

    return (
        _CANONICAL_COMPETENCY_INDEX.get(
            competency_key,
            len(CANONICAL_COMPETENCY_KEYS),
        ),
        competency_key,
    )
