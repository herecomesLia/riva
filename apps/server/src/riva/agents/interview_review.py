import json
from collections.abc import Mapping

from riva.agents.base import Agent
from riva.integrations import GenerationParameters, LLMProvider
from riva.prompts import INTERVIEW_REVIEW_PROMPT
from riva.prompts.base import PromptDefinition
from riva.schemas.interview_review import InterviewReviewInput, InterviewReviewOutput
from riva.services.interview_review_prompt_versions import (
    get_interview_review_prompt,
)


def _stable_json(value: object) -> str:
    if hasattr(value, "model_dump"):
        value = value.model_dump(mode="json", by_alias=True)
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


class InterviewReviewAgent(Agent[InterviewReviewInput, InterviewReviewOutput]):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
        *,
        prompt: PromptDefinition[InterviewReviewOutput] = INTERVIEW_REVIEW_PROMPT,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=prompt,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "interview-review"

    def prompt_values(
        self,
        input: InterviewReviewInput,
    ) -> Mapping[str, object]:
        resolved_prompt = get_interview_review_prompt(self.prompt.version)
        input_payload = input.model_dump(mode="json", by_alias=True)
        input_payload.pop("trainingMemory", None)
        if resolved_prompt.version == INTERVIEW_REVIEW_PROMPT.version:
            planner_context = input_payload.get("plannerContext")
            if isinstance(planner_context, dict):
                planner_context.pop("trainingMemory", None)
        values: dict[str, object] = {
            "completion_reason": input.completion_reason.value,
            "review_mode": input.review_mode.value,
            "interaction_language": input.interaction_language,
            "interview_review_input": _stable_json(input_payload),
        }
        if resolved_prompt.version == INTERVIEW_REVIEW_PROMPT.version:
            values["training_memory"] = _stable_json(input.training_memory)
        return values


__all__ = ["InterviewReviewAgent"]
