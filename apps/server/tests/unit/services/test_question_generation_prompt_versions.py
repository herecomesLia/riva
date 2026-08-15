import pytest

from riva.prompts import QUESTION_GENERATION_PROMPT
from riva.services.question_generation_prompt_versions import (
    QUESTION_GENERATION_LEGACY_PROMPT,
    get_question_generation_prompt,
)


def test_question_generation_prompt_resolver_returns_exact_v1_and_v2() -> None:
    legacy = get_question_generation_prompt("1")
    current = get_question_generation_prompt("2")

    assert legacy is QUESTION_GENERATION_LEGACY_PROMPT
    assert legacy.prompt_id == "question-generator"
    assert legacy.version == "1"
    assert legacy.output_schema_id == "question-generation-v1"
    assert current is QUESTION_GENERATION_PROMPT
    assert current.version == "2"


def test_question_generation_prompt_resolver_rejects_unsupported_version() -> None:
    with pytest.raises(
        ValueError,
        match="Unsupported question-generation prompt version",
    ):
        get_question_generation_prompt("999")
