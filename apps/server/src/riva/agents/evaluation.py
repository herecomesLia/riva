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
from riva.prompts import PRACTICE_EVALUATION_PROMPT
from riva.schemas.evaluation import EvaluationInput, PracticeEvaluationOutput


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


def _focus_assessment_mismatch() -> InvalidStructuredOutputError:
    diagnostics = StructuredOutputDiagnostics(
        stage="schema_validation",
        output_schema=PracticeEvaluationOutput.__name__,
        validation_errors=(
            StructuredOutputValidationError(
                location="focus_assessments",
                type="focus_assessment_mismatch",
            ),
        ),
    )
    return InvalidStructuredOutputError(diagnostics)


class PracticeEvaluationAgent(Agent[EvaluationInput, PracticeEvaluationOutput]):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=PRACTICE_EVALUATION_PROMPT,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "practice-evaluator"

    def prompt_values(self, input: EvaluationInput) -> Mapping[str, object]:
        return {
            "interaction_language": input.interaction_language,
            "question": _stable_json(input.question),
            "main_answer": _stable_json(input.main_answer),
            "follow_up_exchanges": _stable_json(input.follow_up_exchanges),
            "follow_up_completion_reason": input.follow_up_completion_reason.value,
        }

    async def run(
        self, input: EvaluationInput
    ) -> AgentResult[PracticeEvaluationOutput]:
        result = await super().run(input)
        expected_indices = list(range(len(input.question.scoring_focus)))
        actual_indices = [
            assessment.focus_index for assessment in result.output.focus_assessments
        ]
        if actual_indices != expected_indices:
            raise _focus_assessment_mismatch()
        return result


__all__ = ["PracticeEvaluationAgent"]
