import json
from collections.abc import Mapping, Sequence

from pydantic import BaseModel

from riva.agents.base import Agent, AgentResult
from riva.core.training_planning import (
    TrainingPlanningOutputContractError,
    validate_training_planning_output_contract,
)
from riva.integrations import (
    GenerationParameters,
    InvalidStructuredOutputError,
    LLMProvider,
    StructuredOutputDiagnostics,
    StructuredOutputValidationError,
)
from riva.prompts import TRAINING_PLANNING_PROMPT
from riva.prompts.base import PromptDefinition
from riva.schemas.training_planning import (
    TrainingPlanningInput,
    TrainingPlanningOutput,
)


def _stable_json(value: BaseModel | Sequence[BaseModel] | None) -> str:
    if value is None:
        serializable: object = None
    elif isinstance(value, BaseModel):
        serializable = value.model_dump(mode="json", by_alias=True)
    else:
        serializable = [item.model_dump(mode="json", by_alias=True) for item in value]
    return json.dumps(
        serializable,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _invalid_output(
    errors: list[tuple[str, str]],
) -> InvalidStructuredOutputError:
    diagnostics = StructuredOutputDiagnostics(
        stage="schema_validation",
        output_schema="TrainingPlanningOutput",
        validation_errors=tuple(
            StructuredOutputValidationError(location=location, type=error_type)
            for location, error_type in errors
        ),
    )
    return InvalidStructuredOutputError(diagnostics)


class TrainingPlanningAgent(Agent[TrainingPlanningInput, TrainingPlanningOutput]):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
        *,
        prompt: PromptDefinition[TrainingPlanningOutput] = TRAINING_PLANNING_PROMPT,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=prompt,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "training-planner"

    def prompt_values(
        self,
        input: TrainingPlanningInput,
    ) -> Mapping[str, object]:
        return {
            "interaction_language": input.interaction_language,
            "constraints": _stable_json(input.constraints),
            "target_role": _stable_json(input.target_role),
            "matching_analysis": _stable_json(input.matching_analysis),
            "training_memory": _stable_json(input.training_memory),
            "recent_training": _stable_json(input.recent_training),
        }

    async def run(
        self,
        input: TrainingPlanningInput,
    ) -> AgentResult[TrainingPlanningOutput]:
        result = await super().run(input)
        try:
            validate_training_planning_output_contract(input, result.output)
        except TrainingPlanningOutputContractError as error:
            raise _invalid_output(
                [
                    (violation.location, violation.error_type)
                    for violation in error.violations
                ]
            ) from None
        return result


__all__ = ["TrainingPlanningAgent"]
