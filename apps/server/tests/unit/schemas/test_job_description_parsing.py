from pydantic import ValidationError
import pytest

from riva.schemas.job_description_parsing import (
    MAX_JOB_DESCRIPTION_ANALYSIS_ITEM_LENGTH,
    MAX_JOB_DESCRIPTION_ANALYSIS_LIST_ITEMS,
    MAX_JOB_DESCRIPTION_SUMMARY_LENGTH,
    JobDescriptionParsingInput,
    JobDescriptionParsingOutput,
)
from riva.schemas.roles import MAX_RAW_JOB_DESCRIPTION_LENGTH


def empty_qualification_requirements() -> dict[str, object]:
    return {
        "education": [],
        "graduation_cohorts": [],
        "majors": [],
        "experience": [],
        "languages": [],
        "certifications": [],
        "other": [],
    }


def empty_required_skills() -> dict[str, object]:
    return {
        "programming_languages": [],
        "frameworks_and_libraries": [],
        "platforms": [],
        "tools": [],
        "concepts_and_methods": [],
        "databases_and_middleware": [],
        "other": [],
    }


def complete_output() -> dict[str, object]:
    return {
        "riva_summary": "Build reliable payment services with Python.",
        "responsibilities": ["Design APIs", "Review code"],
        "qualification_requirements": {
            "education": ["Bachelor's degree"],
            "graduation_cohorts": ["2025 graduates"],
            "majors": ["Computer Science"],
            "experience": ["3 years of backend experience"],
            "languages": ["English"],
            "certifications": ["AWS Certified Developer"],
            "other": ["Eligible to work locally"],
        },
        "required_skills": {
            "programming_languages": ["Python"],
            "frameworks_and_libraries": ["FastAPI"],
            "platforms": ["AWS"],
            "tools": ["Git"],
            "concepts_and_methods": ["Distributed systems"],
            "databases_and_middleware": ["PostgreSQL"],
            "other": ["REST API design"],
        },
        "preferred_qualifications": ["Payment experience preferred"],
        "soft_skills": ["Clear communication"],
        "business_domains": ["Payments"],
    }


def empty_output() -> dict[str, object]:
    return {
        "riva_summary": "The JD does not state detailed requirements.",
        "responsibilities": [],
        "qualification_requirements": empty_qualification_requirements(),
        "required_skills": empty_required_skills(),
        "preferred_qualifications": [],
        "soft_skills": [],
        "business_domains": [],
    }


def test_complete_structured_output_is_valid() -> None:
    output = JobDescriptionParsingOutput.model_validate(complete_output())

    assert output.required_skills.programming_languages == ["Python"]
    assert output.qualification_requirements.education == ["Bachelor's degree"]


def test_all_categories_allow_empty_lists() -> None:
    output = JobDescriptionParsingOutput.model_validate(empty_output())

    assert output.responsibilities == []
    assert output.qualification_requirements.education == []
    assert output.required_skills.programming_languages == []


def test_text_is_trimmed_and_list_items_are_cleaned_and_stably_deduplicated() -> None:
    payload = empty_output()
    payload["riva_summary"] = "  Concise summary.  "
    payload["responsibilities"] = [
        "  Design APIs  ",
        "",
        "   ",
        "Review code",
        "Design APIs",
        "Review code  ",
    ]

    output = JobDescriptionParsingOutput.model_validate(payload)

    assert output.riva_summary == "Concise summary."
    assert output.responsibilities == ["Design APIs", "Review code"]


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload.update({"unexpected": []}),
        lambda payload: payload["qualification_requirements"].update(
            {"unexpected": []}
        ),
        lambda payload: payload["required_skills"].update({"unexpected": []}),
    ],
)
def test_output_models_reject_unknown_fields(mutate) -> None:
    payload = empty_output()
    mutate(payload)

    with pytest.raises(ValidationError):
        JobDescriptionParsingOutput.model_validate(payload)


@pytest.mark.parametrize(
    "summary",
    ["", "   ", "x" * (MAX_JOB_DESCRIPTION_SUMMARY_LENGTH + 1)],
)
def test_summary_rejects_empty_and_oversized_values(summary: str) -> None:
    payload = empty_output()
    payload["riva_summary"] = summary

    with pytest.raises(ValidationError):
        JobDescriptionParsingOutput.model_validate(payload)


@pytest.mark.parametrize(
    "responsibilities",
    [
        ["x" * (MAX_JOB_DESCRIPTION_ANALYSIS_ITEM_LENGTH + 1)],
        [str(index) for index in range(MAX_JOB_DESCRIPTION_ANALYSIS_LIST_ITEMS + 1)],
    ],
)
def test_list_item_length_and_count_are_bounded(
    responsibilities: list[str],
) -> None:
    payload = empty_output()
    payload["responsibilities"] = responsibilities

    with pytest.raises(ValidationError):
        JobDescriptionParsingOutput.model_validate(payload)


def test_input_normalizes_text_and_allows_missing_company() -> None:
    input = JobDescriptionParsingInput.model_validate(
        {
            "role_title": "  Backend Engineer  ",
            "company": "   ",
            "raw_job_description": "  Build APIs.  ",
        }
    )

    assert input.role_title == "Backend Engineer"
    assert input.company is None
    assert input.raw_job_description == "Build APIs."


@pytest.mark.parametrize(
    "raw_job_description",
    ["", "   ", "x" * (MAX_RAW_JOB_DESCRIPTION_LENGTH + 1)],
)
def test_input_rejects_empty_or_oversized_job_description(
    raw_job_description: str,
) -> None:
    with pytest.raises(ValidationError):
        JobDescriptionParsingInput(
            role_title="Backend Engineer",
            company=None,
            raw_job_description=raw_job_description,
        )


def test_input_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        JobDescriptionParsingInput.model_validate(
            {
                "role_title": "Backend Engineer",
                "company": None,
                "raw_job_description": "Build APIs.",
                "role_id": "not-runtime-input",
            }
        )
