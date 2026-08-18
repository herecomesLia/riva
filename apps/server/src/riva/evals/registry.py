from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from riva.agents.base import Agent
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
from riva.integrations import LLMProvider
from riva.prompts import (
    FOLLOW_UP_PROMPT,
    INTERVIEW_PLANNING_PROMPT,
    INTERVIEW_REVIEW_PROMPT,
    INTERVIEW_TURN_PROMPT,
    INTERVIEW_CANDIDATE_QUESTION_PROMPT,
    JOB_DESCRIPTION_PARSING_PROMPT,
    MATCHING_ANALYSIS_PROMPT,
    PRACTICE_EVALUATION_PROMPT,
    PRACTICE_RECOMMENDATION_PROMPT,
    PRACTICE_REFERENCE_ANSWER_PROMPT,
    PRACTICE_REVIEW_PROMPT,
    QUESTION_GENERATION_PROMPT,
    RESUME_PARSING_PROMPT,
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


AgentFactory = Callable[[LLMProvider, str], Agent[Any, Any]]


class UnknownAgentError(ValueError):
    """Raised when an eval references an agent absent from the registry."""


@dataclass(frozen=True, slots=True)
class AgentEvalRegistration:
    agent_id: str
    # Pydantic input schemas may be BaseModel classes or discriminated typing
    # schemas such as an Annotated union.
    input_schema: Any
    agent_factory: AgentFactory
    prompt_id: str
    prompt_version: str

    def __post_init__(self) -> None:
        for field_name in (
            "agent_id",
            "prompt_id",
            "prompt_version",
        ):
            value = getattr(self, field_name)
            if not value.strip():
                raise ValueError(f"{field_name} must not be empty")

    @property
    def agent(self) -> AgentFactory:
        """The registered Agent constructor exposed for registry inspection."""

        return self.agent_factory


class AgentEvalRegistry:
    """Explicit, in-memory registry of agents that can run offline evals."""

    def __init__(
        self,
        registrations: Iterable[AgentEvalRegistration] | None = None,
    ) -> None:
        self._registrations: dict[str, AgentEvalRegistration] = {}
        for registration in (
            _canonical_registrations() if registrations is None else registrations
        ):
            self.register(registration)

    def register(self, registration: AgentEvalRegistration) -> None:
        if registration.agent_id in self._registrations:
            raise ValueError(
                f"Agent eval registration already exists: {registration.agent_id}"
            )
        self._registrations[registration.agent_id] = registration

    def get(self, agent_id: str) -> AgentEvalRegistration:
        try:
            return self._registrations[agent_id]
        except KeyError:
            raise UnknownAgentError(
                f"Unknown eval agent: {agent_id}"
            ) from None

    def __contains__(self, agent_id: str) -> bool:
        return agent_id in self._registrations

    @property
    def agent_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self._registrations))


def build_default_registry() -> AgentEvalRegistry:
    """Build the canonical registry without touching application state."""

    return AgentEvalRegistry(_canonical_registrations())


