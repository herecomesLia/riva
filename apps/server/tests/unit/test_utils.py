import pytest

from riva.utils import seconds_to_ms


def test_seconds_to_ms_converts_with_optional_rounding() -> None:
    assert seconds_to_ms(1.234567) == pytest.approx(1234.567)
    assert seconds_to_ms(1.234567, 0) == 1235.0
    assert seconds_to_ms(1.234567, 2) == pytest.approx(1234.57)
