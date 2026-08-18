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
from riva.prompts import PRACTICE_RECOMMENDATION_PROMPT
from riva.prompts.base import PromptDefinition
from riva.schemas.practice_recommendation import (
    PracticeNextQuestionRecommendation,
    PracticeRecommendationInput,
    PracticeRecommendationOutput,
)
from riva.services.practice_recommendation_prompt_versions import (
    get_practice_recommendation_prompt,
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


def _recommendation_contract_error(
    *,
    location: str,
    error_type: str,
) -> InvalidStructuredOutputError:
    diagnostics = StructuredOutputDiagnostics(
        stage="schema_validation",
        output_schema="PracticeRecommendationOutput",
        validation_errors=(
            StructuredOutputValidationError(
                location=location,
                type=error_type,
            ),
        ),
    )
    return InvalidStructuredOutputError(diagnostics)


class PracticeRecommendationAgent(
    Agent[PracticeRecommendationInput, PracticeRecommendationOutput]
):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
        *,
        prompt: PromptDefinition[PracticeRecommendationOutput] = (
            PRACTICE_RECOMMENDATION_PROMPT
        ),
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=prompt,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "practice-recommender"

    def prompt_values(
        self,
        input: PracticeRecommendationInput,
    ) -> Mapping[str, object]:
        values: dict[str, object] = {
            "interaction_language": input.interaction_language,
            "follow_up_completion_reason": input.follow_up_completion_reason.value,
            "question": _stable_json(input.question),
            "evaluation": _stable_json(input.evaluation),
            "review": _stable_json(input.review),
        }
        if get_practice_recommendation_prompt(
            self.prompt.version
        ).version == PRACTICE_RECOMMENDATION_PROMPT.version:
            values["training_memory"] = _stable_json(input.training_memory)
        return values

    async def run(
        self,
        input: PracticeRecommendationInput,
    ) -> AgentResult[PracticeRecommendationOutput]:
        result = await super().run(input)
        output = result.output
        if not isinstance(output, PracticeNextQuestionRecommendation):
            return result

        plan = output.next_question
        if plan.question_type != input.question.question_type:
            raise _recommendation_contract_error(
                location="next_question.question_type",
                error_type="recommendation_question_type_mismatch",
            )
        if plan.difficulty != input.question.difficulty:
            raise _recommendation_contract_error(
                location="next_question.difficulty",
                error_type="recommendation_difficulty_mismatch",
            )
        if not set(plan.focus_areas).issubset(
            set(input.review.exposed_weaknesses)
        ):
            raise _recommendation_contract_error(
                location="next_question.focus_areas",
                error_type="recommendation_focus_area_mismatch",
            )
        return result


__all__ = ["PracticeRecommendationAgent"]
