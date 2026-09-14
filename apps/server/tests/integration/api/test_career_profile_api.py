from typing import Any
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from riva.models.career_profile import CareerProfileExtraction
from riva.tasks import TaskErrorCode
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


EXTRACTION_PATH = "/api/career-profile/extraction"


async def _fail_extraction(database, user_id, code):
    async with database.sessionmaker() as session:
        extraction = await session.get(CareerProfileExtraction, user_id)
        extraction.error_code = code
        await session.execute(text("SET LOCAL search_path TO procrastinate, public"))
        await session.execute(
            text("UPDATE procrastinate_jobs SET status = 'failed' WHERE id = :id"),
            {"id": extraction.job_id},
        )
        await session.commit()


async def test_extraction_http_lifecycle_without_profile(client, database):
    registered = await register_user(client)
    user_id = UUID(registered.json()["id"])
    path = EXTRACTION_PATH
    response = await client.get(path)
    assert response.status_code == 200
    assert response.json() == {"status": "idle", "error": None}
    for action in ("retry", "abort"):
        response = await client.post(f"{path}/{action}", headers=ORIGIN_HEADERS)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "resource.conflict"

    response = await client.post(
        f"{path}/text", headers=ORIGIN_HEADERS, json={"text": "Skills: Python"}
    )
    assert response.status_code == 202
    assert response.content == b""
    assert (await client.get(path)).json() == {"status": "queued", "error": None}
    # Dispatch must forward the authenticated owner and source, without creating a profile.
    async with database.sessionmaker() as session:
        extraction = await session.get(CareerProfileExtraction, user_id)
        args = await session.scalar(
            text("SELECT args FROM procrastinate.procrastinate_jobs WHERE id = :id"),
            {"id": extraction.job_id},
        )
        assert args == {"user_id": str(user_id), "text": "Skills: Python"}
    assert (await client.get("/api/career-profile")).status_code == 404

    response = await client.post(f"{path}/abort", headers=ORIGIN_HEADERS)
    assert response.status_code == 202
    assert response.content == b""
    assert (await client.get(path)).json() == {"status": "idle", "error": None}

    response = await client.post(
        f"{path}/text", headers=ORIGIN_HEADERS, json={"text": "Skills: SQL"}
    )
    assert response.status_code == 202
    await _fail_extraction(database, user_id, TaskErrorCode.INVALID_OUTPUT)
    response = await client.post(f"{path}/retry", headers=ORIGIN_HEADERS)
    assert response.status_code == 202
    assert response.content == b""
    assert (await client.get(path)).json() == {"status": "queued", "error": None}


@pytest.mark.parametrize(
    ("code", "message"),
    [
        (TaskErrorCode.INVALID_OUTPUT, "Unable to complete the task."),
        (TaskErrorCode.INTERNAL_ERROR, "Unable to complete the task."),
        (TaskErrorCode.LLM_UNAVAILABLE, "LLM service is temporarily unavailable."),
        (None, "Service is temporarily unavailable. Please try again later."),
    ],
)
async def test_extraction_failure_returns_only_public_state(
    client, database, code, message
):
    registered = await register_user(client)
    response = await client.post(
        f"{EXTRACTION_PATH}/text",
        headers=ORIGIN_HEADERS,
        json={"text": "Skills: Python"},
    )
    assert response.status_code == 202
    await _fail_extraction(database, UUID(registered.json()["id"]), code)
    response = await client.get(EXTRACTION_PATH)
    assert response.status_code == 200
    assert response.json() == {
        "status": "failed",
        "error": {
            "code": (code or TaskErrorCode.SERVICE_UNAVAILABLE).value,
            "message": message,
        },
    }
    if code is None:
        response = await client.post(f"{EXTRACTION_PATH}/retry", headers=ORIGIN_HEADERS)
        assert response.status_code == 202
        assert (await client.get(EXTRACTION_PATH)).json()["status"] == "queued"


@pytest.mark.parametrize(
    "payload",
    [{"text": " \n\t "}, {"text": "Skills: Python", "file": "resume.pdf"}],
    ids=["blank-source", "unsupported-file"],
)
async def test_invalid_extraction_request_does_not_dispatch(client, database, payload):
    registered = await register_user(client)
    response = await client.post(
        f"{EXTRACTION_PATH}/text", headers=ORIGIN_HEADERS, json=payload
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request.validation_failed"
    async with database.sessionmaker() as session:
        extraction = await session.get(
            CareerProfileExtraction, UUID(registered.json()["id"])
        )
        assert extraction.job_id is None
        assert (
            await session.scalar(
                text("SELECT count(*) FROM procrastinate.procrastinate_jobs")
            )
            == 0
        )


@pytest.mark.parametrize("has_profile", [False, True], ids=["create", "update"])
async def test_manual_write_returns_conflict_during_extraction(client, has_profile):
    await register_user(client)
    if has_profile:
        response = await client.post(
            "/api/career-profile", headers=ORIGIN_HEADERS, json={"skills": ["SQL"]}
        )
        assert response.status_code == 201
    response = await client.post(
        f"{EXTRACTION_PATH}/text",
        headers=ORIGIN_HEADERS,
        json={"text": "Skills: Python"},
    )
    assert response.status_code == 202
    response = await client.request(
        "PATCH" if has_profile else "POST",
        "/api/career-profile",
        headers=ORIGIN_HEADERS,
        json={"skills": ["Manual"]},
    )
    action = "updating" if has_profile else "creating"
    assert_error_response(
        response,
        status_code=409,
        code="resource.conflict",
        message=f"Abort the active extraction before {action} the career profile.",
    )


async def test_extraction_endpoints_use_only_current_user(client, database):
    first = await register_user(client)
    response = await client.post(
        f"{EXTRACTION_PATH}/text",
        headers=ORIGIN_HEADERS,
        json={"text": "Private resume"},
    )
    assert response.status_code == 202
    first_id = UUID(first.json()["id"])
    await _fail_extraction(database, first_id, TaskErrorCode.INVALID_OUTPUT)

    second = await register_user(client, username="OtherUser")
    assert (await client.get(EXTRACTION_PATH)).json() == {
        "status": "idle",
        "error": None,
    }
    for action in ("retry", "abort"):
        response = await client.post(
            f"{EXTRACTION_PATH}/{action}", headers=ORIGIN_HEADERS
        )
        assert response.status_code == 409
    response = await client.post(
        f"{EXTRACTION_PATH}/text", headers=ORIGIN_HEADERS, json={"text": "Other resume"}
    )
    assert response.status_code == 202
    async with database.sessionmaker() as session:
        first_state = await session.get(CareerProfileExtraction, first_id)
        second_state = await session.get(
            CareerProfileExtraction, UUID(second.json()["id"])
        )
        assert first_state.error_code is TaskErrorCode.INVALID_OUTPUT
        assert first_state.job_id != second_state.job_id
        status = await session.scalar(
            text("SELECT status FROM procrastinate.procrastinate_jobs WHERE id = :id"),
            {"id": first_state.job_id},
        )
        assert status == "failed"


@pytest.mark.parametrize(
    ("method", "suffix", "payload"),
    [
        ("POST", "/text", {"text": "Skills: Python"}),
        ("GET", "", None),
        ("POST", "/retry", None),
        ("POST", "/abort", None),
    ],
)
async def test_extraction_requires_authentication(client, method, suffix, payload):
    response = await client.request(
        method, f"{EXTRACTION_PATH}{suffix}", headers=ORIGIN_HEADERS, json=payload
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "auth.not_authenticated"
