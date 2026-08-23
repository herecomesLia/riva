import pytest

from riva.agents.interview.candidate_question import InterviewCandidateQuestionAgent
from riva.agents.interview.candidate_types import (
    InterviewCandidateQuestionInput,
)
from riva.agents.interview.planning import InterviewPlanningAgent
from riva.agents.interview.planning_types import InterviewPlanningInput
from riva.agents.interview.review import InterviewReviewAgent
from riva.agents.interview.review_types import InterviewReviewInput
from riva.agents.interview.turn import InterviewTurnAgent
from riva.agents.interview.turn_types import InterviewTurnInput
from riva.agents.jobs.jd_parser import JobDescriptionParsingAgent
from riva.agents.jobs.jd_parser_types import JobDescriptionParsingInput
from riva.agents.jobs.matcher import MatchingAnalysisAgent
from riva.agents.jobs.matcher_types import MatchingAnalysisInput
from riva.agents.practice.evaluation import PracticeEvaluationAgent
from riva.agents.practice.evaluation_types import EvaluationInput
from riva.agents.practice.follow_up import FollowUpAgent
from riva.agents.practice.follow_up_types import FollowUpInput
from riva.agents.practice.question import QuestionGenerationAgent
from riva.agents.practice.question_types import QuestionGenerationInput
from riva.agents.practice.recommendation import PracticeRecommendationAgent
from riva.agents.practice.recommendation_types import PracticeRecommendationInput
from riva.agents.practice.reference_answer import PracticeReferenceAnswerAgent
from riva.agents.practice.reference_types import PracticeReferenceAnswerInput
from riva.agents.practice.review import PracticeReviewAgent
from riva.agents.practice.review_types import PracticeReviewInput
from riva.agents.resumes.parser import ResumeParsingAgent
from riva.agents.resumes.types import ResumeParsingInput
from riva.agents.training.planning import TrainingPlanningAgent
from riva.agents.training.planning_types import TrainingPlanningInput
from riva.evals.registry import (
    AgentEvalRegistration,
    AgentEvalRegistry,
    UnknownAgentError,
    build_default_registry,
)


def test_default_registry_contains_all_canonical_agents() -> None:
    registry = build_default_registry()

    expected = {
        "question-generator": (
            QuestionGenerationInput,
            QuestionGenerationAgent,
            QuestionGenerationAgent,
        ),
        "resume-parser": (
            ResumeParsingInput,
            ResumeParsingAgent,
            ResumeParsingAgent,
        ),
        "job-description-parser": (
            JobDescriptionParsingInput,
            JobDescriptionParsingAgent,
            JobDescriptionParsingAgent,
        ),
        "matching-analyzer": (
            MatchingAnalysisInput,
            MatchingAnalysisAgent,
            MatchingAnalysisAgent,
        ),
        "follow-up-generator": (FollowUpInput, FollowUpAgent, FollowUpAgent),
        "practice-reference-answer-generator": (
            PracticeReferenceAnswerInput,
            PracticeReferenceAnswerAgent,
            PracticeReferenceAnswerAgent,
        ),
        "interview-candidate-question": (
            InterviewCandidateQuestionInput,
            InterviewCandidateQuestionAgent,
            InterviewCandidateQuestionAgent,
        ),
        "interview-turn": (
            InterviewTurnInput,
            InterviewTurnAgent,
            InterviewTurnAgent,
        ),
        "practice-evaluator": (
            EvaluationInput,
            PracticeEvaluationAgent,
            PracticeEvaluationAgent,
        ),
        "practice-reviewer": (
            PracticeReviewInput,
            PracticeReviewAgent,
            PracticeReviewAgent,
        ),
        "practice-recommender": (
            PracticeRecommendationInput,
            PracticeRecommendationAgent,
            PracticeRecommendationAgent,
        ),
        "interview-planner": (
            InterviewPlanningInput,
            InterviewPlanningAgent,
            InterviewPlanningAgent,
        ),
        "interview-review": (
            InterviewReviewInput,
            InterviewReviewAgent,
            InterviewReviewAgent,
        ),
        "training-planner": (
            TrainingPlanningInput,
            TrainingPlanningAgent,
            TrainingPlanningAgent,
        ),
    }

    assert registry.agent_ids == tuple(sorted(expected))
    for agent_id, (input_schema, agent_factory, prompt) in expected.items():
        registration = registry.get(agent_id)
        assert registration.agent_id == agent_id
        assert registration.input_schema is input_schema
        assert registration.agent_factory is agent_factory
        assert registration.prompt_id == prompt.agent_id
        assert registration.prompt_version == prompt.agent_version


def test_registry_rejects_duplicate_and_unknown_agents() -> None:
    registration = AgentEvalRegistration(
        agent_id="custom",
        input_schema=QuestionGenerationInput,
        agent_factory=lambda _provider, _model: None,  # type: ignore[return-value]
        prompt_id="custom",
        prompt_version="1",
    )
    registry = AgentEvalRegistry([registration])

    with pytest.raises(ValueError, match="already exists"):
        registry.register(registration)
    with pytest.raises(UnknownAgentError, match="Unknown eval agent"):
        registry.get("missing")
