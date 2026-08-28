import pytest
from pydantic import BaseModel, ValidationError
from sqlalchemy.engine.default import DefaultDialect

from riva.db.types import PydanticJSON, PydanticJSONB
from riva.models.types import NonBlankStr, YearMonth

DIALECT = DefaultDialect()


class ExampleEntry(BaseModel):
    name: NonBlankStr
    start_date: YearMonth


@pytest.mark.parametrize("json_type", [PydanticJSON, PydanticJSONB])
def test_pydantic_json_round_trips_pydantic_model(json_type: type) -> None:
    column_type = json_type(ExampleEntry)
    entry = ExampleEntry(name="Python", start_date="2026-08")

    bound = column_type.process_bind_param(entry, DIALECT)
    restored = column_type.process_result_value(bound, DIALECT)

    assert bound == {"name": "Python", "start_date": "2026-08"}
    assert isinstance(bound, dict)
    assert isinstance(restored, ExampleEntry)
    assert restored == entry


@pytest.mark.parametrize("json_type", [PydanticJSON, PydanticJSONB])
def test_pydantic_json_validates_raw_dict_on_bind(json_type: type) -> None:
    column_type = json_type(ExampleEntry)

    with pytest.raises(ValidationError):
        column_type.process_bind_param(
            {"name": "Python", "start_date": "2026-13"},
            DIALECT,
        )


@pytest.mark.parametrize("json_type", [PydanticJSON, PydanticJSONB])
def test_pydantic_json_validates_database_value_on_result(json_type: type) -> None:
    column_type = json_type(ExampleEntry)

    with pytest.raises(ValidationError):
        column_type.process_result_value(
            {"name": "Python", "start_date": "2026-13"},
            DIALECT,
        )
