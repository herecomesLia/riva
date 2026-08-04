from copy import deepcopy
from uuid import uuid4

from pydantic import ValidationError
import pytest

from riva.schemas.matching_analysis import (
    MAX_MATCHING_EDUCATION_ITEMS,
    MAX_MATCHING_EXPERIENCE_ACHIEVEMENTS,
    MAX_MATCHING_EXPERIENCE_RESPONSIBILITIES,
    MAX_MATCHING_EXPERIENCE_SKILLS,
    MAX_MATCHING_PROFILE_SKILLS,
    MAX_MATCHING_PROJECT_EXPERIENCE_ITEMS,
    MAX_MATCHING_WORK_EXPERIENCE_ITEMS,
    MatchingAnalysisInput,
    MatchingAnalysisOutput,
    MatchingAnalysisRunPayload,
)


def job_description_analysis() -> dict[str, object]:
    return {
        "riva_summary": "Build reliable payment services with Python.",
        "responsibilities": ["Design APIs"],
        "qualification_requirements": {
            "education": ["Bachelor's degree"],
            "graduation_cohorts": [],
            "majors": ["Computer Science"],
            "experience": ["Three years of backend experience"],
            "languages": [],
            "certifications": [],
            "other": [],
        },
        "required_skills": {
            "programming_languages": ["Python"],
            "frameworks_and_libraries": ["FastAPI"],
            "platforms": [],
            "tools": ["Git"],
            "concepts_and_methods": ["Distributed systems"],
            "databases_and_middleware": ["PostgreSQL"],
            "other": [],
        },
        "preferred_qualifications": [],
        "soft_skills": ["Clear communication"],
        "business_domains": ["Payments"],
    }


def valid_input() -> dict[str, object]:
    return {
        "career_profile": {
            "summary": "  Backend engineer focused on reliable APIs.  ",
            "education": [
                {
                    "school": " Tongji University ",
                    "degree": "Bachelor's degree",
                    "major": "Software Engineering",
                    "start_date": "2018-09",
                    "end_date": "2022-06",
                    "is_current": False,
                }
            ],
            "work_experiences": [
                {
                    "company": "Riva",
                    "title": "Backend Engineer",
                    "employment_type": "fullTime",
                    "location": " Shanghai ",
                    "start_date": "2022-07",
                    "end_date": None,
                    "is_current": True,
                    "responsibilities": [" Build APIs ", "", "Build APIs"],
                    "achievements": ["Improved reliability"],
                    "skills": [" Python "],
                }
            ],
            "project_experiences": [
                {
                    "name": "Profile API",
                    "role": "",
                    "start_date": "2023-01",
                    "end_date": None,
                    "responsibilities": ["Designed the API"],
                    "achievements": [],
                    "skills": ["FastAPI"],
                }
            ],
            "skills": ["Python", "FastAPI"],
        },
        "job": {
            "role_title": " Backend Engineer ",
            "company": " Example ",
            "job_description_analysis": job_description_analysis(),
        },
    }


def valid_output() -> dict[str, object]:
    return {
        "overall_match_score": 78,
        "core_requirements_summary": "  Build reliable payment APIs with Python.  ",
        "matched_capabilities": ["Python", "FastAPI"],
        "missing_capabilities": ["Kubernetes"],
        "underrepresented_capabilities": ["System design"],
        "resume_highlights": ["Improved API reliability"],
        "resume_gaps": ["Quantified scale is not stated"],
        "high_risk_questions": ["How did you improve reliability?"],
        "preparation_recommendations": ["Prepare the reliability example."],
    }


def test_complete_matching_output_is_valid() -> None:
    output = MatchingAnalysisOutput.model_validate(valid_output())

    assert output.overall_match_score == 78
    assert output.core_requirements_summary == (
        "Build reliable payment APIs with Python."
    )


@pytest.mark.parametrize("score", [0, 100])
def test_matching_score_accepts_inclusive_boundaries(score: int) -> None:
    payload = valid_output()
    payload["overall_match_score"] = score

    assert MatchingAnalysisOutput.model_validate(payload).overall_match_score == score


@pytest.mark.parametrize("score", [-1, 101, 78.0, "78", True])
def test_matching_score_rejects_out_of_range_or_non_integer_values(
    score: object,
) -> None:
    payload = valid_output()
    payload["overall_match_score"] = score

    with pytest.raises(ValidationError):
        MatchingAnalysisOutput.model_validate(payload)


