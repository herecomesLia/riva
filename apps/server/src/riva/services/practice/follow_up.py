from typing import cast

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.practice.follow_up_types import (
    FollowUpCompleteOutput,
    FollowUpGenerationOutput,
    FollowUpQuestionOutput,
)
from riva.integrations.llm import LLMProvider
from riva.models import PracticeFollowUpDecision, PracticeFollowUpQuestion
from riva.services.errors import service_error_for_code


def follow_up_output_from_persistence(
    decision: PracticeFollowUpDecision,
    question: PracticeFollowUpQuestion | None = None,
) -> FollowUpGenerationOutput:
    if decision.action == "complete":
        if decision.follow_up_question_id is not None or question is not None:
            raise service_error_for_code("follow_up_generation_context_conflict")
        return cast(
            FollowUpGenerationOutput,
            FollowUpCompleteOutput.model_validate({"action": "complete"}),
        )
    if (
        decision.action != "askFollowUp"
        or decision.follow_up_question_id is None
        or question is None
        or question.id != decision.follow_up_question_id
    ):
        raise service_error_for_code("follow_up_generation_context_conflict")
    try:
        return cast(
            FollowUpGenerationOutput,
            FollowUpQuestionOutput.model_validate(
                {
                    "action": "askFollowUp",
                    "prompt": question.prompt,
                    "focus": question.focus,
                    "answerHints": question.answer_hints,
                    "answerFramework": question.answer_framework,
                }
            ),
        )
    except TypeError, ValueError, ValidationError:
        raise service_error_for_code("follow_up_generation_output_invalid") from None


class FollowUpGenerationService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        llm_provider: LLMProvider | None = None,
        llm_model: str | None = None,
    ) -> None:
        self.session = session
        self.llm_provider = llm_provider
        self.llm_model = (llm_model or "").strip()
