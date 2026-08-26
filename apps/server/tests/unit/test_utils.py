from datetime import UTC, datetime, timedelta

import pytest

from riva.utils import seconds_to_ms, utc_now


@pytest.mark.parametrize(
    ("seconds", "expected"),
    [(1, 1000), (0.5, 500), (0, 0), (-1, -1000)],
)
def test_seconds_to_ms_converts_seconds(seconds: float, expected: float) -> None:
    assert seconds_to_ms(seconds) == expected


@pytest.mark.parametrize(
    ("ndigits", "expected"),
    [(None, 1234.56), (0, 1235.0), (2, 1234.56)],
)
def test_seconds_to_ms_supports_rounding(
    ndigits: int | None,
    expected: float,
) -> None:
    assert seconds_to_ms(1.23456, ndigits) == pytest.approx(expected)


def test_utc_now_returns_current_utc_datetime() -> None:
    before = datetime.now(UTC)

    result = utc_now()

    after = datetime.now(UTC)
    assert isinstance(result, datetime)
    assert result.tzinfo is not None
    assert result.utcoffset() == timedelta(0)
    assert before <= result <= after
