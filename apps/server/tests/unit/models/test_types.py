import pytest
from pydantic import TypeAdapter, ValidationError

from riva.models.types import NonBlankStr, YearMonth, YearMonthRangeModel


def test_year_month_accepts_valid_value() -> None:
    assert TypeAdapter(YearMonth).validate_python("2026-08") == "2026-08"


@pytest.mark.parametrize("value", ["2026-8", "2026-00", "2026-13", "2026/08"])
def test_year_month_rejects_invalid_value(value: str) -> None:
    with pytest.raises(ValidationError):
        TypeAdapter(YearMonth).validate_python(value)


@pytest.mark.parametrize(
    ("start_date", "end_date"),
    [("2026-01", "2026-01"), ("2026-01", None)],
)
def test_year_month_range_accepts_valid_range(
    start_date: str,
    end_date: str | None,
) -> None:
    result = YearMonthRangeModel(start_date=start_date, end_date=end_date)

    assert result.start_date == start_date
    assert result.end_date == end_date


@pytest.mark.parametrize("missing_field", ["start_date", "end_date"])
def test_year_month_range_requires_both_date_fields(missing_field: str) -> None:
    values: dict[str, str] = {
        "start_date": "2026-01",
        "end_date": "2026-02",
    }
    values.pop(missing_field)

    with pytest.raises(ValidationError):
        YearMonthRangeModel.model_validate(values)


def test_year_month_range_rejects_end_before_start() -> None:
    with pytest.raises(ValidationError):
        YearMonthRangeModel(start_date="2026-02", end_date="2026-01")


def test_non_blank_str_strips_surrounding_whitespace_and_rejects_blank() -> None:
    adapter = TypeAdapter(NonBlankStr)

    assert adapter.validate_python("  Python  ") == "Python"
    with pytest.raises(ValidationError):
        adapter.validate_python("   ")
