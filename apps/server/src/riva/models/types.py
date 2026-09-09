from typing import Annotated, Self

from pydantic import BaseModel, Field, StringConstraints, model_validator

NonBlankStr = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
    ),
]

YearMonth = Annotated[
    str,
    StringConstraints(
        strict=True,
        pattern=r"^[0-9]{4}-(?:0[1-9]|1[0-2])$",
    ),
]


class YearMonthRangeModel(BaseModel):
    start_date: YearMonth = Field(description="Start month in YYYY-MM format.")
    end_date: YearMonth | None = Field(
        description="End month in YYYY-MM format; null means ongoing."
    )

    @model_validator(mode="after")
    def validate_date_range(self) -> Self:
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date must not be earlier than start_date")

        return self
