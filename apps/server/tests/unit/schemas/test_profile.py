from datetime import UTC, datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from riva.schemas.profile import (
    CareerProfileGetResponse,
    CareerProfilePutRequest,
    CareerProfilePutResponse,
    CareerProfileResponse,
)

EDUCATION_ID = "11111111-1111-4111-8111-111111111111"
WORK_ID = "22222222-2222-4222-8222-222222222222"
PROJECT_ID = "33333333-3333-4333-8333-333333333333"
SKILL_ID = "44444444-4444-4444-8444-444444444444"


def valid_put_payload() -> dict[str, object]:
    return {
        "version": 3,
        "summary": "  Backend engineer focused on reliable APIs.  ",
        "education": [
            {
                "id": EDUCATION_ID,
                "school": "  Tongji University  ",
                "degree": "",
                "major": "Software Engineering",
                "startDate": "2018-09",
                "endDate": "2021-06",
                "isCurrent": False,
            }
        ],
        "workExperiences": [
            {
                "id": WORK_ID,
                "company": "Riva",
                "title": "Backend Engineer",
                "employmentType": "fullTime",
                "location": "",
                "startDate": "2021-07",
                "endDate": None,
                "isCurrent": True,
                "responsibilities": [" Build APIs ", "", "Build APIs"],
                "achievements": ["Improved reliability"],
                "skillIds": [SKILL_ID, SKILL_ID],
            }
        ],
        "projectExperiences": [
            {
                "id": PROJECT_ID,
                "name": "Profile API",
                "role": "",
                "startDate": "2026-07",
                "endDate": None,
                "responsibilities": ["Designed the API"],
                "achievements": [],
                "skillIds": [SKILL_ID],
                "projectUrl": "https://example.com/profile",
            }
        ],
        "skills": [{"id": SKILL_ID, "name": " Python "}],
    }


def response_profile_payload() -> dict[str, object]:
    request = CareerProfilePutRequest.model_validate(valid_put_payload())
    content = request.model_dump(mode="json", by_alias=True, exclude={"version"})
    for section in (
        content["education"],
        content["workExperiences"],
        content["projectExperiences"],
        content["skills"],
    ):
        for item in section:
            item["source"] = "userAdded"
    return {
        "profileId": "55555555-5555-4555-8555-555555555555",
        "version": 4,
        "updatedAt": "2026-07-29T08:30:00Z",
        **content,
    }


def test_put_request_uses_camel_case_and_normalizes_values() -> None:
    request = CareerProfilePutRequest.model_validate(valid_put_payload())

    assert request.summary == "Backend engineer focused on reliable APIs."
    assert request.education[0].school == "Tongji University"
    assert request.education[0].degree is None
    assert request.work_experiences[0].location is None
    assert request.work_experiences[0].responsibilities == ["Build APIs"]
    assert request.work_experiences[0].skill_ids == [UUID(SKILL_ID)]
    assert request.project_experiences[0].role is None
    assert str(request.project_experiences[0].project_url) == (
        "https://example.com/profile"
    )


def test_put_request_requires_explicit_version_and_content_fields() -> None:
    payload = valid_put_payload()
    payload.pop("version")

    with pytest.raises(ValidationError):
        CareerProfilePutRequest.model_validate(payload)

    payload = valid_put_payload()
    payload.pop("skills")

    with pytest.raises(ValidationError):
        CareerProfilePutRequest.model_validate(payload)


def test_put_request_allows_null_version_for_creation() -> None:
    payload = valid_put_payload()
    payload["version"] = None

    request = CareerProfilePutRequest.model_validate(payload)

    assert request.version is None


def test_put_request_rejects_source_unknown_fields_and_draft_ids() -> None:
    payload = valid_put_payload()
    payload["skills"][0]["source"] = "userAdded"
    with pytest.raises(ValidationError):
        CareerProfilePutRequest.model_validate(payload)

    payload = valid_put_payload()
    payload["unknownField"] = True
    with pytest.raises(ValidationError):
        CareerProfilePutRequest.model_validate(payload)

    payload = valid_put_payload()
    payload["education"][0]["id"] = f"draft_{EDUCATION_ID}"
    with pytest.raises(ValidationError):
        CareerProfilePutRequest.model_validate(payload)


@pytest.mark.parametrize(
    "section,field",
    [
        ("education", "isCurrent"),
        ("workExperiences", "isCurrent"),
    ],
)
def test_education_and_work_require_consistent_current_dates(
    section: str,
    field: str,
) -> None:
    payload = valid_put_payload()
    payload[section][0][field] = False
    payload[section][0]["endDate"] = None

    with pytest.raises(ValidationError):
        CareerProfilePutRequest.model_validate(payload)

    payload[section][0][field] = True
    payload[section][0]["endDate"] = "2026-01"

    with pytest.raises(ValidationError):
        CareerProfilePutRequest.model_validate(payload)


def test_project_has_no_is_current_and_validates_date_order() -> None:
    payload = valid_put_payload()
    payload["projectExperiences"][0]["isCurrent"] = True
    with pytest.raises(ValidationError):
        CareerProfilePutRequest.model_validate(payload)

    payload = valid_put_payload()
    payload["projectExperiences"][0]["endDate"] = "2026-06"
    with pytest.raises(ValidationError):
        CareerProfilePutRequest.model_validate(payload)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload["workExperiences"][0].update(
            {"skillIds": ["66666666-6666-4666-8666-666666666666"]}
        ),
        lambda payload: payload["education"][0].update({"startDate": "2021/01"}),
        lambda payload: payload["education"][0].update(
            {"startDate": "2021-01", "endDate": "2020-12"}
        ),
        lambda payload: payload["skills"].append({"id": SKILL_ID, "name": "FastAPI"}),
        lambda payload: payload["skills"].append(
            {
                "id": "77777777-7777-4777-8777-777777777777",
                "name": "python",
            }
        ),
        lambda payload: payload["projectExperiences"][0].update(
            {"projectUrl": "ftp://example.com/profile"}
        ),
        lambda payload: payload.update({"summary": "x" * 2001}),
    ],
)
def test_put_request_rejects_inconsistent_or_invalid_data(mutate) -> None:
    payload = valid_put_payload()
    mutate(payload)

    with pytest.raises(ValidationError):
        CareerProfilePutRequest.model_validate(payload)


def test_get_response_supports_null_profile() -> None:
    response = CareerProfileGetResponse.model_validate({"profile": None})

    assert response.model_dump() == {"profile": None}


def test_profile_response_contains_source_and_excludes_created_at() -> None:
    response = CareerProfileResponse.model_validate(response_profile_payload())
    serialized = response.model_dump()

    assert serialized["profileId"] == UUID("55555555-5555-4555-8555-555555555555")
    assert serialized["education"][0]["source"] == "userAdded"
    assert "createdAt" not in serialized


def test_put_response_requires_non_null_profile() -> None:
    response = CareerProfilePutResponse.model_validate(
        {"profile": response_profile_payload()}
    )

    assert response.profile.updated_at == datetime(
        2026,
        7,
        29,
        8,
        30,
        tzinfo=UTC,
    )

    with pytest.raises(ValidationError):
        CareerProfilePutResponse.model_validate({"profile": None})
