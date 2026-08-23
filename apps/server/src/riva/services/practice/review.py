from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.practice.review_types import PracticeReviewOutput
from riva.integrations.llm import LLMProvider
from riva.models import PracticeReview
from riva.services.errors import service_error_for_code


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
        raise service_error_for_code("practice_review_output_invalid") from None


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
