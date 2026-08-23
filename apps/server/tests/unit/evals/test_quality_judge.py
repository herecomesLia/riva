import asyncio

import pytest
from pydantic import ValidationError

from riva.evals.models import AgentEvalRubric
from riva.evals.quality_judge import (
    AgentEvalQualityJudge,
    QualityJudgeInput,
    QualityJudgeRubricMismatchError,
)
from riva.evals.quality_judge_types import QualityJudgeOutput
from riva.integrations import LLMUsage
from tests.helpers.llm import FakeLLMProvider


def _input() -> QualityJudgeInput:
    return QualityJudgeInput.model_validate(
        {
            "caseId": "case-1",
            "targetAgentId": "question-generator",
            "targetPromptVersion": "2",
            "input": {"synthetic": True},
            "output": {"question_type": "behavioral"},
            "rubrics": [
                {"id": "relevance", "criteria": "Fits the role."},
                {"id": "grounding", "criteria": "Uses supplied evidence."},
            ],
        }
    )


def test_quality_judge_uses_canonical_prompt_and_zero_temperature() -> None:
    provider = FakeLLMProvider(
        [
            {
                "scores": [
                    {
                        "rubricId": "relevance",
                        "score": 3,
                        "evidence": "The question addresses the supplied role.",
                    },
                    {
                        "rubricId": "grounding",
                        "score": 4,
                        "evidence": "The output uses only supplied context.",
                    },
                ]
            }
        ],
        usage=LLMUsage(input_tokens=9, output_tokens=5),
    )
    judge = AgentEvalQualityJudge(provider, "judge-model")

    result = asyncio.run(judge.run(_input()))

    assert isinstance(result.output, QualityJudgeOutput)
    assert result.agent_id == "eval-quality-judge"
    assert result.prompt_id == "eval-quality-judge"
    assert result.prompt_version == "1"
    assert result.usage.input_tokens == 9
    assert provider.calls[0].model == "judge-model"
    assert provider.calls[0].parameters is not None
    assert provider.calls[0].parameters.temperature == 0
    assert "case-1" in str(judge.prompt_values(_input())["case_id"])


@pytest.mark.parametrize(
    "scores",
    [
        [
            {
                "rubricId": "relevance",
                "score": 3,
                "evidence": "Only one rubric returned.",
            }
        ],
        [
            {
                "rubricId": "relevance",
                "score": 3,
                "evidence": "Duplicate one.",
            },
            {
                "rubricId": "relevance",
                "score": 4,
                "evidence": "Duplicate two.",
            },
        ],
        [
            {
                "rubricId": "relevance",
                "score": 3,
                "evidence": "Known rubric.",
            },
            {
                "rubricId": "grounding",
                "score": 3,
                "evidence": "Known rubric.",
            },
            {
                "rubricId": "extra",
                "score": 3,
                "evidence": "Unexpected rubric.",
            },
        ],
    ],
)
def test_quality_judge_rejects_missing_duplicate_or_extra_rubric_ids(scores) -> None:
    judge = AgentEvalQualityJudge(
        FakeLLMProvider([{"scores": scores}]),
        "judge-model",
    )

    with pytest.raises(QualityJudgeRubricMismatchError):
        asyncio.run(judge.run(_input()))


def test_quality_judge_output_schema_forbids_extra_and_bad_score() -> None:
    with pytest.raises(ValidationError):
        QualityJudgeOutput.model_validate(
            {
                "scores": [
                    {
                        "rubricId": "relevance",
                        "score": 5,
                        "evidence": "bad",
                        "reasoning": "not allowed",
                    }
                ]
            }
        )
