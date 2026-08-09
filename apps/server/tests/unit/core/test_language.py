import pytest

from riva.core.language import normalize_interaction_language


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, "zh-CN"),
        ("", "zh-CN"),
        ("zh-CN", "zh-CN"),
        ("zh", "zh-CN"),
        ("zh-TW", "zh-CN"),
        ("en", "en"),
        ("en-US", "en"),
        ("fr", "zh-CN"),
        ("fr-FR,en;q=0.8", "zh-CN"),
    ],
)
def test_normalize_interaction_language(value: str | None, expected: str) -> None:
    assert normalize_interaction_language(value) == expected
