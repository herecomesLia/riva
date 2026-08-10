import json
from collections.abc import Mapping
from dataclasses import replace

from pydantic import BaseModel

from riva.agents.base import Agent, AgentResult
from riva.integrations import (
    GenerationParameters,
    InvalidStructuredOutputError,
    LLMProvider,
    StructuredOutputDiagnostics,
    StructuredOutputValidationError,
)
from riva.prompts import QUESTION_GENERATION_PROMPT
from riva.schemas.question_cards import (
    MAX_QUESTION_CARD_MATERIAL_LABEL_LENGTH,
    QuestionCardMaterialType,
)
from riva.schemas.question_generation import (
    QuestionGenerationInput,
    QuestionGenerationOutput,
)


def _stable_json(value: BaseModel) -> str:
    return json.dumps(
        value.model_dump(mode="json"),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _invalid_output(
    errors: list[tuple[str, str]],
) -> InvalidStructuredOutputError:
    diagnostics = StructuredOutputDiagnostics(
        stage="schema_validation",
        output_schema=QuestionGenerationOutput.__name__,
        validation_errors=tuple(
            StructuredOutputValidationError(location=location, type=error_type)
            for location, error_type in errors
        ),
    )
    return InvalidStructuredOutputError(diagnostics)


def _work_experience_label(company: str, title: str) -> str:
    label = f"{company} / {title}"
    if len(label) <= MAX_QUESTION_CARD_MATERIAL_LABEL_LENGTH:
        return label
    return title


class QuestionGenerationAgent(
    Agent[QuestionGenerationInput, QuestionGenerationOutput]
):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=QUESTION_GENERATION_PROMPT,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "question-generator"

    def prompt_values(
        self, input: QuestionGenerationInput
    ) -> Mapping[str, object]:
        return {
            "interaction_language": input.interaction_language,
            "question_type": input.question_type.value,
            "difficulty": input.difficulty.value,
            "target_role": _stable_json(input.target_role),
            "career_profile": _stable_json(input.career_profile),
            "job_description_analysis": _stable_json(
                input.job_description_analysis
            ),
            "matching_analysis": _stable_json(input.matching_analysis),
        }

    async def run(
        self, input: QuestionGenerationInput
    ) -> AgentResult[QuestionGenerationOutput]:
        result = await super().run(input)
        output = result.output
        errors: list[tuple[str, str]] = []

        if output.question_type != input.question_type:
            errors.append(("question_type", "question_type_mismatch"))
        if output.difficulty != input.difficulty:
            errors.append(("difficulty", "difficulty_mismatch"))

        work_labels = {
            experience.id: _work_experience_label(
                experience.company, experience.title
            )
            for experience in input.career_profile.work_experiences
        }
        project_labels = {
            experience.id: experience.name
            for experience in input.career_profile.project_experiences
        }
        canonical_materials = []
        for index, material in enumerate(output.recommended_materials):
            location = f"recommended_materials.{index}.id"
            if material.type == QuestionCardMaterialType.WORK_EXPERIENCE:
                if material.id not in work_labels:
                    error_type = (
                        "material_reference_type_mismatch"
                        if material.id in project_labels
                        else "material_reference_not_in_profile"
                    )
                    errors.append((location, error_type))
                    continue
                label = work_labels[material.id]
            elif material.type == QuestionCardMaterialType.PROJECT_EXPERIENCE:
                if material.id not in project_labels:
                    error_type = (
                        "material_reference_type_mismatch"
                        if material.id in work_labels
                        else "material_reference_not_in_profile"
                    )
                    errors.append((location, error_type))
                    continue
                label = project_labels[material.id]
            else:
                errors.append(
                    (
                        f"recommended_materials.{index}.type",
                        "invalid_material_type",
                    )
                )
                continue
            canonical_materials.append(material.model_copy(update={"label": label}))

        if errors:
            raise _invalid_output(errors)

        if canonical_materials != output.recommended_materials:
            output = output.model_copy(
                update={"recommended_materials": canonical_materials}
            )
            result = replace(result, output=output)
        return result


__all__ = ["QuestionGenerationAgent"]
