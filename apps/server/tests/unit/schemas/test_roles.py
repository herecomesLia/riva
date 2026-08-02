from datetime import UTC, datetime
from uuid import UUID

from pydantic import TypeAdapter, ValidationError
import pytest

from riva.schemas.roles import (
    MAX_RAW_JOB_DESCRIPTION_LENGTH,
    ArchiveTargetRoleRequest,
    CreateTargetRoleRequest,
    DeleteTargetRoleVersion,
    JobDescriptionResponse,
    JobDescriptionAnalysisResponse,
    JobDescriptionParsingStatusQuery,
    RolesPageResponse,
    SaveJobDescriptionRequest,
    SetCurrentTargetRoleRequest,
    StartJobDescriptionParsingRequest,
    TargetRoleResponse,
    UpdatePreparationStatusRequest,
    UpdateTargetRoleRequest,
)

ROLE_ID = "11111111-1111-4111-8111-111111111111"


def valid_role_details() -> dict[str, object]:
    return {
        "title": "  Backend Engineer  ",
        "company": "  Riva  ",
        "recruitmentType": "experienced",
        "location": "",
        "experienceRange": {"minYears": 2, "maxYears": 5},
    }


def valid_role_response() -> dict[str, object]:
    return {
        "id": ROLE_ID,
        **valid_role_details(),
        "preparationStatus": "preparing",
        "createdAt": "2026-07-29T08:00:00Z",
        "updatedAt": "2026-07-29T08:30:00Z",
        "version": 1,
        "jobDescription": {
            "status": "missing",
            "rawText": None,
            "version": None,
            "parsingFailureReason": None,
        },
        "jobDescriptionAnalysis": None,
        "matchingAnalysis": None,
    }


def test_create_request_uses_camel_case_and_normalizes_text() -> None:
    request = CreateTargetRoleRequest.model_validate(
        {**valid_role_details(), "preparationStatus": "paused"}
    )

    assert request.title == "Backend Engineer"
    assert request.company == "Riva"
    assert request.location is None
    assert request.experience_range is not None
    assert request.model_dump()["experienceRange"] == {
        "minYears": 2,
        "maxYears": 5,
    }


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload.update({"title": "   "}),
        lambda payload: payload.update({"preparationStatus": "archived"}),
        lambda payload: payload.update({"preparationStatus": "ready"}),
        lambda payload: payload.update(
            {"experienceRange": {"minYears": None, "maxYears": None}}
        ),
        lambda payload: payload.update(
            {"experienceRange": {"minYears": -1, "maxYears": 2}}
        ),
        lambda payload: payload.update(
            {"experienceRange": {"minYears": 4, "maxYears": 2}}
        ),
        lambda payload: payload.update({"userId": ROLE_ID}),
        lambda payload: payload.update({"jobDescriptionAnalysis": None}),
        lambda payload: payload.update({"matchingAnalysis": None}),
    ],
)
def test_create_request_rejects_invalid_or_out_of_scope_fields(mutate) -> None:
    payload = {**valid_role_details(), "preparationStatus": "preparing"}
    mutate(payload)

    with pytest.raises(ValidationError):
        CreateTargetRoleRequest.model_validate(payload)


def test_create_request_allows_null_experience_range() -> None:
    request = CreateTargetRoleRequest.model_validate(
        {
            **valid_role_details(),
            "experienceRange": None,
            "preparationStatus": "preparing",
        }
    )

    assert request.experience_range is None


@pytest.mark.parametrize(
    "schema,payload",
    [
        (
            UpdateTargetRoleRequest,
            {**valid_role_details(), "version": 1},
        ),
        (
            SetCurrentTargetRoleRequest,
            {"version": 1},
        ),
        (
            UpdatePreparationStatusRequest,
            {
                "version": 1,
                "preparationStatus": "paused",
            },
        ),
        (
            ArchiveTargetRoleRequest,
            {"version": 1},
        ),
    ],
)
def test_mutation_requests_require_positive_versions(schema, payload) -> None:
    assert schema.model_validate(payload).version == 1

    payload["version"] = 0
    with pytest.raises(ValidationError):
        schema.model_validate(payload)


