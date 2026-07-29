from pydantic import ValidationError
import pytest

from riva.schemas.profile import ProfileContent


def valid_profile_payload() -> dict[str, object]:
    return {
        "summary": "Backend engineer focused on reliable APIs.",
        "education": [
            {
                "id": "education_1",
                "school": "Tongji University",
                "degree": "Master",
                "major": "Software Engineering",
                "startDate": "2018-09",
                "endDate": "2021-06",
                "isCurrent": False,
            }
        ],
        "workExperiences": [
            {
                "id": "work_1",
                "company": "Riva",
                "title": "Backend Engineer",
                "employmentType": "fullTime",
                "startDate": "2021-07",
                "endDate": None,
                "isCurrent": True,
                "responsibilities": ["Build APIs"],
                "achievements": ["Improved reliability"],
                "skillIds": ["skill_python"],
            }
        ],
        "projectExperiences": [
            {
                "id": "project_1",
                "name": "Profile API",
                "role": "Developer",
                "startDate": "2026-07",
                "endDate": None,
                "isCurrent": True,
                "responsibilities": ["Designed the API"],
                "achievements": [],
                "skillIds": ["skill_python"],
                "projectUrl": "https://example.com/profile",
            }
        ],
        "skills": [{"id": "skill_python", "name": "Python"}],
    }


def test_profile_content_matches_client_camel_case_contract() -> None:
    profile = ProfileContent.model_validate(valid_profile_payload())

    assert profile.work_experiences[0].employment_type == "fullTime"
    assert profile.work_experiences[0].skill_ids == ["skill_python"]
    assert profile.skills[0].source == "userAdded"
    assert profile.model_dump()["workExperiences"][0]["skillIds"] == ["skill_python"]


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload["workExperiences"][0].update(
            {"skillIds": ["missing_skill"]}
        ),
        lambda payload: payload["education"][0].update(
            {"startDate": "2021-01", "endDate": "2020-12"}
        ),
        lambda payload: payload["skills"].append(
            {"id": "skill_python", "name": "FastAPI"}
        ),
        lambda payload: payload["skills"].append(
            {"id": "skill_fastapi", "name": "python"}
        ),
    ],
)
def test_profile_content_rejects_inconsistent_data(mutate) -> None:
    payload = valid_profile_payload()
    mutate(payload)

    with pytest.raises(ValidationError):
        ProfileContent.model_validate(payload)
