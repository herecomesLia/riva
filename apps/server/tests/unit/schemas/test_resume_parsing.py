from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import BaseModel, ValidationError

from riva.schemas.resume_parsing import (
    MAX_RESUME_EDUCATION_ITEMS,
    MAX_RESUME_EXPERIENCE_ACHIEVEMENTS,
    MAX_RESUME_EXPERIENCE_RESPONSIBILITIES,
    MAX_RESUME_EXPERIENCE_SKILLS,
    MAX_RESUME_PROJECT_EXPERIENCE_ITEMS,
    MAX_RESUME_SKILLS,
    MAX_RESUME_TEXT_LENGTH,
    MAX_RESUME_WORK_EXPERIENCE_ITEMS,
    ResumeParsingEducation,
    ResumeParsingInput,
    ResumeParsingOutput,
    ResumeParsingRunPayload,
)


def education(index: int = 0) -> dict[str, object]:
    return {
        "school": f"School {index}",
        "degree": "Bachelor's degree",
        "major": "Computer Science",
        "start_date": "2018-09",
        "end_date": "2022-06",
        "is_current": False,
    }


def work(index: int = 0) -> dict[str, object]:
    return {
        "company": f"Company {index}",
        "title": "Backend Engineer",
        "employment_type": None,
        "location": None,
        "start_date": "2022",
        "end_date": None,
        "is_current": None,
        "responsibilities": [],
        "achievements": [],
        "skills": [],
    }


def project(index: int = 0) -> dict[str, object]:
    return {
        "name": f"Project {index}",
        "role": None,
        "start_date": "2021",
        "end_date": None,
        "is_current": None,
        "responsibilities": [],
        "achievements": [],
        "skills": [],
        "project_url": None,
    }


def minimal_output() -> dict[str, object]:
    return {
        "summary": None,
        "education": [],
        "work_experiences": [],
        "project_experiences": [],
        "skills": [],
        "unresolved_items": [],
    }


def complete_output() -> dict[str, object]:
    return {
        "summary": "Backend engineer focused on reliable APIs.",
        "education": [education()],
        "work_experiences": [
            {
                "company": "Riva",
                "title": "Backend Engineer",
                "employment_type": None,
                "location": " Shanghai ",
                "start_date": "2022",
                "end_date": None,
                "is_current": True,
                "responsibilities": [" Design APIs ", "", "Design APIs"],
                "achievements": [" Improved reliability "],
                "skills": [" python "],
            }
        ],
        "project_experiences": [
            {
                "name": "Profile API",
                "role": "",
                "start_date": "2023-01",
                "end_date": "2023-06",
                "is_current": False,
                "responsibilities": ["Designed the API"],
                "achievements": [],
                "skills": ["FASTAPI"],
                "project_url": "https://example.com/project",
            }
        ],
        "skills": [" Python ", "python", "FastAPI"],
        "unresolved_items": [" A date could not be assigned safely. "],
    }


def test_minimal_output_is_valid_and_all_models_are_pydantic_models() -> None:
    parsed = ResumeParsingOutput.model_validate(minimal_output())

    assert isinstance(parsed, BaseModel)
    assert parsed.summary is None
    assert parsed.education == []
    assert parsed.work_experiences == []
    assert parsed.project_experiences == []
    assert parsed.skills == []
    assert parsed.unresolved_items == []
    assert issubclass(ResumeParsingInput, BaseModel)
    assert issubclass(ResumeParsingEducation, BaseModel)


def test_complete_output_reuses_text_constraints_and_normalizes_lists() -> None:
    parsed = ResumeParsingOutput.model_validate(complete_output())

    assert parsed.education[0].school == "School 0"
    assert parsed.work_experiences[0].location == "Shanghai"
    assert parsed.work_experiences[0].responsibilities == ["Design APIs"]
    assert parsed.work_experiences[0].achievements == ["Improved reliability"]
    assert parsed.work_experiences[0].skills == ["Python"]
    assert parsed.project_experiences[0].role is None
    assert parsed.project_experiences[0].skills == ["FastAPI"]
    assert str(parsed.project_experiences[0].project_url) == (
        "https://example.com/project"
    )
    assert parsed.skills == ["Python", "FastAPI"]
    assert parsed.unresolved_items == ["A date could not be assigned safely."]


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload.update({"id": str(uuid4())}),
        lambda payload: payload.update({"source": "resumeExtracted"}),
        lambda payload: payload.update({"version": 1}),
        lambda payload: payload["education"][0].update(
            {"source": "resumeExtracted"}
        ),
        lambda payload: payload["work_experiences"][0].update(
            {"profileId": str(uuid4())}
        ),
    ],
)
def test_output_rejects_internal_and_forbidden_fields(mutate) -> None:
    payload = complete_output()
    mutate(payload)

    with pytest.raises(ValidationError):
        ResumeParsingOutput.model_validate(payload)


