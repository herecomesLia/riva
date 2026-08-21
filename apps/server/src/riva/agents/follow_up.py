import json
from collections.abc import Mapping, Sequence

from pydantic import BaseModel

from riva.agents.base import Agent, AgentResult
from riva.integrations import (
    GenerationParameters,
    InvalidStructuredOutputError,
    LLMProvider,
    StructuredOutputDiagnostics,
    StructuredOutputValidationError,
)
from riva.prompts import FOLLOW_UP_PROMPT
from riva.schemas.follow_up import (
    FollowUpGenerationOutput,
    FollowUpInput,
    FollowUpQuestionOutput,
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


def _normalized_prompt(value: str) -> str:
    return " ".join(value.split()).casefold()


def _duplicate_prompt_error() -> InvalidStructuredOutputError:
    diagnostics = StructuredOutputDiagnostics(
        stage="schema_validation",
        output_schema="FollowUpGenerationOutput",
        validation_errors=(
            StructuredOutputValidationError(
                location="prompt",
                type="duplicate_follow_up_prompt",
            ),
        ),
    )
    return InvalidStructuredOutputError(diagnostics)


class FollowUpAgent(Agent[FollowUpInput, FollowUpGenerationOutput]):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=FOLLOW_UP_PROMPT,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "follow-up-generator"

    def prompt_values(self, input: FollowUpInput) -> Mapping[str, object]:
        return {
            "interaction_language": input.interaction_language,
            "question": _stable_json(input.question),
            "main_answer": _stable_json(input.main_answer),
            "previous_follow_ups": _stable_json(input.previous_follow_ups),
            "next_follow_up_order": input.next_follow_up_order,
        }

    async def run(self, input: FollowUpInput) -> AgentResult[FollowUpGenerationOutput]:
        result = await super().run(input)
        output = result.output
        if isinstance(output, FollowUpQuestionOutput):
            generated_prompt = _normalized_prompt(output.prompt)
            existing_prompts = {
                _normalized_prompt(input.question.prompt),
                *(
                    _normalized_prompt(exchange.prompt)
                    for exchange in input.previous_follow_ups
                ),
            }
            if generated_prompt in existing_prompts:
                raise _duplicate_prompt_error()
        return result


__all__ = ["FollowUpAgent"]
