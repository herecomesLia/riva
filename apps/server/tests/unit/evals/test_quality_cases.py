import re
from pathlib import Path

import pytest

from riva.evals.registry import build_default_registry
from riva.evals.runner import load_eval_cases


CASES_DIR = Path(__file__).resolve().parents[3] / "evals" / "cases"

EXPECTED_CASE_IDS = {
    "question-generator.basic-behavioral",
    "question-generator.weakness-focus",
    "question-generator.training-memory",
    "interview-turn.complete-question",
    "interview-turn.follow-up",
    "practice-evaluator.strong-answer",
    "practice-evaluator.weak-answer",
    "practice-reviewer.review-quality",
    "practice-recommender.retry-current",
    "practice-recommender.next-question",
    "interview-planner.technical-round",
    "interview-review.completed-interview",
}

EMAIL_PATTERN = re.compile(
    r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
    re.IGNORECASE,
)
SECRET_LABEL_PATTERN = re.compile(
    r"\b(?:access[_\s-]*token|api[_\s-]*key|password|bearer[_\s-]*token)"
    r"\b\s*[\"']?\s*[:=]",
    re.IGNORECASE,
)
BEARER_VALUE_PATTERN = re.compile(
    r"\bbearer\s+[A-Z0-9._~+/=-]{16,}\b",
    re.IGNORECASE,
)


@pytest.fixture(scope="module")
def real_cases():
    return load_eval_cases(CASES_DIR)


@pytest.fixture(scope="module")
def registry():
    return build_default_registry()


def test_real_cases_directory_loads_successfully(real_cases) -> None:
    assert real_cases
    assert EXPECTED_CASE_IDS <= {case.id for case in real_cases}


def test_real_case_ids_are_globally_unique(real_cases) -> None:
    case_ids = [case.id for case in real_cases]

    assert len(case_ids) == len(set(case_ids))


def test_real_cases_match_registry_and_validate_inputs(real_cases, registry) -> None:
    for case in real_cases:
        registration = registry.get(case.agent_id)

        assert registration.agent_id == case.agent_id
        assert case.prompt_version == registration.prompt_version
        assert case.assertions
        registration.input_schema.model_validate(case.input)


def test_quality_cases_have_default_rubric_contract(real_cases) -> None:
    quality_cases = [case for case in real_cases if case.rubrics]

    assert quality_cases
    for case in quality_cases:
        rubric_ids = [rubric.id for rubric in case.rubrics]
        assert len(case.rubrics) >= 2
        assert len(rubric_ids) == len(set(rubric_ids))
        for rubric in case.rubrics:
            assert rubric.id.strip()
            assert rubric.criteria.strip()
            assert 0 <= rubric.min_score <= 4
            assert rubric.min_score == 3


def test_real_case_corpus_has_no_obvious_personal_secrets() -> None:
    case_files = sorted(CASES_DIR.rglob("*.json"))
    assert case_files

    for case_file in case_files:
        content = case_file.read_text(encoding="utf-8")
        assert EMAIL_PATTERN.search(content) is None, case_file
        assert SECRET_LABEL_PATTERN.search(content) is None, case_file
        assert BEARER_VALUE_PATTERN.search(content) is None, case_file
