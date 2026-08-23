from pydantic import TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from riva.agents.practice.recommendation_types import PracticeRecommendationOutput
from riva.integrations.llm import LLMProvider
from riva.models import PracticeRecommendation
from riva.services.errors import service_error_for_code


def practice_recommendation_output_from_artifact(
    artifact: PracticeRecommendation,
) -> PracticeRecommendationOutput:
    values: dict[str, object] = {
        "action": artifact.action,
        "reason": artifact.reason,
    }
    if artifact.action == "nextQuestion":
        values["nextQuestion"] = {
            "questionType": artifact.next_question_type,
            "difficulty": artifact.next_difficulty,
            "focusAreas": artifact.focus_areas,
        }
    try:
        return TypeAdapter(PracticeRecommendationOutput).validate_python(values)
    except TypeError, ValueError, ValidationError:
        raise service_error_for_code("practice_recommendation_output_invalid") from None


class RecommendationGenerationService:
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