@pytest.mark.parametrize(
    "field",
    [
        "id",
        "profileId",
        "userId",
        "resumeDocumentId",
        "source",
        "version",
        "confidence",
        "reasoning",
        "chainOfThought",
        "contactInfo",
        "name",
        "email",
        "phone",
        "address",
        "gender",
        "age",
        "birthday",
        "nationality",
        "maritalStatus",
        "photo",
        "credentials",
        "targetRoles",
        "matchingAnalysis",
        "rawResumeText",
    ],
)
def test_output_rejects_every_forbidden_top_level_field(field: str) -> None:
    payload = complete_output()
    payload[field] = "forbidden"

    with pytest.raises(ValidationError):
        ResumeParsingOutput.model_validate(payload)


def test_input_trims_resume_text_and_forbids_metadata() -> None:
    parsed = ResumeParsingInput.model_validate({"resume_text": "  中文简历  "})

    assert parsed.resume_text == "中文简历"
    with pytest.raises(ValidationError):
        ResumeParsingInput.model_validate(
            {"resume_text": "resume", "resumeDocumentId": str(uuid4())}
        )


@pytest.mark.parametrize("resume_text", ["", "   ", "\n\t"])
def test_input_rejects_empty_resume_text(resume_text: str) -> None:
    with pytest.raises(ValidationError):
        ResumeParsingInput.model_validate({"resume_text": resume_text})


def test_input_rejects_text_over_the_hard_contract_limit() -> None:
    with pytest.raises(ValidationError):
        ResumeParsingInput.model_validate(
            {"resume_text": "x" * (MAX_RESUME_TEXT_LENGTH + 1)}
        )


@pytest.mark.parametrize(
    "date_value",
    ["2021-7", "2021-00", "2021-13", "2021-07-01", "至今", "Present"],
)
def test_resume_date_rejects_invalid_precision_months_and_natural_language(
    date_value: str,
) -> None:
    payload = education()
    payload["start_date"] = date_value

    with pytest.raises(ValidationError):
        ResumeParsingEducation.model_validate(payload)


@pytest.mark.parametrize("date_value", ["2021", "2021-07"])
def test_resume_date_accepts_year_and_year_month(date_value: str) -> None:
    payload = education()
    payload["start_date"] = date_value
    payload["end_date"] = None
    payload["is_current"] = None

    parsed = ResumeParsingEducation.model_validate(payload)
    assert parsed.start_date == date_value


@pytest.mark.parametrize(
    ("end_date", "is_current"),
    [("2022", True), ("2022", None)],
)
def test_end_date_requires_explicitly_non_current_state(
    end_date: str, is_current: bool | None
) -> None:
    payload = education()
    payload["end_date"] = end_date
    payload["is_current"] = is_current

    with pytest.raises(ValidationError):
        ResumeParsingEducation.model_validate(payload)


def test_current_entry_cannot_have_end_date() -> None:
    payload = education()
    payload["is_current"] = True
    payload["end_date"] = "2022"

    with pytest.raises(ValidationError):
        ResumeParsingEducation.model_validate(payload)


@pytest.mark.parametrize(
    ("start_date", "end_date"),
    [("2022", "2021"), ("2021-07", "2021-06")],
)
def test_date_range_rejects_known_reverse_ranges(
    start_date: str, end_date: str
) -> None:
    payload = education()
    payload["start_date"] = start_date
    payload["end_date"] = end_date
    payload["is_current"] = False

    with pytest.raises(ValidationError):
        ResumeParsingEducation.model_validate(payload)


@pytest.mark.parametrize(
    ("start_date", "end_date"),
    [("2021", "2021-01"), ("2021-12", "2021"), ("2021-07", "2022")],
)
def test_mixed_date_precision_does_not_infer_unknown_months(
    start_date: str, end_date: str
) -> None:
    payload = education()
    payload["start_date"] = start_date
    payload["end_date"] = end_date
    payload["is_current"] = False

    assert ResumeParsingEducation.model_validate(payload)


def test_null_employment_type_is_valid() -> None:
    parsed = ResumeParsingOutput.model_validate(complete_output())

    assert parsed.work_experiences[0].employment_type is None


def test_skill_names_reject_standard_uuids() -> None:
    payload = complete_output()
    payload["skills"] = [str(uuid4())]

    with pytest.raises(ValidationError):
        ResumeParsingOutput.model_validate(payload)


