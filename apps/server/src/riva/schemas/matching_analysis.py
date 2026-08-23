from typing import Annotated

from pydantic import Field, StrictInt, StringConstraints

from riva.schemas.base import APIModel

AnalysisItem = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=1_000),
]
AnalysisItemList = Annotated[list[AnalysisItem], Field(max_length=100)]
Summary = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000),
]
OverallMatchScore = Annotated[StrictInt, Field(ge=0, le=100)]


class MatchingAnalysisResultResponse(APIModel):
    model_config = {"extra": "forbid"}

    overall_match_score: OverallMatchScore
    core_requirements_summary: Summary
    matched_capabilities: AnalysisItemList
    missing_capabilities: AnalysisItemList
    underrepresented_capabilities: AnalysisItemList
    resume_highlights: AnalysisItemList
    resume_gaps: AnalysisItemList
    high_risk_questions: AnalysisItemList
    preparation_recommendations: AnalysisItemList
