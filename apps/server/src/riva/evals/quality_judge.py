from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, StrictStr

from riva.agents.base import Agent, AgentResult
from riva.evals.models import AgentEvalRubric
from riva.integrations import GenerationParameters, LLMProvider, LLMUsage
from riva.prompts import EVAL_QUALITY_JUDGE_PROMPT
from riva.schemas.eval_quality_judge import QualityJudgeOutput


class QualityJudgeInput(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )

    case_id: StrictStr = Field(alias="caseId", min_length=1)
    target_agent_id: StrictStr = Field(alias="targetAgentId", min_length=1)
    target_prompt_version: StrictStr = Field(
        alias="targetPromptVersion",
        min_length=1,
    )
    input: dict[str, Any]
    output: dict[str, Any]
    rubrics: list[AgentEvalRubric]


class QualityJudgeRubricMismatchError(ValueError):
    def __init__(
        self,
        expected_ids: list[str],
        actual_ids: list[str],
        *,
        usage: LLMUsage,
    ) -> None:
        self.expected_ids = expected_ids
        self.actual_ids = actual_ids
        self.usage = usage
        super().__init__(
            "quality judge rubric ids must match exactly: "
            f"expected={expected_ids!r}, actual={actual_ids!r}"
        )


class AgentEvalQualityJudge(
    Agent[QualityJudgeInput, QualityJudgeOutput]
):
    def __init__(self, provider: LLMProvider, model: str) -> None:
        super().__init__(
            provider=provider,
            prompt=EVAL_QUALITY_JUDGE_PROMPT,
            model=model,
            parameters=GenerationParameters(temperature=0),
        )

    @property
    def agent_id(self) -> str:
        return "eval-quality-judge"

    def prompt_values(self, input: QualityJudgeInput) -> Mapping[str, object]:
        return {
            "case_id": input.case_id,
            "target_agent_id": input.target_agent_id,
            "target_prompt_version": input.target_prompt_version,
            "synthetic_input": _stable_json(input.input),
            "target_agent_output": _stable_json(input.output),
            "requested_rubrics": _stable_json(
                [
                    rubric.model_dump(mode="json", by_alias=True)
                    for rubric in input.rubrics
                ]
            ),
        }

    async def run(
        self,
        input: QualityJudgeInput,
    ) -> AgentResult[QualityJudgeOutput]:
        result = await super().run(input)
        expected_ids = [rubric.id for rubric in input.rubrics]
        actual_ids = [score.rubric_id for score in result.output.scores]
        if (
            len(actual_ids) != len(set(actual_ids))
            or len(actual_ids) != len(expected_ids)
            or set(actual_ids) != set(expected_ids)
        ):
            raise QualityJudgeRubricMismatchError(
                expected_ids,
                actual_ids,
                usage=result.usage,
            )
        return result


def _stable_json(value: object) -> str:
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json", by_alias=True)
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


__all__ = [
    "AgentEvalQualityJudge",
    "QualityJudgeInput",
    "QualityJudgeRubricMismatchError",
]
