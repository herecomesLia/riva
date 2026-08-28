from typing import Any

from pydantic import TypeAdapter
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator


class _PydanticJSONBase(TypeDecorator[Any]):
    cache_ok = True

    def __init__(self, annotation: Any) -> None:
        self.annotation = annotation
        self._adapter = TypeAdapter(annotation)
        super().__init__()

    def process_bind_param(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None

        validated = self._adapter.validate_python(value)
        return self._adapter.dump_python(validated, mode="json")

    def process_result_value(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None

        return self._adapter.validate_python(value)

    def coerce_compared_value(self, op: Any, value: Any) -> Any:
        return self.impl_instance.coerce_compared_value(op, value)


class PydanticJSON(_PydanticJSONBase):
    impl = JSON
    cache_ok = True


class PydanticJSONB(_PydanticJSONBase):
    impl = JSONB
    cache_ok = True
