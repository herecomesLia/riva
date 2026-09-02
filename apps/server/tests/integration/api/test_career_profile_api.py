from typing import Any

from httpx import AsyncClient

from tests.support.assertions import assert_error_response
from tests.support.auth import ORIGIN_HEADERS, register_user


def _profile_payload(
    *,
    skills: list[str] | None = None,
    work_experience_skills: list[str] | None = None,
) -> dict[str, Any]:
    profile_skills = ["Python"] if skills is None else skills
    experience_skills = (
        ["Python"] if work_experience_skills is None else work_experience_skills
    )
    return {
        "education": [
            {
                "school": "Example University",
                "degree": "Bachelor of Science",
                "major": "Computer Science",
                "startDate": "2018-09",
                "endDate": "2022-06",
            }
        ],
        "workExperiences": [
            {
                "company": "Example Company",
                "title": "Software Engineer",
                "employmentType": "full-time",
                "location": "Remote",
                "responsibilities": ["Build reliable software"],
                "achievements": ["Improved system reliability"],
                "skills": experience_skills,
                "startDate": "2022-07",
                "endDate": None,
            }
        ],
        "projects": [
            {
                "name": "Example Project",
                "role": "Maintainer",
                "description": ["A useful project"],
                "achievements": ["Delivered the first release"],
                "techStack": ["Python"],
                "url": "https://example.test/project",
                "startDate": "2023-01",
                "endDate": None,
            }
        ],
        "skills": profile_skills,
    }


async def test_post_then_get_returns_profile_with_public_camel_case_fields(
    client: AsyncClient,
) -> None:
    await register_user(client)

    create_response = await client.post(
        "/api/career-profile",
        headers=ORIGIN_HEADERS,
        json=_profile_payload(),
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["workExperiences"][0]["employmentType"] == "full-time"
    assert created["workExperiences"][0]["startDate"] == "2022-07"
    assert created["createdAt"]
    assert created["updatedAt"]
    assert "userId" not in created
    assert "profileId" not in created

    get_response = await client.get("/api/career-profile")

    assert get_response.status_code == 200
    profile = get_response.json()
    assert profile["workExperiences"][0]["employmentType"] == "full-time"
    assert profile["workExperiences"][0]["startDate"] == "2022-07"
    assert profile["createdAt"]
    assert profile["updatedAt"]
    assert "work_experiences" not in profile
    assert "userId" not in profile
    assert "profileId" not in profile


async def test_get_returns_not_found_for_missing_profile(client: AsyncClient) -> None:
    await register_user(client)

    response = await client.get("/api/career-profile")

    assert_error_response(
        response,
        status_code=404,
        code="resource.not_found",
        message="Career profile was not found.",
    )


async def test_post_returns_conflict_for_existing_profile(client: AsyncClient) -> None:
    await register_user(client)
    payload = _profile_payload()

    first_response = await client.post(
        "/api/career-profile",
        headers=ORIGIN_HEADERS,
        json=payload,
    )
    assert first_response.status_code == 201

    second_response = await client.post(
        "/api/career-profile",
        headers=ORIGIN_HEADERS,
        json=payload,
    )

    assert_error_response(
        second_response,
        status_code=409,
        code="resource.conflict",
        message="Career profile already exists.",
    )


async def test_patch_empty_list_clears_only_that_section(
    client: AsyncClient,
) -> None:
    await register_user(client)
    create_response = await client.post(
        "/api/career-profile",
        headers=ORIGIN_HEADERS,
        json=_profile_payload(),
    )
    initial = create_response.json()

    response = await client.patch(
        "/api/career-profile",
        headers=ORIGIN_HEADERS,
        json={"projects": []},
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["projects"] == []
    assert updated["education"] == initial["education"]
    assert updated["workExperiences"] == initial["workExperiences"]
    assert updated["skills"] == initial["skills"]


async def test_patch_nested_work_experiences_persists_changes(
    client: AsyncClient,
) -> None:
    await register_user(client)
    create_response = await client.post(
        "/api/career-profile",
        headers=ORIGIN_HEADERS,
        json=_profile_payload(),
    )
    assert create_response.status_code == 201

    work_experiences = [
        {
            "company": "Updated Company",
            "title": "Staff Software Engineer",
            "employmentType": "contract",
            "location": "Hybrid",
            "responsibilities": ["Lead platform improvements"],
            "achievements": ["Reduced deployment time"],
            "skills": ["Python"],
            "startDate": "2024-01",
            "endDate": None,
        }
    ]
    response = await client.patch(
        "/api/career-profile",
        headers=ORIGIN_HEADERS,
        json={"workExperiences": work_experiences},
    )

    assert response.status_code == 200
    assert response.json()["workExperiences"] == work_experiences

    persisted_response = await client.get("/api/career-profile")
    assert persisted_response.status_code == 200
    assert persisted_response.json()["workExperiences"] == work_experiences


async def test_patch_rejects_skill_mismatch_using_persisted_work_experiences(
    client: AsyncClient,
) -> None:
    await register_user(client)
    create_response = await client.post(
        "/api/career-profile",
        headers=ORIGIN_HEADERS,
        json=_profile_payload(
            skills=["Python", "FastAPI"],
            work_experience_skills=["FastAPI"],
        ),
    )
    assert create_response.status_code == 201

    response = await client.patch(
        "/api/career-profile",
        headers=ORIGIN_HEADERS,
        json={"skills": ["Python"]},
    )

    assert_error_response(
        response,
        status_code=422,
        code="domain.validation_failed",
        message=(
            "Work experience skills must exist in the career profile skills list."
        ),
    )

    persisted_response = await client.get("/api/career-profile")
    assert persisted_response.status_code == 200
    assert persisted_response.json()["skills"] == ["Python", "FastAPI"]
