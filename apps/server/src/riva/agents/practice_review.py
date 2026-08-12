import json
from collections.abc import Mapping, Sequence

from pydantic import BaseModel

from riva.agents.base import Agent, AgentResult
from riva.integrations import GenerationParameters, LLMProvider
from riva.prompts import PRACTICE_REVIEW_PROMPT
from riva.schemas.practice_review import (
    PracticeReviewInput,
    PracticeReviewOutput,
)


def _stable_json(value: BaseModel | Sequence[BaseModel]) -> str:
    if isinstance(value, BaseModel):
        serializable: object = value.model_dump(mode="json")
    else:
        serializable = [item.model_dump(mode="json") for item in value]
    return json.dumps(
        serializable,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


class PracticeReviewAgent(Agent[PracticeReviewInput, PracticeReviewOutput]):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=PRACTICE_REVIEW_PROMPT,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "practice-reviewer"

    def prompt_values(self, input: PracticeReviewInput) -> Mapping[str, object]:
        return {
            "interaction_language": input.interaction_language,
            "follow_up_completion_reason": input.follow_up_completion_reason.value,
            "question": _stable_json(input.question),
            "main_answer": _stable_json(input.main_answer),
            "follow_up_exchanges": _stable_json(input.follow_up_exchanges),
            "evaluation": _stable_json(input.evaluation),
        }


__all__ = ["PracticeReviewAgent"]
