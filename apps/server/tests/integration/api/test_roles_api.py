from typing import Any
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from riva.db import Database
from riva.models.role import Role
from riva.services.job_descriptions import JobDescriptionService
from riva.tasks import TaskErrorCode
from tests.support.assertions import assert_error_response
from tests.support.auth import ORIGIN_HEADERS, register_user


async def _create_role(
    client: AsyncClient,
    title: str,
    **fields: object,
) -> dict[str, Any]:
    response = await client.post(
        "/api/roles",
        headers=ORIGIN_HEADERS,
        json={"title": title, **fields},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_role_http_lifecycle_covers_all_endpoints(
    client: AsyncClient,
) -> None:
    await register_user(client)
    first = await _create_role(
        client,
        "Backend Engineer",
        company="Example Corp",
        recruitmentTrack="experienced",
        location="Remote",
    )
    second = await _create_role(client, "Platform Engineer")

    update_response = await client.patch(
        f"/api/roles/{first['id']}",
        headers=ORIGIN_HEADERS,
        json={"company": None},
    )
    assert update_response.status_code == 200
    assert update_response.json()["company"] is None

    jd_payload = {
        "responsibilities": ["Build APIs"],
        "requirements": {"experience": ["Three years"]},
        "hardSkills": {"programmingLanguages": ["Python"]},
        "softSkills": ["Communication"],
        "preferredQualifications": ["Cloud experience"],
        "businessDomains": ["SaaS"],
    }
    jd_response = await client.patch(
        f"/api/roles/{first['id']}/jd",
        headers=ORIGIN_HEADERS,
        json=jd_payload,
    )
    assert jd_response.status_code == 200
    assert jd_response.json()["jd"]["hardSkills"]["programmingLanguages"] == ["Python"]

    list_response = await client.get("/api/roles")
    assert list_response.status_code == 200
    body = list_response.json()
    assert body["activeRoleId"] is None
    returned_first = next(role for role in body["roles"] if role["id"] == first["id"])
    assert returned_first["jd"]["responsibilities"] == ["Build APIs"]
    assert returned_first["jd"]["requirements"]["experience"] == ["Three years"]
    assert "userId" not in returned_first
    assert "roleId" not in returned_first["jd"]

    active_response = await client.put(
        "/api/roles/active",
        headers=ORIGIN_HEADERS,
        json={"roleId": first["id"]},
    )
    assert active_response.status_code == 204

    switch_response = await client.put(
        "/api/roles/active",
        headers=ORIGIN_HEADERS,
        json={"roleId": second["id"]},
    )
    assert switch_response.status_code == 204

    archive_response = await client.post(
        f"/api/roles/{first['id']}/archive",
        headers=ORIGIN_HEADERS,
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["isArchived"] is True

    restore_response = await client.post(
        f"/api/roles/{first['id']}/restore",
        headers=ORIGIN_HEADERS,
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["isArchived"] is False

    delete_response = await client.delete(
        f"/api/roles/{first['id']}",
        headers=ORIGIN_HEADERS,
    )
    assert delete_response.status_code == 204


async def test_archiving_active_role_clears_active_role_and_archived_role_cannot_activate(
    client: AsyncClient,
) -> None:
    await register_user(client)
    active = await _create_role(client, "Active")
    archived = await _create_role(client, "Archived")
    response = await client.put(
        "/api/roles/active",
        headers=ORIGIN_HEADERS,
        json={"roleId": active["id"]},
    )
    assert response.status_code == 204

    response = await client.post(
        f"/api/roles/{active['id']}/archive",
        headers=ORIGIN_HEADERS,
    )
    assert response.status_code == 200

    response = await client.get("/api/roles")
    assert response.status_code == 200
    assert response.json()["activeRoleId"] is None

    response = await client.post(
        f"/api/roles/{archived['id']}/archive",
        headers=ORIGIN_HEADERS,
    )
    assert response.status_code == 200
    response = await client.put(
        "/api/roles/active",
        headers=ORIGIN_HEADERS,
        json={"roleId": archived["id"]},
    )
    assert_error_response(
        response,
        status_code=409,
        code="resource.conflict",
        message="An archived target role cannot be activated.",
    )


async def test_cross_user_role_access_is_not_found(
    client: AsyncClient,
) -> None:
    await register_user(client)
    role = await _create_role(client, "Private")
    await register_user(client, username="OtherUser")

    response = await client.patch(
        f"/api/roles/{role['id']}",
        headers=ORIGIN_HEADERS,
        json={"location": None},
    )

    assert_error_response(
        response,
        status_code=404,
        code="resource.not_found",
        message="Target role was not found.",
    )


async def test_jd_patch_rejects_active_extraction(
    client: AsyncClient, database: Database
) -> None:
    await register_user(client)
    role = await _create_role(client, "Engineer")
    async with database.sessionmaker() as session:
        stored = await session.get(Role, UUID(role["id"]))
        await JobDescriptionService(session).extract_text(stored, text="Build APIs")
    response = await client.patch(
        f"/api/roles/{role['id']}/jd",
        headers=ORIGIN_HEADERS,
        json={"responsibilities": ["Manual"]},
    )
    assert_error_response(
        response,
        status_code=409,
        code="resource.conflict",
        message="Abort the active extraction before updating the JD.",
    )


async def _fail_extraction(
    database: Database, role_id: str, code: TaskErrorCode
) -> None:
    async with database.sessionmaker() as session:
        role = await session.get(Role, UUID(role_id))
        assert role is not None
        role.jd.extraction_error_code = code
        # The job status triggers need Procrastinate's schema on the search path.
        search_path = await session.scalar(text("SHOW search_path"))
        await session.execute(text("SET LOCAL search_path TO procrastinate, public"))
        await session.execute(
            text("UPDATE procrastinate_jobs SET status = 'failed' WHERE id = :id"),
            {"id": role.jd.extraction_job_id},
        )
        await session.execute(
            text("SELECT set_config('search_path', :path, true)"),
            {"path": search_path},
        )
        await session.commit()


async def test_jd_extraction_http_lifecycle(
    client: AsyncClient, database: Database
) -> None:
    await register_user(client)
    role = await _create_role(client, "Engineer")
    path = f"/api/roles/{role['id']}/jd/extraction"

    response = await client.post(f"{path}/retry", headers=ORIGIN_HEADERS)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "resource.conflict"

    response = await client.post(
        f"{path}/text", headers=ORIGIN_HEADERS, json={"text": "Build APIs"}
    )
    assert response.status_code == 202
    response = await client.get(path)
    assert response.status_code == 200
    assert response.json()["status"] == "queued"

    response = await client.post(f"{path}/abort", headers=ORIGIN_HEADERS)
    assert response.status_code == 202
    response = await client.get(path)
    assert response.json()["status"] == "idle"

    response = await client.post(
        f"{path}/text", headers=ORIGIN_HEADERS, json={"text": "Maintain APIs"}
    )
    assert response.status_code == 202
    await _fail_extraction(database, role["id"], TaskErrorCode.INVALID_OUTPUT)
    response = await client.post(f"{path}/retry", headers=ORIGIN_HEADERS)
    assert response.status_code == 202
    response = await client.get(path)
    assert response.json()["status"] == "queued"


@pytest.mark.parametrize(
    ("code", "message"),
    [
        (TaskErrorCode.INVALID_OUTPUT, "Unable to complete the task."),
        (TaskErrorCode.INTERNAL_ERROR, "Unable to complete the task."),
        (TaskErrorCode.LLM_UNAVAILABLE, "LLM service is temporarily unavailable."),
    ],
)
async def test_jd_failure_is_returned_as_state_with_public_message(
    client: AsyncClient, database: Database, code: TaskErrorCode, message: str
) -> None:
    await register_user(client)
    role = await _create_role(client, "Engineer")
    async with database.sessionmaker() as session:
        stored = await session.get(Role, UUID(role["id"]))
        await JobDescriptionService(session).extract_text(stored, text="Build APIs")
    await _fail_extraction(database, role["id"], code)

    response = await client.get(f"/api/roles/{role['id']}/jd/extraction")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["error"]["code"] == code.value
    assert body["error"]["message"] == message


@pytest.mark.parametrize(
    ("method", "suffix", "payload"),
    [
        ("POST", "/text", {"text": "Build APIs"}),
        ("GET", "", None),
        ("POST", "/retry", None),
        ("POST", "/abort", None),
    ],
)
async def test_jd_extraction_hides_other_users_roles(
    client: AsyncClient, method: str, suffix: str, payload: dict[str, str] | None
) -> None:
    await register_user(client)
    role = await _create_role(client, "Private")
    await register_user(client, username="OtherUser")

    response = await client.request(
        method,
        f"/api/roles/{role['id']}/jd/extraction{suffix}",
        headers=ORIGIN_HEADERS,
        json=payload,
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "resource.not_found"
