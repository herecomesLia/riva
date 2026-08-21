import json
from collections.abc import Mapping

from pydantic import BaseModel

from riva.agents.base import Agent
from riva.integrations import GenerationParameters, LLMProvider
from riva.prompts import MATCHING_ANALYSIS_PROMPT
from riva.schemas.matching_analysis import (
    MatchingAnalysisInput,
    MatchingAnalysisOutput,
)


def _stable_json(value: BaseModel) -> str:
    model_dump = value.model_dump(mode="json")
    return json.dumps(
        model_dump,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


class MatchingAnalysisAgent(Agent[MatchingAnalysisInput, MatchingAnalysisOutput]):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=MATCHING_ANALYSIS_PROMPT,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "matching-analyzer"

    def prompt_values(self, input: MatchingAnalysisInput) -> Mapping[str, object]:
        return {
            "career_profile": _stable_json(input.career_profile),
            "job": _stable_json(input.job),
            "interaction_language": input.interaction_language,
        }
