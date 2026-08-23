import asyncio
import json
from uuid import uuid4

from riva.agents.interview.turn import InterviewTurnAgent
from riva.agents.interview.turn_types import InterviewTurnInput, InterviewTurnOutput
from riva.integrations import MessageRole
from tests.helpers.llm import FakeLLMProvider


def turn_input() -> InterviewTurnInput:
    role_id = uuid4()
    profile_id = uuid4()
    session_id = uuid4()
    return InterviewTurnInput.model_validate(
        {
            "session": {
                "id": session_id,
                "version": 3,
                "status": "question",
                "language": "en",
                "configuration": {
                    "targetRoleId": role_id,
                    "round": "technical",
                    "difficulty": "pressure",
                    "durationMinutes": 30,
                },
            },
            "planId": uuid4(),
            "planRevision": 1,
            "questionId": uuid4(),
            "plannedQuestion": {
                "prompt": "Describe a production trade-off you made.",
                "questionType": "projectDeepDive",
                "assessedCapabilities": ["Ownership", "Evidence"],
                "objective": "Verify the candidate's personal contribution.",
                "followUpDirections": ["Probe the decision and its result."],
                "scoringFocus": ["Specific evidence", "Trade-off quality"],
            },
            "mainAnswer": {
                "id": uuid4(),
                "content": "I chose a staged rollout and measured the error rate.",
                "submittedAt": "2026-08-16T10:00:00Z",
            },
            "answeredFollowUps": [],
            "remainingFollowUpSlots": 2,
            "careerProfile": {
                "profileId": profile_id,
                "version": 4,
                "summary": "Backend engineer with API experience.",
                "education": [],
                "workExperiences": [],
                "projectExperiences": [],
                "skills": ["Python"],
            },
            "targetRole": {
                "id": role_id,
                "title": "Backend Engineer",
                "company": "Riva",
                "recruitmentType": "experienced",
                "location": "Shanghai",
                "version": 3,
                "jobDescriptionVersion": 2,
            },
            "jobDescriptionAnalysis": {
                "jobDescriptionVersion": 2,
                "analysisVersion": 1,
                "rivaSummary": "Build reliable APIs.",
                "responsibilities": ["Design APIs"],
                "qualificationRequirements": {
                    "education": [],
                    "graduation_cohorts": [],
                    "majors": [],
                    "experience": [],
                    "languages": [],
                    "certifications": [],
                    "other": [],
                },
                "requiredSkills": {
                    "programming_languages": ["Python"],
                    "frameworks_and_libraries": [],
                    "platforms": [],
                    "tools": [],
                    "concepts_and_methods": [],
                    "databases_and_middleware": [],
                    "other": [],
                },
                "preferredQualifications": [],
                "softSkills": [],
                "businessDomains": [],
            },
            "matchingAnalysis": None,
        }
    )


def test_interview_turn_agent_uses_structured_output_and_frozen_input() -> None:
    provider = FakeLLMProvider(
        [
            {
                "assessment": {
                    "score": 82,
                    "summary": "The answer includes a concrete decision and result.",
                    "strengths": ["Concrete decision"],
                    "issues": ["The trade-off needs more detail."],
                },
                "nextAction": {
                    "type": "followUp",
                    "prompt": "What signal made you choose the staged rollout?",
                },
            }
        ]
    )
    agent = InterviewTurnAgent(provider, model="test-interview-model")
    input = turn_input()
    before = input.model_dump(mode="json")

    result = asyncio.run(agent.run(input))

    assert agent.agent_id == "interview-turn"
    assert result.prompt_id == "interview-turn"
    assert result.prompt_version == "1"
    assert isinstance(result.output, InterviewTurnOutput)
    assert result.output.next_action.type == "followUp"
    request = provider.calls[0]
    assert request.output_schema is InterviewTurnOutput
    assert request.model == "test-interview-model"
    assert [message.role for message in request.messages] == [
        MessageRole.SYSTEM,
        MessageRole.USER,
    ]

    values = agent.prompt_values(input)
    assert values["remaining_follow_up_slots"] == 2
    assert values["interview_turn_input"] == json.dumps(
        input.model_dump(mode="json", by_alias=True),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    assert input.model_dump(mode="json") == before
