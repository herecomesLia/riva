from typing import Any

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr


class EvalQualityJudgeModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )


class QualityJudgeRubricScore(EvalQualityJudgeModel):
    rubric_id: StrictStr = Field(alias="rubricId", min_length=1)
    score: StrictInt = Field(ge=0, le=4)
    evidence: StrictStr = Field(min_length=1, max_length=500)

    def model_post_init(self, __context: Any) -> None:
        if not self.evidence.strip():
            raise ValueError("evidence must not be empty")


class QualityJudgeOutput(EvalQualityJudgeModel):
    scores: list[QualityJudgeRubricScore]
