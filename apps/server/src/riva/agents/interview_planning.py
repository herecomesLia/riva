import json
from collections.abc import Mapping

from pydantic import BaseModel

from riva.agents.base import Agent
from riva.integrations import GenerationParameters, LLMProvider
from riva.prompts import INTERVIEW_PLANNING_PROMPT
from riva.prompts.base import PromptDefinition
from riva.schemas.interview_planning import (
    InterviewPlanningInput,
    InterviewPlanningOutput,
)
from riva.services.interview_planning_prompt_versions import (
    get_interview_planning_prompt,
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
        *,
        prompt: PromptDefinition[InterviewPlanningOutput] = (
            INTERVIEW_PLANNING_PROMPT
        ),
    ) -> None:
        try:
            resolved_prompt = get_interview_planning_prompt(prompt.version)
        except ValueError:
            raise ValueError(
                "unsupported interview planning prompt version"
            ) from None
        if resolved_prompt is not prompt:
            raise ValueError(
                "interview planning prompt must be the canonical version definition"
            )
        super().__init__(
            provider=provider,
            prompt=prompt,
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
        values: dict[str, object] = {
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
        if get_interview_planning_prompt(self.prompt.version).version == "2":
            values["training_memory"] = _stable_json(input.training_memory)
        return values


__all__ = ["InterviewPlanningAgent"]
