import asyncio
import json
from uuid import uuid4

from riva.agents import InterviewPlanningAgent
from riva.integrations import MessageRole
from riva.prompts import INTERVIEW_PLANNING_PROMPT
from riva.services.interview_planning_prompt_versions import (
    get_interview_planning_prompt,
)
from riva.schemas.interview_planning import InterviewPlanningInput, InterviewPlanningOutput
from tests.helpers.llm import FakeLLMProvider


def planning_input() -> InterviewPlanningInput:
    role_id = uuid4()
    profile_id = uuid4()
    session_id = uuid4()
    return InterviewPlanningInput.model_validate(
        {
            "session": {
                "id": session_id,
                "version": 1,
                "status": "opening",
                "language": "en",
                "configuration": {
                    "targetRoleId": role_id,
                    "round": "technical",
                    "difficulty": "pressure",
                    "durationMinutes": 30,
                },
            },
            "configuration": {
                "targetRoleId": role_id,
                "round": "technical",
                "difficulty": "pressure",
                "durationMinutes": 30,
            },
            "interactionLanguage": "en",
            "careerProfile": {
                "profileId": profile_id,
                "version": 4,
                "summary": "Backend engineer.",
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


def planning_output() -> dict[str, object]:
    return {
        "totalMainQuestions": 3,
        "questions": [
            {
                "order": order,
                "questionType": "projectDeepDive",
                "prompt": f"Describe project decision {order}.",
                "assessedCapabilities": ["Ownership"],
                "objective": "Verify real contribution.",
                "followUpDirections": ["Probe contribution evidence."],
                "scoringFocus": ["Evidence"],
            }
            for order in range(1, 4)
        ],
    }


def test_interview_planner_uses_structured_output_and_stable_snapshot_json() -> None:
    provider = FakeLLMProvider([planning_output()])
    agent = InterviewPlanningAgent(provider, model="test-interview-model")
    input = planning_input()
    before = input.model_dump(mode="json")

    result = asyncio.run(agent.run(input))

    assert agent.agent_id == "interview-planner"
    assert result.prompt_id == "interview-planner"
    assert result.prompt_version == "2"
    assert isinstance(result.output, InterviewPlanningOutput)
    assert result.output.total_main_questions == 3
    request = provider.calls[0]
    assert request.output_schema is InterviewPlanningOutput
    assert request.model == "test-interview-model"
    assert [message.role for message in request.messages] == [
        MessageRole.SYSTEM,
        MessageRole.USER,
    ]

    values = agent.prompt_values(input)
    assert values["matching_analysis"] == "null"
    assert "focusCompetencies" in values["training_memory"]
    assert values["career_profile"] == json.dumps(
        input.career_profile.model_dump(mode="json", by_alias=True),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    assert input.model_dump(mode="json") == before


def test_interview_planner_v1_does_not_render_training_memory() -> None:
    provider = FakeLLMProvider([planning_output()])
    agent = InterviewPlanningAgent(
        provider,
        model="test-interview-model",
        prompt=get_interview_planning_prompt("1"),
    )

    result = asyncio.run(agent.run(planning_input()))

    assert result.agent_id == "interview-planner"
    assert result.prompt_id == "interview-planner"
    assert result.prompt_version == "1"
    assert "TRAINING_MEMORY" not in provider.calls[0].messages[0].content
    assert "TRAINING_MEMORY" not in provider.calls[0].messages[1].content