def test_preparation_status_request_cannot_archive() -> None:
    with pytest.raises(ValidationError):
        UpdatePreparationStatusRequest.model_validate(
            {
                "version": 1,
                "preparationStatus": "archived",
            }
        )


def test_delete_version_query_constraint_is_positive() -> None:
    adapter = TypeAdapter(DeleteTargetRoleVersion)

    assert adapter.validate_python(1) == 1
    with pytest.raises(ValidationError):
        adapter.validate_python(0)


def test_save_job_description_trims_and_limits_raw_text() -> None:
    request = SaveJobDescriptionRequest.model_validate(
        {"version": 2, "rawText": "  Build APIs.  "}
    )

    assert request.raw_text == "Build APIs."

    for raw_text in ("   ", "x" * (MAX_RAW_JOB_DESCRIPTION_LENGTH + 1)):
        with pytest.raises(ValidationError):
            SaveJobDescriptionRequest.model_validate(
                {"version": 2, "rawText": raw_text}
            )


@pytest.mark.parametrize(
    "schema,payload",
    [
        (
            UpdateTargetRoleRequest,
            {**valid_role_details(), "version": 1, "roleId": ROLE_ID},
        ),
        (
            UpdatePreparationStatusRequest,
            {
                "version": 1,
                "preparationStatus": "paused",
                "roleId": ROLE_ID,
            },
        ),
        (ArchiveTargetRoleRequest, {"version": 1, "roleId": ROLE_ID}),
        (
            SaveJobDescriptionRequest,
            {"version": 1, "rawText": "Build APIs.", "roleId": ROLE_ID},
        ),
    ],
)
def test_resource_request_bodies_reject_path_role_id(schema, payload) -> None:
    with pytest.raises(ValidationError):
        schema.model_validate(payload)


@pytest.mark.parametrize(
    "payload,expected_status",
    [
        (
            {
                "status": "missing",
                "rawText": None,
                "version": None,
                "parsingFailureReason": None,
            },
            "missing",
        ),
        *[
            (
                {
                    "status": status,
                    "rawText": "Build APIs.",
                    "version": 1,
                    "parsingFailureReason": (
                        "Job description parsing failed."
                        if status == "failed"
                        else None
                    ),
                },
                status,
            )
            for status in ("saved", "parsing", "ready", "failed")
        ],
    ],
)
def test_job_description_response_supports_five_states(
    payload, expected_status
) -> None:
    parsed = TypeAdapter(JobDescriptionResponse).validate_python(payload)

    assert parsed.status == expected_status
    assert parsed.model_dump() == payload


@pytest.mark.parametrize(
    "payload",
    [
        {
            "status": "failed",
            "rawText": "Build APIs.",
            "version": 1,
            "parsingFailureReason": None,
        },
        {
            "status": "parsing",
            "rawText": "Build APIs.",
            "version": 1,
            "parsingFailureReason": "internal exception",
        },
    ],
)
def test_job_description_response_enforces_state_fields(payload) -> None:
    with pytest.raises(ValidationError):
        TypeAdapter(JobDescriptionResponse).validate_python(payload)


def valid_analysis_response(job_description_version: int = 1):
    return {
        "jobDescriptionVersion": job_description_version,
        "analysisVersion": 1,
        "parsedAt": "2026-07-29T08:31:00Z",
        "rivaSummary": "Build reliable APIs.",
        "responsibilities": ["Design APIs"],
        "qualificationRequirements": {
            "education": [],
            "graduationCohorts": [],
            "majors": [],
            "experience": [],
            "languages": [],
            "certifications": [],
            "other": [],
        },
        "requiredSkills": {
            "programmingLanguages": ["Python"],
            "frameworksAndLibraries": [],
            "platforms": [],
            "tools": [],
            "conceptsAndMethods": [],
            "databasesAndMiddleware": [],
            "other": [],
        },
        "preferredQualifications": [],
        "softSkills": [],
        "businessDomains": [],
    }


