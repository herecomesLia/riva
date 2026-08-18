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
from riva.prompts import TRAINING_PLANNING_PROMPT
from riva.prompts.base import PromptDefinition
from riva.schemas.training_planning import (
    TrainingPlanningInput,
    TrainingPlanningMockInterviewOutput,
    TrainingPlanningOutput,
    TrainingPlanningTargetedPracticeOutput,
)


def _stable_json(value: BaseModel | Sequence[BaseModel] | None) -> str:
    if value is None:
        serializable: object = None
    elif isinstance(value, BaseModel):
        serializable = value.model_dump(mode="json", by_alias=True)
    else:
        serializable = [
            item.model_dump(mode="json", by_alias=True) for item in value
        ]
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


class TrainingPlanningAgent(
    Agent[TrainingPlanningInput, TrainingPlanningOutput]
):
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
        output = result.output
        errors: list[tuple[str, str]] = []

        if isinstance(output, TrainingPlanningTargetedPracticeOutput):
            if output.question_type not in (
                input.constraints.targeted_practice.question_types
            ):
                errors.append(
                    (
                        "question_type",
                        "training_planning_question_type_not_allowed",
                    )
                )
            if output.difficulty not in (
                input.constraints.targeted_practice.difficulties
            ):
                errors.append(
                    (
                        "difficulty",
                        "training_planning_difficulty_not_allowed",
                    )
                )
            if (
                output.prioritize_weaknesses
                and not input.constraints.targeted_practice.can_prioritize_weaknesses
            ):
                errors.append(
                    (
                        "prioritize_weaknesses",
                        "training_planning_weakness_prioritization_not_allowed",
                    )
                )
        elif isinstance(output, TrainingPlanningMockInterviewOutput):
            if output.round not in input.constraints.mock_interview.rounds:
                errors.append(
                    (
                        "round",
                        "training_planning_round_not_allowed",
                    )
                )
            if output.difficulty not in (
                input.constraints.mock_interview.difficulties
            ):
                errors.append(
                    (
                        "difficulty",
                        "training_planning_difficulty_not_allowed",
                    )
                )
            if output.duration_minutes not in (
                input.constraints.mock_interview.duration_minutes
            ):
                errors.append(
                    (
                        "duration_minutes",
                        "training_planning_duration_not_allowed",
                    )
                )

        if errors:
            raise _invalid_output(errors)
        return result


__all__ = ["TrainingPlanningAgent"]
