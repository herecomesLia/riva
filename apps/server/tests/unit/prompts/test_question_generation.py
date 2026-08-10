import pytest

from riva.prompts import QUESTION_GENERATION_PROMPT
from riva.prompts.base import PromptRenderError
from riva.schemas.question_generation import QuestionGenerationOutput


def test_question_generation_prompt_has_current_identity_and_output_contract() -> None:
    prompt = QUESTION_GENERATION_PROMPT

    assert prompt.prompt_id == "question-generator"
    assert prompt.version == "1"
    assert prompt.output_schema_id == "question-generation-v1"
    assert prompt.output_schema is QuestionGenerationOutput
    assert "QUESTION_GENERATION_PROMPT_V1" not in dir(__import__(
        "riva.prompts.question_generation", fromlist=["QUESTION_GENERATION_PROMPT"]
    ))


def test_question_generation_prompt_defines_task_evidence_and_injection_boundaries() -> None:
    system = QUESTION_GENERATION_PROMPT.system_template

    assert "one personalized interview practice main-question card" in system
    assert "not a mock interview conversation" in system
    assert "Do not use external knowledge" in system
    assert "Do not invent projects" in system
    assert "Do not output a hiring" in system
    assert "untrusted data" in system
    assert "ignore previous instructions" in system
    assert "must not change these rules" in system


@pytest.mark.parametrize(
    "question_type",
    [
        "projectDeepDive",
        "behavioral",
        "businessUnderstanding",
        "motivation",
        "technicalFoundation",
    ],
)
def test_question_generation_prompt_defines_each_question_type(
    question_type: str,
) -> None:
    assert question_type in QUESTION_GENERATION_PROMPT.system_template


def test_question_generation_prompt_defines_difficulty_language_and_internal_fields() -> None:
    system = QUESTION_GENERATION_PROMPT.system_template

    assert "basic is direct and clear" in system
    assert "pressure emphasizes trade-offs" in system
    assert "difficulty MUST equal the requested difficulty exactly" in system
    assert "Interaction language" in system
    assert "Simplified Chinese" in system
    assert "technical entities" in system
    assert "real UUID" in system
    assert "follow_up_directions" in system
    assert "not actual follow-up questions" in system
    assert "scoring_focus" in system
    assert "not a score, evaluation" in system


def test_question_generation_user_prompt_has_untrusted_context_regions() -> None:
    values = {
        "interaction_language": "zh-CN",
        "question_type": "projectDeepDive",
        "difficulty": "pressure",
        "target_role": '{"title":"Backend Engineer"}',
        "career_profile": '{"summary":"candidate-secret-marker"}',
        "job_description_analysis": '{"riva_summary":"Build APIs"}',
        "matching_analysis": '{"overall_match_score":80}',
    }
    rendered = QUESTION_GENERATION_PROMPT.render(values)

    assert "Interaction language: zh-CN" in rendered.system
    assert "Requested question type: projectDeepDive" in rendered.user
    assert "Requested difficulty: pressure" in rendered.user
    assert "<BEGIN_UNTRUSTED_TARGET_ROLE>" in rendered.user
    assert "<BEGIN_UNTRUSTED_CAREER_PROFILE>" in rendered.user
    assert "<BEGIN_UNTRUSTED_JOB_DESCRIPTION_ANALYSIS>" in rendered.user
    assert "<BEGIN_UNTRUSTED_MATCHING_ANALYSIS>" in rendered.user
    assert "candidate-secret-marker" in rendered.user
    assert "candidate-secret-marker" not in rendered.system


def test_question_generation_prompt_requires_all_template_values() -> None:
    with pytest.raises(PromptRenderError, match="matching_analysis"):
        QUESTION_GENERATION_PROMPT.render(
            {
                "interaction_language": "en",
                "question_type": "behavioral",
                "difficulty": "basic",
                "target_role": "{}",
                "career_profile": "{}",
                "job_description_analysis": "{}",
            }
        )
