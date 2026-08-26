from dataclasses import dataclass

import pytest

from riva.schemas.base import APIModel


class ExampleModel(APIModel):
    request_id: str


@dataclass
class ExampleObject:
    request_id: str


@pytest.mark.parametrize(
    "payload",
    [{"request_id": "request-1"}, {"requestId": "request-1"}],
)
def test_api_model_accepts_field_names_and_aliases(payload: dict[str, str]) -> None:
    model = ExampleModel.model_validate(payload)

    assert model.request_id == "request-1"
    assert model.model_dump() == {"requestId": "request-1"}


def test_api_model_validates_from_object_attributes() -> None:
    model = ExampleModel.model_validate(ExampleObject(request_id="request-1"))

    assert model.model_dump() == {"requestId": "request-1"}