def test_analysis_response_is_camel_case_strict_and_bounded() -> None:
    analysis = JobDescriptionAnalysisResponse.model_validate(
        valid_analysis_response()
    )
    assert analysis.model_dump()["requiredSkills"]["programmingLanguages"] == [
        "Python"
    ]

    invalid = valid_analysis_response()
    invalid["sourceAgentRunId"] = ROLE_ID
    with pytest.raises(ValidationError):
        JobDescriptionAnalysisResponse.model_validate(invalid)


@pytest.mark.parametrize(
    "status,analysis_version",
    [("ready", None), ("ready", 2), ("saved", 1), ("parsing", 1)],
)
def test_target_role_response_enforces_analysis_state_consistency(
    status: str, analysis_version: int | None
) -> None:
    payload = valid_role_response()
    payload["jobDescription"] = {
        "status": status,
        "rawText": "Build APIs.",
        "version": 1,
        "parsingFailureReason": None,
    }
    payload["jobDescriptionAnalysis"] = (
        None
        if analysis_version is None
        else valid_analysis_response(analysis_version)
    )
    with pytest.raises(ValidationError):
        TargetRoleResponse.model_validate(payload)


@pytest.mark.parametrize(
    "schema,payload",
    [
        (
            StartJobDescriptionParsingRequest,
            {"version": 2, "jobDescriptionVersion": 1},
        ),
        (
            JobDescriptionParsingStatusQuery,
            {"version": 2, "jobDescriptionVersion": 1},
        ),
    ],
)
def test_parsing_requests_use_camel_case_positive_versions(schema, payload) -> None:
    parsed = schema.model_validate(payload)
    assert parsed.job_description_version == 1
    for key in ("version", "jobDescriptionVersion"):
        invalid = {**payload, key: 0}
        with pytest.raises(ValidationError):
            schema.model_validate(invalid)


def test_target_role_response_has_null_analysis_fields() -> None:
    response = TargetRoleResponse.model_validate(valid_role_response())

    assert response.id == UUID(ROLE_ID)
    assert response.created_at == datetime(2026, 7, 29, 8, tzinfo=UTC)
    assert response.job_description_analysis is None
    assert response.matching_analysis is None

    payload = valid_role_response()
    payload["jobDescriptionAnalysis"] = {}
    with pytest.raises(ValidationError):
        TargetRoleResponse.model_validate(payload)


def test_roles_page_response_supports_missing_and_existing_profile_contexts() -> None:
    missing = RolesPageResponse.model_validate(
        {
            "roles": [],
            "currentRoleId": None,
            "profileContext": {
                "exists": False,
                "version": None,
                "completed": False,
            },
        }
    )
    assert missing.model_dump() == {
        "roles": [],
        "currentRoleId": None,
        "profileContext": {
            "exists": False,
            "version": None,
            "completed": False,
        },
    }

    existing = RolesPageResponse.model_validate(
        {
            "roles": [valid_role_response()],
            "currentRoleId": ROLE_ID,
            "profileContext": {
                "exists": True,
                "version": 3,
                "completed": True,
            },
        }
    )
    assert existing.current_role_id == UUID(ROLE_ID)


@pytest.mark.parametrize("missing_role", [True, False])
def test_roles_page_response_requires_current_role_to_be_present_and_active(
    missing_role: bool,
) -> None:
    role = valid_role_response()
    if not missing_role:
        role["preparationStatus"] = "archived"

    with pytest.raises(ValidationError):
        RolesPageResponse.model_validate(
            {
                "roles": [] if missing_role else [role],
                "currentRoleId": ROLE_ID,
                "profileContext": {
                    "exists": False,
                    "version": None,
                    "completed": False,
                },
            }
        )


@pytest.mark.parametrize(
    "profile_context",
    [
        {"exists": False, "version": 1, "completed": False},
        {"exists": False, "version": None, "completed": True},
        {"exists": True, "version": None, "completed": False},
        {"exists": True, "version": 0, "completed": False},
    ],
)
def test_profile_context_enforces_consistent_discriminated_states(
    profile_context,
) -> None:
    with pytest.raises(ValidationError):
        RolesPageResponse.model_validate(
            {
                "roles": [],
                "currentRoleId": None,
                "profileContext": profile_context,
            }
        )
