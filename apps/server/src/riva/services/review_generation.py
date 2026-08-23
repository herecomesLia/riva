from typing import Literal

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.integrations import LLMProvider
from riva.models import PracticeReview
from riva.schemas.practice_review import PracticeReviewOutput

ReviewGenerationStateErrorCode = Literal[
    "practice_review_context_conflict",
    "practice_review_output_invalid",
]


class ReviewGenerationStateError(RuntimeError):
    safe_message = "The practice review state is invalid."

    def __init__(self, code: ReviewGenerationStateErrorCode) -> None:
        self.code = code
        super().__init__(self.safe_message)


def practice_review_output_from_artifact(
    artifact: PracticeReview,
) -> PracticeReviewOutput:
    try:
        return PracticeReviewOutput.model_validate(
            {
                "overallPerformance": artifact.overall_performance,
                "highlights": artifact.highlights,
                "mainIssues": artifact.main_issues,
                "improvementSuggestions": artifact.improvement_suggestions,
                "reusableAnswerStructure": artifact.reusable_answer_structure,
                "exposedWeaknesses": artifact.exposed_weaknesses,
            }
        )
    except TypeError, ValueError, ValidationError:
        raise ReviewGenerationStateError("practice_review_output_invalid") from None


class ReviewGenerationService:
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


__all__ = [
    "ReviewGenerationService",
    "ReviewGenerationStateError",
    "ReviewGenerationStateErrorCode",
    "practice_review_output_from_artifact",
]
