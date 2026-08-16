import json
from collections.abc import Mapping

from pydantic import BaseModel

from riva.agents.base import Agent
from riva.integrations import GenerationParameters, LLMProvider
from riva.prompts import INTERVIEW_PLANNING_PROMPT
from riva.schemas.interview_planning import (
    InterviewPlanningInput,
    InterviewPlanningOutput,
)


def _stable_json(value: BaseModel | None) -> str:
    if value is None:
        return "null"
    return json.dumps(
        value.model_dump(mode="json", by_alias=True),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


class InterviewPlanningAgent(
    Agent[InterviewPlanningInput, InterviewPlanningOutput]
):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=INTERVIEW_PLANNING_PROMPT,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "interview-planner"

    def prompt_values(
        self,
        input: InterviewPlanningInput,
    ) -> Mapping[str, object]:
        return {
            "interaction_language": input.interaction_language,
            "configuration": _stable_json(input.configuration),
            "session": _stable_json(input.session),
            "career_profile": _stable_json(input.career_profile),
            "target_role": _stable_json(input.target_role),
            "job_description_analysis": _stable_json(
                input.job_description_analysis
            ),
            "matching_analysis": _stable_json(input.matching_analysis),
        }


__all__ = ["InterviewPlanningAgent"]
