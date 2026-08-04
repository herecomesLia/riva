from datetime import UTC, datetime
from uuid import uuid4

from pydantic import TypeAdapter, ValidationError
import pytest

from riva.schemas.roles import MatchingAnalysisResponse, RolesPageResponse, TargetRoleResponse


GENERATED_AT = "2026-08-04T09:30:00Z"
ROLE_ID = str(uuid4())


def analysis_response(*, analysis_version: int = 4) -> dict[str, object]:
    return {
        "jobDescriptionVersion": 2,
        "analysisVersion": analysis_version,
        "parsedAt": GENERATED_AT,
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


def result() -> dict[str, object]:
    return {
        "overallMatchScore": 0,
        "coreRequirementsSummary": "Build reliable APIs.",
        "matchedCapabilities": ["Python"],
        "missingCapabilities": [],
        "underrepresentedCapabilities": [],
        "resumeHighlights": [],
        "resumeGaps": [],
        "highRiskQuestions": [],
        "preparationRecommendations": [],
    }


def matching_state(status: str) -> dict[str, object]:
    base: dict[str, object] = {
        "status": status,
        "profileVersion": 3,
        "jobDescriptionVersion": 2,
        "jobDescriptionAnalysisVersion": 4,
    }
    if status == "generating":
        base.update(
            {"generatedAt": None, "failureReason": None, "result": None}
        )
    elif status == "failed":
        base.update(
            {
                "generatedAt": None,
                "failureReason": "Safe failure reason.",
                "result": None,
            }
        )
    else:
        base.update(
            {
                "generatedAt": GENERATED_AT,
                "failureReason": None,
                "result": result(),
            }
        )
    return base


def role_response(matching: dict[str, object] | None) -> dict[str, object]:
    return {
        "id": ROLE_ID,
        "title": "Backend Engineer",
        "company": None,
        "recruitmentType": None,
        "location": None,
        "experienceRange": None,
        "preparationStatus": "preparing",
        "createdAt": GENERATED_AT,
        "updatedAt": GENERATED_AT,
        "version": 7,
        "jobDescription": {
            "status": "ready",
            "rawText": "Build APIs.",
            "version": 2,
            "parsingFailureReason": None,
        },
        "jobDescriptionAnalysis": analysis_response(),
        "matchingAnalysis": matching,
    }


def test_matching_response_is_strongly_typed_and_camel_case() -> None:
    parsed = TypeAdapter(MatchingAnalysisResponse).validate_python(
        matching_state("current")
    )

    assert parsed.status == "current"
    assert parsed.result is not None
    assert parsed.result.overall_match_score == 0
    assert parsed.model_dump()["generatedAt"] == datetime(
        2026,
        8,
        4,
        9,
        30,
        tzinfo=UTC,
    )
    assert parsed.model_dump()["jobDescriptionAnalysisVersion"] == 4


@pytest.mark.parametrize("status", ["generating", "current", "stale", "failed"])
def test_all_matching_lifecycle_states_validate(status: str) -> None:
    parsed = TypeAdapter(MatchingAnalysisResponse).validate_python(
        matching_state(status)
    )
    assert parsed.status == status


def test_target_role_allows_null_matching_state() -> None:
    parsed = TargetRoleResponse.model_validate(role_response(None))
    assert parsed.matching_analysis is None


@pytest.mark.parametrize(
    "status,field,value",
    [
        ("current", "result", None),
        ("stale", "generatedAt", None),
        ("generating", "result", result()),
        ("failed", "generatedAt", GENERATED_AT),
        ("failed", "result", result()),
    ],
)
def test_matching_state_nullability_is_strict(
    status: str,
    field: str,
    value: object,
) -> None:
    payload = matching_state(status)
    payload[field] = value
    with pytest.raises(ValidationError):
        TypeAdapter(MatchingAnalysisResponse).validate_python(payload)


def test_matching_state_rejects_zero_versions_and_extra_fields() -> None:
    invalid_version = matching_state("generating")
    invalid_version["profileVersion"] = 0
    with pytest.raises(ValidationError):
        TypeAdapter(MatchingAnalysisResponse).validate_python(invalid_version)

    extra = matching_state("generating")
    extra["runId"] = str(uuid4())
    with pytest.raises(ValidationError):
        TypeAdapter(MatchingAnalysisResponse).validate_python(extra)


@pytest.mark.parametrize(
    "field,value",
    [
        ("jobDescriptionVersion", 1),
        ("jobDescriptionAnalysisVersion", 3),
    ],
)
def test_current_matching_state_must_match_current_jd_context(
    field: str,
    value: int,
) -> None:
    matching = matching_state("current")
    matching[field] = value
    with pytest.raises(ValidationError):
        TargetRoleResponse.model_validate(role_response(matching))


def test_current_matching_state_requires_ready_jd_and_analysis() -> None:
    matching = matching_state("current")
    payload = role_response(matching)
    payload["jobDescription"] = {
        "status": "saved",
        "rawText": "Build APIs.",
        "version": 2,
        "parsingFailureReason": None,
    }
    payload["jobDescriptionAnalysis"] = None
    with pytest.raises(ValidationError):
        TargetRoleResponse.model_validate(payload)


def test_stale_matching_state_allows_old_versions_and_non_ready_jd() -> None:
    matching = matching_state("stale")
    matching["profileVersion"] = 1
    payload = role_response(matching)
    payload["jobDescription"] = {
        "status": "saved",
        "rawText": "Build APIs.",
        "version": 3,
        "parsingFailureReason": None,
    }
    payload["jobDescriptionAnalysis"] = None

    parsed = TargetRoleResponse.model_validate(payload)
    assert parsed.matching_analysis is not None
    assert parsed.matching_analysis.status == "stale"


def test_roles_page_current_matching_requires_matching_profile_context() -> None:
    with pytest.raises(ValidationError):
        RolesPageResponse.model_validate(
            {
                "roles": [role_response(matching_state("current"))],
                "currentRoleId": None,
                "profileContext": {
                    "exists": False,
                    "version": None,
                    "completed": False,
                },
            }
        )

    matching = matching_state("current")
    matching["profileVersion"] = 4
    with pytest.raises(ValidationError):
        RolesPageResponse.model_validate(
            {
                "roles": [role_response(matching)],
                "currentRoleId": None,
                "profileContext": {
                    "exists": True,
                    "version": 3,
                    "completed": True,
                },
            }
        )