def test_matching_output_trims_summary_and_normalizes_all_result_lists() -> None:
    payload = valid_output()
    list_fields = (
        "matched_capabilities",
        "missing_capabilities",
        "underrepresented_capabilities",
        "resume_highlights",
        "resume_gaps",
        "high_risk_questions",
        "preparation_recommendations",
    )
    for field in list_fields:
        payload[field] = ["  first  ", "", "   ", "second", "first", " second "]

    output = MatchingAnalysisOutput.model_validate(payload)

    assert output.core_requirements_summary == (
        "Build reliable payment APIs with Python."
    )
    for field in list_fields:
        assert getattr(output, field) == ["first", "second"]


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload.update({"confidence": 0.9}),
        lambda payload: payload.update({"reasoning": "private reasoning"}),
        lambda payload: payload.update({"hiringDecision": "hire"}),
        lambda payload: payload.update({"unexpected": "value"}),
        lambda payload: payload.pop("resume_gaps"),
    ],
)
def test_matching_output_rejects_unknown_or_missing_contract_fields(mutate) -> None:
    payload = valid_output()
    mutate(payload)

    with pytest.raises(ValidationError):
        MatchingAnalysisOutput.model_validate(payload)


def test_matching_output_reuses_summary_and_item_limits() -> None:
    payload = valid_output()
    payload["core_requirements_summary"] = "x" * 2_001
    with pytest.raises(ValidationError):
        MatchingAnalysisOutput.model_validate(payload)

    payload = valid_output()
    payload["matched_capabilities"] = ["x" * 1_001]
    with pytest.raises(ValidationError):
        MatchingAnalysisOutput.model_validate(payload)

    payload = valid_output()
    payload["matched_capabilities"] = [str(index) for index in range(101)]
    with pytest.raises(ValidationError):
        MatchingAnalysisOutput.model_validate(payload)


def test_complete_matching_input_uses_names_and_normalizes_profile_text() -> None:
    parsed = MatchingAnalysisInput.model_validate(valid_input())

    assert parsed.career_profile.summary == (
        "Backend engineer focused on reliable APIs."
    )
    assert parsed.career_profile.education[0].school == "Tongji University"
    assert parsed.career_profile.work_experiences[0].location == "Shanghai"
    assert parsed.career_profile.work_experiences[0].responsibilities == [
        "Build APIs"
    ]
    assert parsed.career_profile.work_experiences[0].skills == ["Python"]
    assert parsed.career_profile.project_experiences[0].role is None
    assert parsed.career_profile.project_experiences[0].skills == ["FastAPI"]
    assert parsed.job.role_title == "Backend Engineer"
    assert parsed.job.company == "Example"
    assert parsed.job.job_description_analysis.riva_summary == (
        "Build reliable payment services with Python."
    )


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload.update({"profile_id": str(uuid4())}),
        lambda payload: payload["career_profile"].update(
            {"source": "userEdited"}
        ),
        lambda payload: payload["career_profile"]["education"][0].update(
            {"id": str(uuid4())}
        ),
        lambda payload: payload["career_profile"]["work_experiences"][0].update(
            {"source": "userEdited"}
        ),
        lambda payload: payload["career_profile"]["project_experiences"][0].update(
            {"project_url": "https://example.com/project"}
        ),
        lambda payload: payload["career_profile"]["work_experiences"][0].update(
            {"skill_ids": [str(uuid4())]}
        ),
        lambda payload: payload["career_profile"]["work_experiences"][0].update(
            {"skills": [str(uuid4())]}
        ),
        lambda payload: payload["job"].update(
            {"raw_job_description": "The original JD"}
        ),
    ],
)
def test_matching_input_rejects_internal_fields_urls_ids_and_raw_jd(mutate) -> None:
    payload = valid_input()
    mutate(payload)

    with pytest.raises(ValidationError):
        MatchingAnalysisInput.model_validate(payload)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload.update({"unexpected": True}),
        lambda payload: payload["career_profile"].update({"unexpected": True}),
        lambda payload: payload["career_profile"]["education"][0].update(
            {"unexpected": True}
        ),
        lambda payload: payload["career_profile"]["work_experiences"][0].update(
            {"unexpected": True}
        ),
        lambda payload: payload["career_profile"]["project_experiences"][0].update(
            {"unexpected": True}
        ),
        lambda payload: payload["job"].update({"unexpected": True}),
        lambda payload: payload["job"]["job_description_analysis"].update(
            {"unexpected": True}
        ),
    ],
)
def test_matching_input_rejects_extra_fields_at_every_layer(mutate) -> None:
    payload = valid_input()
    mutate(payload)

    with pytest.raises(ValidationError):
        MatchingAnalysisInput.model_validate(payload)


