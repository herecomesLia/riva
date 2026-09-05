from dataclasses import dataclass

import pytest
from pydantic import ValidationError

from riva.schemas.base import (
    NonEmptyPartialUpdateRequest,
    RequestModel,
    ResponseModel,
)


class ExampleRequest(RequestModel):
    request_id: str


class ExamplePartialUpdateRequest(NonEmptyPartialUpdateRequest):
    value: str | None = None


class ExampleResponse(ResponseModel):
    request_id: str


@dataclass
class ExampleObject:
    request_id: str


@pytest.mark.parametrize(
    "payload",
    [{"request_id": "request-1"}, {"requestId": "request-1"}],
)
def test_request_model_accepts_field_names_and_aliases(
    payload: dict[str, str],
) -> None:
    model = ExampleRequest.model_validate(payload)

    assert model.request_id == "request-1"
    assert model.model_dump() == {"requestId": "request-1"}


def test_request_model_forbids_extra_fields() -> None:
    with pytest.raises(ValidationError):
        ExampleRequest.model_validate(
            {
                "requestId": "request-1",
                "unexpected": "value",
            }
        )


def test_non_empty_partial_update_rejects_empty_payload() -> None:
    with pytest.raises(ValidationError):
        ExamplePartialUpdateRequest.model_validate({})


def test_response_model_validates_from_object_attributes() -> None:
    model = ExampleResponse.model_validate(ExampleObject(request_id="request-1"))

    assert model.model_dump() == {"requestId": "request-1"}
