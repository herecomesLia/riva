from pydantic import TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.practice.evaluation_types import (
    PracticeEvaluationOutput,
)
from riva.integrations.llm import LLMProvider
from riva.models import PracticeEvaluation
from riva.services.errors import service_error_for_code


def practice_evaluation_output_from_artifact(
    artifact: PracticeEvaluation,
    *,
    scoring_focus_count: int | None = None,
) -> PracticeEvaluationOutput:
    try:
        output = TypeAdapter(PracticeEvaluationOutput).validate_python(
            {
                "overallScore": artifact.overall_score,
                "dimensionScores": artifact.dimension_scores,
                "focusAssessments": artifact.focus_assessments,
            }
        )
        if (
            scoring_focus_count is not None
            and len(output.focus_assessments) != scoring_focus_count
        ):
            raise ValueError(
                "evaluation focus assessment count does not match question"
            )
        return output
    except TypeError, ValueError, ValidationError:
        raise service_error_for_code("practice_evaluation_output_invalid") from None


class EvaluationGenerationService:
    """Small compatibility facade for direct evaluation callers."""

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