@pytest.mark.parametrize(
    ("section", "limit"),
    [
        ("education", MAX_MATCHING_EDUCATION_ITEMS),
        ("work_experiences", MAX_MATCHING_WORK_EXPERIENCE_ITEMS),
        ("project_experiences", MAX_MATCHING_PROJECT_EXPERIENCE_ITEMS),
        ("skills", MAX_MATCHING_PROFILE_SKILLS),
    ],
)
def test_matching_profile_section_counts_are_bounded(
    section: str,
    limit: int,
) -> None:
    payload = valid_input()
    if section == "skills":
        payload["career_profile"][section] = [
            f"Skill {index}" for index in range(limit + 1)
        ]
    elif section == "education":
        item = payload["career_profile"][section][0]
        payload["career_profile"][section] = [deepcopy(item) for _ in range(limit + 1)]
    elif section == "work_experiences":
        item = payload["career_profile"][section][0]
        payload["career_profile"][section] = [deepcopy(item) for _ in range(limit + 1)]
    else:
        item = payload["career_profile"][section][0]
        payload["career_profile"][section] = [deepcopy(item) for _ in range(limit + 1)]

    with pytest.raises(ValidationError):
        MatchingAnalysisInput.model_validate(payload)


@pytest.mark.parametrize(
    ("field", "limit"),
    [
        ("responsibilities", MAX_MATCHING_EXPERIENCE_RESPONSIBILITIES),
        ("achievements", MAX_MATCHING_EXPERIENCE_ACHIEVEMENTS),
        ("skills", MAX_MATCHING_EXPERIENCE_SKILLS),
    ],
)
def test_matching_experience_field_counts_are_bounded(
    field: str,
    limit: int,
) -> None:
    payload = valid_input()
    payload["career_profile"]["work_experiences"][0][field] = [
        f"Item {index}" for index in range(limit + 1)
    ]

    with pytest.raises(ValidationError):
        MatchingAnalysisInput.model_validate(payload)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload["career_profile"]["education"][0].update(
            {"start_date": "2021/01"}
        ),
        lambda payload: payload["career_profile"]["education"][0].update(
            {"start_date": "2022-01", "end_date": "2021-12"}
        ),
        lambda payload: payload["career_profile"]["education"][0].update(
            {"is_current": True, "end_date": "2022-06"}
        ),
        lambda payload: payload["career_profile"]["work_experiences"][0].update(
            {"is_current": False, "end_date": None}
        ),
        lambda payload: payload["career_profile"]["project_experiences"][0].update(
            {"start_date": "2025-01", "end_date": "2024-12"}
        ),
        lambda payload: payload["career_profile"]["work_experiences"][0].update(
            {"employment_type": "unknown"}
        ),
    ],
)
def test_matching_input_reuses_date_text_and_enum_constraints(mutate) -> None:
    payload = valid_input()
    mutate(payload)

    with pytest.raises(ValidationError):
        MatchingAnalysisInput.model_validate(payload)


def run_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "roleId": str(uuid4()),
        "profileId": str(uuid4()),
        "profileVersion": 2,
        "jobDescriptionVersion": 3,
        "jobDescriptionAnalysisVersion": 4,
    }
    payload.update(overrides)
    return payload


def test_matching_run_payload_accepts_camel_and_snake_names_and_dumps_camel_case() -> None:
    camel_payload = run_payload()
    parsed = MatchingAnalysisRunPayload.model_validate(camel_payload)

    assert str(parsed.role_id) == camel_payload["roleId"]
    assert str(parsed.profile_id) == camel_payload["profileId"]
    assert parsed.profile_version == 2
    assert parsed.model_dump(mode="json") == camel_payload
    assert parsed.model_dump(mode="json", by_alias=False) == {
        "role_id": str(parsed.role_id),
        "profile_id": str(parsed.profile_id),
        "profile_version": 2,
        "job_description_version": 3,
        "job_description_analysis_version": 4,
    }

    snake_payload = {
        "role_id": camel_payload["roleId"],
        "profile_id": camel_payload["profileId"],
        "profile_version": 5,
        "job_description_version": 6,
        "job_description_analysis_version": 7,
    }
    snake_parsed = MatchingAnalysisRunPayload.model_validate(snake_payload)
    assert snake_parsed.model_dump(mode="json") == {
        "roleId": camel_payload["roleId"],
        "profileId": camel_payload["profileId"],
        "profileVersion": 5,
        "jobDescriptionVersion": 6,
        "jobDescriptionAnalysisVersion": 7,
    }


@pytest.mark.parametrize(
    "payload",
    [
        run_payload(roleId="not-a-uuid"),
        run_payload(profileId="12345678123456781234567812345678"),
        run_payload(profileVersion=0),
        run_payload(jobDescriptionVersion=0),
        run_payload(jobDescriptionAnalysisVersion=0),
        run_payload(rawText="secret JD"),
        run_payload(profile=valid_input()["career_profile"]),
        run_payload(jobDescriptionAnalysis=job_description_analysis()),
        run_payload(provider="qwen"),
    ],
)
def test_matching_run_payload_rejects_invalid_versions_and_non_reference_data(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        MatchingAnalysisRunPayload.model_validate(payload)
