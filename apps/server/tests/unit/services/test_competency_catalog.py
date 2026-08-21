import pytest

from riva.services.competency_catalog import (
    CANONICAL_COMPETENCY_KEYS,
    COMPETENCY_DISPLAY_NAMES,
    DIMENSION_TO_COMPETENCY_KEY,
    canonical_competency_sort_key,
    competency_key_for_dimension,
    display_name_for_competency_key,
)


def test_catalog_contains_only_canonical_keys_and_labels() -> None:
    assert dict(COMPETENCY_DISPLAY_NAMES) == {
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


@pytest.mark.parametrize(
    ("dimension", "key"),
    list(DIMENSION_TO_COMPETENCY_KEY.items()),
)
def test_dimension_mapping_is_canonical(dimension: str, key: str) -> None:
    assert competency_key_for_dimension(dimension) == key
    assert display_name_for_competency_key(key)


def test_unknown_dimension_and_key_fail_without_free_form_creation() -> None:
    with pytest.raises(ValueError, match="unknown competency dimension"):
        competency_key_for_dimension("customDimension")
    with pytest.raises(ValueError, match="unknown competency key"):
        display_name_for_competency_key("custom_key")


def test_canonical_order_is_explicit_and_unknown_keys_sort_last() -> None:
    assert CANONICAL_COMPETENCY_KEYS == tuple(COMPETENCY_DISPLAY_NAMES)
    assert canonical_competency_sort_key("answer_quality") < (
        canonical_competency_sort_key("risk_control")
    )
    assert canonical_competency_sort_key("custom") > (
        canonical_competency_sort_key("risk_control")
    )
