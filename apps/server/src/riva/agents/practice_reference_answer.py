import json
from collections.abc import Mapping, Sequence

from pydantic import BaseModel

from riva.agents.base import Agent
from riva.integrations import GenerationParameters, LLMProvider
from riva.prompts import PRACTICE_REFERENCE_ANSWER_PROMPT
from riva.schemas.practice_reference_answer import (
    PracticeFollowUpReferenceAnswerInput,
    PracticeReferenceAnswerInput,
    PracticeReferenceAnswerOutput,
)


def _stable_json(
    value: BaseModel | Sequence[BaseModel] | None,
) -> str:
    if value is None:
        serializable: object = {}
    elif isinstance(value, BaseModel):
        serializable = value.model_dump(mode="json")
    else:
        serializable = [item.model_dump(mode="json") for item in value]
    return json.dumps(
        serializable,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


class PracticeReferenceAnswerAgent(
    Agent[PracticeReferenceAnswerInput, PracticeReferenceAnswerOutput]
):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=PRACTICE_REFERENCE_ANSWER_PROMPT,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "practice-reference-answer-generator"

    def prompt_values(
        self,
        input: PracticeReferenceAnswerInput,
    ) -> Mapping[str, object]:
        follow_up_input = (
            input if isinstance(input, PracticeFollowUpReferenceAnswerInput) else None
        )
        return {
            "interaction_language": input.interaction_language,
            "target_type": input.target_type,
            "expected_kind": input.expected_kind,
            "target_role": _stable_json(input.target_role),
            "question": _stable_json(input.question),
            "candidate_evidence": _stable_json(input.candidate_evidence),
            "main_answer": _stable_json(
                follow_up_input.main_answer if follow_up_input else None
            ),
            "previous_follow_ups": _stable_json(
                follow_up_input.previous_follow_ups if follow_up_input else []
            ),
            "current_follow_up": _stable_json(
                follow_up_input.current_follow_up if follow_up_input else None
            ),
        }


__all__ = ["PracticeReferenceAnswerAgent"]
