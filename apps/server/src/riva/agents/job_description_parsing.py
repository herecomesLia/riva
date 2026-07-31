from collections.abc import Mapping

from riva.agents.base import Agent
from riva.integrations import GenerationParameters, LLMProvider
from riva.prompts.job_description_parsing import JOB_DESCRIPTION_PARSING_PROMPT_V1
from riva.schemas.job_description_parsing import (
    JobDescriptionParsingInput,
    JobDescriptionParsingOutput,
)


class JobDescriptionParsingAgent(
    Agent[JobDescriptionParsingInput, JobDescriptionParsingOutput]
):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=JOB_DESCRIPTION_PARSING_PROMPT_V1,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "job-description-parser"

    def prompt_values(
        self, input: JobDescriptionParsingInput
    ) -> Mapping[str, object]:
        return {
            "role_title": input.role_title,
            "company": input.company or "",
            "raw_job_description": input.raw_job_description,
        }
