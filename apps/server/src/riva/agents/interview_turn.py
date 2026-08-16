import json
from collections.abc import Mapping

from riva.agents.base import Agent
from riva.integrations import GenerationParameters, LLMProvider
from riva.prompts import INTERVIEW_TURN_PROMPT
from riva.schemas.interview_turn import InterviewTurnInput, InterviewTurnOutput


def _stable_json(value: object) -> str:
    if hasattr(value, "model_dump"):
        value = value.model_dump(mode="json", by_alias=True)
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


class InterviewTurnAgent(Agent[InterviewTurnInput, InterviewTurnOutput]):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=INTERVIEW_TURN_PROMPT,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "interview-turn"

    def prompt_values(self, input: InterviewTurnInput) -> Mapping[str, object]:
        return {
            "interaction_language": input.session.language,
            "remaining_follow_up_slots": input.remaining_follow_up_slots,
            "interview_turn_input": _stable_json(input),
        }


__all__ = ["InterviewTurnAgent"]
