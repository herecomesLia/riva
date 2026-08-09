from collections.abc import Mapping

from riva.agents.base import Agent
from riva.integrations import GenerationParameters, LLMProvider
from riva.prompts import RESUME_PARSING_PROMPT
from riva.schemas.resume_parsing import ResumeParsingInput, ResumeParsingOutput


class ResumeParsingAgent(Agent[ResumeParsingInput, ResumeParsingOutput]):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=RESUME_PARSING_PROMPT,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "resume-parser"

    def prompt_values(
        self, input: ResumeParsingInput
    ) -> Mapping[str, object]:
        return {
            "resume_text": input.resume_text,
            "interaction_language": input.interaction_language,
        }
