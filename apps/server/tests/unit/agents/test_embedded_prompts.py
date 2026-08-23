import pytest
from pydantic import BaseModel

from riva.agents.interview.candidate_question import InterviewCandidateQuestionAgent
from riva.agents.interview.planning import InterviewPlanningAgent
from riva.agents.interview.review import InterviewReviewAgent
from riva.agents.interview.turn import InterviewTurnAgent
from riva.agents.jobs.jd_parser import JobDescriptionParsingAgent
from riva.agents.jobs.matcher import MatchingAnalysisAgent
from riva.agents.practice.evaluation import PracticeEvaluationAgent
from riva.agents.practice.follow_up import FollowUpAgent
from riva.agents.practice.question import QuestionGenerationAgent
from riva.agents.practice.recommendation import PracticeRecommendationAgent
from riva.agents.practice.reference_answer import PracticeReferenceAnswerAgent
from riva.agents.practice.review import PracticeReviewAgent
from riva.agents.resumes.parser import ResumeParsingAgent
from riva.agents.training.planning import TrainingPlanningAgent


@pytest.mark.parametrize(
    "agent_class",
    [
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