def _canonical_registrations() -> tuple[AgentEvalRegistration, ...]:
    return (
        AgentEvalRegistration(
            agent_id="question-generator",
            input_schema=QuestionGenerationInput,
            agent_factory=QuestionGenerationAgent,
            prompt_id=QUESTION_GENERATION_PROMPT.prompt_id,
            prompt_version=QUESTION_GENERATION_PROMPT.version,
        ),
        AgentEvalRegistration(
            agent_id="resume-parser",
            input_schema=ResumeParsingInput,
            agent_factory=ResumeParsingAgent,
            prompt_id=RESUME_PARSING_PROMPT.prompt_id,
            prompt_version=RESUME_PARSING_PROMPT.version,
        ),
        AgentEvalRegistration(
            agent_id="job-description-parser",
            input_schema=JobDescriptionParsingInput,
            agent_factory=JobDescriptionParsingAgent,
            prompt_id=JOB_DESCRIPTION_PARSING_PROMPT.prompt_id,
            prompt_version=JOB_DESCRIPTION_PARSING_PROMPT.version,
        ),
        AgentEvalRegistration(
            agent_id="matching-analyzer",
            input_schema=MatchingAnalysisInput,
            agent_factory=MatchingAnalysisAgent,
            prompt_id=MATCHING_ANALYSIS_PROMPT.prompt_id,
            prompt_version=MATCHING_ANALYSIS_PROMPT.version,
        ),
        AgentEvalRegistration(
            agent_id="follow-up-generator",
            input_schema=FollowUpInput,
            agent_factory=FollowUpAgent,
            prompt_id=FOLLOW_UP_PROMPT.prompt_id,
            prompt_version=FOLLOW_UP_PROMPT.version,
        ),
        AgentEvalRegistration(
            agent_id="practice-reference-answer-generator",
            input_schema=PracticeReferenceAnswerInput,
            agent_factory=PracticeReferenceAnswerAgent,
            prompt_id=PRACTICE_REFERENCE_ANSWER_PROMPT.prompt_id,
            prompt_version=PRACTICE_REFERENCE_ANSWER_PROMPT.version,
        ),
        AgentEvalRegistration(
            agent_id="interview-candidate-question",
            input_schema=InterviewCandidateQuestionInput,
            agent_factory=InterviewCandidateQuestionAgent,
            prompt_id=INTERVIEW_CANDIDATE_QUESTION_PROMPT.prompt_id,
            prompt_version=INTERVIEW_CANDIDATE_QUESTION_PROMPT.version,
        ),
        AgentEvalRegistration(
            agent_id="interview-turn",
            input_schema=InterviewTurnInput,
            agent_factory=InterviewTurnAgent,
            prompt_id=INTERVIEW_TURN_PROMPT.prompt_id,
            prompt_version=INTERVIEW_TURN_PROMPT.version,
        ),
        AgentEvalRegistration(
            agent_id="practice-evaluator",
            input_schema=EvaluationInput,
            agent_factory=PracticeEvaluationAgent,
            prompt_id=PRACTICE_EVALUATION_PROMPT.prompt_id,
            prompt_version=PRACTICE_EVALUATION_PROMPT.version,
        ),
        AgentEvalRegistration(
            agent_id="practice-reviewer",
            input_schema=PracticeReviewInput,
            agent_factory=PracticeReviewAgent,
            prompt_id=PRACTICE_REVIEW_PROMPT.prompt_id,
            prompt_version=PRACTICE_REVIEW_PROMPT.version,
        ),
        AgentEvalRegistration(
            agent_id="practice-recommender",
            input_schema=PracticeRecommendationInput,
            agent_factory=PracticeRecommendationAgent,
            prompt_id=PRACTICE_RECOMMENDATION_PROMPT.prompt_id,
            prompt_version=PRACTICE_RECOMMENDATION_PROMPT.version,
        ),
        AgentEvalRegistration(
            agent_id="interview-planner",
            input_schema=InterviewPlanningInput,
            agent_factory=InterviewPlanningAgent,
            prompt_id=INTERVIEW_PLANNING_PROMPT.prompt_id,
            prompt_version=INTERVIEW_PLANNING_PROMPT.version,
        ),
        AgentEvalRegistration(
            agent_id="interview-review",
            input_schema=InterviewReviewInput,
            agent_factory=InterviewReviewAgent,
            prompt_id=INTERVIEW_REVIEW_PROMPT.prompt_id,
            prompt_version=INTERVIEW_REVIEW_PROMPT.version,
        ),
    )


DEFAULT_AGENT_EVAL_REGISTRY = build_default_registry()


__all__ = [
    "AgentEvalRegistration",
    "AgentEvalRegistry",
    "DEFAULT_AGENT_EVAL_REGISTRY",
    "UnknownAgentError",
    "build_default_registry",
]
