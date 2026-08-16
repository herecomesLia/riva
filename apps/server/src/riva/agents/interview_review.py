import json
from collections.abc import Mapping

from riva.agents.base import Agent
from riva.integrations import GenerationParameters, LLMProvider
from riva.prompts import INTERVIEW_REVIEW_PROMPT
from riva.schemas.interview_review import InterviewReviewInput, InterviewReviewOutput


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
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=INTERVIEW_REVIEW_PROMPT,
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
        return {
            "completion_reason": input.completion_reason.value,
            "review_mode": input.review_mode.value,
            "interaction_language": input.interaction_language,
            "interview_review_input": _stable_json(input),
        }


__all__ = ["InterviewReviewAgent"]
