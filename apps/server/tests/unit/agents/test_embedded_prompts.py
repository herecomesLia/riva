import pytest
from pydantic import BaseModel

from riva.agents import (
    FollowUpAgent,
    InterviewCandidateQuestionAgent,
    InterviewPlanningAgent,
    InterviewReviewAgent,
    InterviewTurnAgent,
    JobDescriptionParsingAgent,
    MatchingAnalysisAgent,
    PracticeEvaluationAgent,
    PracticeRecommendationAgent,
    PracticeReferenceAnswerAgent,
    PracticeReviewAgent,
    QuestionGenerationAgent,
    ResumeParsingAgent,
    TrainingPlanningAgent,
)
from riva.evals.quality_judge import AgentEvalQualityJudge


@pytest.mark.parametrize(
    "agent_class",
    [
        AgentEvalQualityJudge,
        FollowUpAgent,
        InterviewCandidateQuestionAgent,
        InterviewPlanningAgent,
        InterviewReviewAgent,
        InterviewTurnAgent,
        JobDescriptionParsingAgent,
        MatchingAnalysisAgent,
        PracticeEvaluationAgent,
        PracticeRecommendationAgent,
        PracticeReferenceAnswerAgent,
        PracticeReviewAgent,
        QuestionGenerationAgent,
        ResumeParsingAgent,
        TrainingPlanningAgent,
    ],
)
def test_agent_owns_prompt_and_output_metadata(agent_class: type) -> None:
    assert agent_class.agent_id
    assert agent_class.agent_version
    assert agent_class.system_prompt
    assert agent_class.user_prompt
    assert issubclass(agent_class.output_schema, BaseModel)
    assert agent_class.output_schema_id