def test_skill_lists_trim_and_deduplicate_case_insensitively() -> None:
    payload = complete_output()
    payload["skills"] = [" Python ", "python", "PYTHON", " FastAPI "]
    payload["work_experiences"][0]["skills"] = ["PYTHON", " python "]

    parsed = ResumeParsingOutput.model_validate(payload)

    assert parsed.skills == ["Python", "FastAPI"]
    assert parsed.work_experiences[0].skills == ["Python"]


def test_experience_skills_must_be_top_level_skill_subset() -> None:
    payload = complete_output()
    payload["work_experiences"][0]["skills"] = ["Django"]

    with pytest.raises(ValidationError, match="top-level skills"):
        ResumeParsingOutput.model_validate(payload)


@pytest.mark.parametrize(
    ("section", "limit"),
    [
        ("education", MAX_RESUME_EDUCATION_ITEMS),
        ("work_experiences", MAX_RESUME_WORK_EXPERIENCE_ITEMS),
        ("project_experiences", MAX_RESUME_PROJECT_EXPERIENCE_ITEMS),
        ("skills", MAX_RESUME_SKILLS),
        ("unresolved_items", 100),
    ],
)
def test_top_level_lists_accept_boundary_and_reject_overflow(
    section: str, limit: int
) -> None:
    payload = minimal_output()
    if section == "education":
        payload[section] = [education(index) for index in range(limit)]
        overflow = education(limit)
    elif section == "work_experiences":
        payload[section] = [work(index) for index in range(limit)]
        overflow = work(limit)
    elif section == "project_experiences":
        payload[section] = [project(index) for index in range(limit)]
        overflow = project(limit)
    else:
        payload[section] = [f"Skill {index}" for index in range(limit)]
        overflow = f"Skill {limit}"

    assert ResumeParsingOutput.model_validate(payload)
    payload[section].append(overflow)

    with pytest.raises(ValidationError):
        ResumeParsingOutput.model_validate(payload)
    assert len(payload[section]) == limit + 1


@pytest.mark.parametrize(
    ("field", "limit"),
    [
        ("responsibilities", MAX_RESUME_EXPERIENCE_RESPONSIBILITIES),
        ("achievements", MAX_RESUME_EXPERIENCE_ACHIEVEMENTS),
        ("skills", MAX_RESUME_EXPERIENCE_SKILLS),
    ],
)
def test_experience_lists_accept_boundary_and_reject_overflow(
    field: str, limit: int
) -> None:
    payload = complete_output()
    if field == "skills":
        values = [f"Skill {index}" for index in range(limit)]
        payload["skills"] = values.copy()
        payload["project_experiences"][0]["skills"] = []
    else:
        values = [f"Item {index}" for index in range(limit)]
    payload["work_experiences"][0][field] = values

    assert ResumeParsingOutput.model_validate(payload)
    payload["work_experiences"][0][field].append(
        f"Item {limit}" if field != "skills" else f"Skill {limit}"
    )

    with pytest.raises(ValidationError):
        ResumeParsingOutput.model_validate(payload)
    assert len(payload["work_experiences"][0][field]) == limit + 1


def test_run_payload_accepts_both_names_and_serializes_camel_case() -> None:
    document_id = str(uuid4())
    parsed = ResumeParsingRunPayload.model_validate(
        {"resumeDocumentId": document_id}
    )

    assert str(parsed.resume_document_id) == document_id
    assert parsed.model_dump(mode="json") == {"resumeDocumentId": document_id}
    assert parsed.model_dump(mode="json", by_alias=False) == {
        "resume_document_id": document_id
    }

    snake_parsed = ResumeParsingRunPayload.model_validate(
        {"resume_document_id": document_id}
    )
    assert snake_parsed.model_dump(mode="json") == {
        "resumeDocumentId": document_id
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"resumeDocumentId": str(uuid4()), "userId": str(uuid4())},
        {"resumeDocumentId": str(uuid4()), "extractedText": "secret"},
        {"resumeDocumentId": "not-a-uuid"},
    ],
)
def test_run_payload_rejects_extra_and_non_reference_data(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        ResumeParsingRunPayload.model_validate(payload)


def test_input_and_output_models_do_not_accept_arbitrary_dict_fields() -> None:
    payload = minimal_output()
    payload["unexpected"] = {"nested": "value"}

    with pytest.raises(ValidationError):
        ResumeParsingOutput.model_validate(payload)


def test_complete_output_copy_can_be_validated_without_mutating_input() -> None:
    payload = complete_output()
    before = deepcopy(payload)

    ResumeParsingOutput.model_validate(payload)

    assert payload == before
