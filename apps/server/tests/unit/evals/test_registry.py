import pytest

from riva.agents.evaluation import PracticeEvaluationAgent
from riva.agents.follow_up import FollowUpAgent
from riva.agents.interview_candidate_question import InterviewCandidateQuestionAgent
from riva.agents.interview_planning import InterviewPlanningAgent
from riva.agents.interview_review import InterviewReviewAgent
from riva.agents.interview_turn import InterviewTurnAgent
from riva.agents.job_description_parsing import JobDescriptionParsingAgent
from riva.agents.matching_analysis import MatchingAnalysisAgent
from riva.agents.practice_recommendation import PracticeRecommendationAgent
from riva.agents.practice_reference_answer import PracticeReferenceAnswerAgent
from riva.agents.practice_review import PracticeReviewAgent
from riva.agents.question_generation import QuestionGenerationAgent
from riva.agents.resume_parsing import ResumeParsingAgent
from riva.agents.training_planning import TrainingPlanningAgent
from riva.evals.registry import (
    AgentEvalRegistration,
    AgentEvalRegistry,
    UnknownAgentError,
    build_default_registry,
)
from riva.schemas.evaluation import EvaluationInput
from riva.schemas.follow_up import FollowUpInput
from riva.schemas.interview_candidate_question import InterviewCandidateQuestionInput
from riva.schemas.interview_planning import InterviewPlanningInput
from riva.schemas.interview_review import InterviewReviewInput
from riva.schemas.interview_turn import InterviewTurnInput
from riva.schemas.job_description_parsing import JobDescriptionParsingInput
from riva.schemas.matching_analysis import MatchingAnalysisInput
from riva.schemas.practice_recommendation import PracticeRecommendationInput
from riva.schemas.practice_reference_answer import PracticeReferenceAnswerInput
from riva.schemas.practice_review import PracticeReviewInput
from riva.schemas.question_generation import QuestionGenerationInput
from riva.schemas.resume_parsing import ResumeParsingInput
from riva.schemas.training_planning import TrainingPlanningInput


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
