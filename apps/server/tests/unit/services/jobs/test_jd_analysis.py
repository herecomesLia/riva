from copy import deepcopy

import pytest

from riva.agents.jobs.jd_parser_types import (
    MAX_JOB_DESCRIPTION_SUMMARY_LENGTH,
)
from riva.services.jobs.jd_analysis import (
    RIVA_SUMMARY_FALLBACK,
    build_riva_summary,
)


def empty_modules() -> dict[str, object]:
    return {
        "responsibilities": [],
        "qualification_requirements": {
            "education": [],
            "graduation_cohorts": [],
            "majors": [],
            "experience": [],
            "languages": [],
            "certifications": [],
            "other": [],
        },
        "required_skills": {
            "programming_languages": [],
            "frameworks_and_libraries": [],
            "platforms": [],
            "tools": [],
            "concepts_and_methods": [],
            "databases_and_middleware": [],
            "other": [],
        },
        "preferred_qualifications": [],
        "soft_skills": [],
        "business_domains": [],
    }


def make_summary(modules: dict[str, object]) -> str:
    return build_riva_summary(**modules)  # type: ignore[arg-type]


def test_summary_combines_all_structured_modules() -> None:
    modules = empty_modules()
    modules["responsibilities"] = ["Design APIs."]
    modules["qualification_requirements"]["education"] = ["Bachelor degree"]  # type: ignore[index]
    modules["required_skills"]["programming_languages"] = ["Python"]  # type: ignore[index]
    modules["preferred_qualifications"] = ["Payments experience"]
    modules["soft_skills"] = ["Communication"]
    modules["business_domains"] = ["Payments"]

    summary = make_summary(modules)

    for value in (
        "Design APIs",
        "Python",
        "Bachelor degree",
        "Payments experience",
        "Communication",
        "Payments",
    ):
        assert value in summary


@pytest.mark.parametrize(
    "field,value,expected",
    [
        ("responsibilities", ["Own reliability"], "Own reliability"),
        (
            "required_skills",
            {"frameworks_and_libraries": ["FastAPI"]},
            "FastAPI",
        ),
        (
            "qualification_requirements",
            {"experience": ["Three years"]},
            "Three years",
        ),
        ("preferred_qualifications", ["Open source"], "Open source"),
        ("soft_skills", ["Empathy"], "Empathy"),
        ("business_domains", ["FinTech"], "FinTech"),
    ],
)
def test_summary_supports_each_module_independently(
    field: str,
    value: object,
    expected: str,
) -> None:
    modules = empty_modules()
    if field in {"required_skills", "qualification_requirements"}:
        modules[field].update(value)  # type: ignore[union-attr]
    else:
        modules[field] = value

    assert expected in make_summary(modules)


def test_summary_has_safe_fallback_when_all_modules_are_empty() -> None:
    assert make_summary(empty_modules()) == RIVA_SUMMARY_FALLBACK
    assert RIVA_SUMMARY_FALLBACK


def test_summary_is_bounded_deterministic_and_does_not_mutate_inputs() -> None:
    modules = empty_modules()
    modules["responsibilities"] = ["R" * 1_000]
    modules["required_skills"]["programming_languages"] = [  # type: ignore[index]
        "Python" * 200,
        "FastAPI" * 200,
        "Distributed systems" * 200,
    ]
    before = deepcopy(modules)

    first = make_summary(modules)
    second = make_summary(modules)

    assert first == second
    assert first
    assert len(first) <= MAX_JOB_DESCRIPTION_SUMMARY_LENGTH
    assert modules == before
    assert first.startswith("R")
