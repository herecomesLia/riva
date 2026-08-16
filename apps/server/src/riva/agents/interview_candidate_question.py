import json
from collections.abc import Mapping

from riva.agents.base import Agent
from riva.integrations import GenerationParameters, LLMProvider
from riva.prompts import INTERVIEW_CANDIDATE_QUESTION_PROMPT
from riva.schemas.interview_candidate_question import (
    InterviewCandidateQuestionInput,
    InterviewCandidateQuestionOutput,
)


def _stable_json(value: object) -> str:
    if hasattr(value, "model_dump"):
        value = value.model_dump(mode="json", by_alias=True)
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


class InterviewCandidateQuestionAgent(
    Agent[InterviewCandidateQuestionInput, InterviewCandidateQuestionOutput]
):
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        parameters: GenerationParameters | None = None,
    ) -> None:
        super().__init__(
            provider=provider,
            prompt=INTERVIEW_CANDIDATE_QUESTION_PROMPT,
            model=model,
            parameters=parameters,
        )

    @property
    def agent_id(self) -> str:
        return "interview-candidate-question"

    def prompt_values(
        self,
        input: InterviewCandidateQuestionInput,
    ) -> Mapping[str, object]:
        return {
            "interaction_language": input.interaction_language,
            "interview_candidate_question_input": _stable_json(input),
        }


__all__ = ["InterviewCandidateQuestionAgent"]
