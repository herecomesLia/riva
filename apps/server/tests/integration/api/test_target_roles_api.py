from typing import Any

from httpx import AsyncClient

from tests.support.assertions import assert_error_response
from tests.support.auth import ORIGIN_HEADERS, register_user


async def _create_role(
    client: AsyncClient,
    title: str,
    **fields: object,
) -> dict[str, Any]:
    response = await client.post(
        "/api/target-roles",
        headers=ORIGIN_HEADERS,
        json={"title": title, **fields},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_target_role_http_lifecycle_covers_all_endpoints(
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
        f"/api/target-roles/{first['id']}",
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
        f"/api/target-roles/{first['id']}/jd",
        headers=ORIGIN_HEADERS,
        json=jd_payload,
    )
    assert jd_response.status_code == 200
    assert jd_response.json()["jd"]["hardSkills"]["programmingLanguages"] == ["Python"]

    list_response = await client.get("/api/target-roles")
    assert list_response.status_code == 200
    body = list_response.json()
    assert body["activeTargetRoleId"] is None
    returned_first = next(
        role for role in body["targetRoles"] if role["id"] == first["id"]
    )
    assert returned_first["jd"]["responsibilities"] == ["Build APIs"]
    assert returned_first["jd"]["requirements"]["experience"] == ["Three years"]
    assert "userId" not in returned_first
    assert "targetRoleId" not in returned_first["jd"]

    active_response = await client.put(
        "/api/target-roles/active",
        headers=ORIGIN_HEADERS,
        json={"targetRoleId": first["id"]},
    )
    assert active_response.status_code == 204

    switch_response = await client.put(
        "/api/target-roles/active",
        headers=ORIGIN_HEADERS,
        json={"targetRoleId": second["id"]},
    )
    assert switch_response.status_code == 204

    archive_response = await client.post(
        f"/api/target-roles/{first['id']}/archive",
        headers=ORIGIN_HEADERS,
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["isArchived"] is True

    restore_response = await client.post(
        f"/api/target-roles/{first['id']}/restore",
        headers=ORIGIN_HEADERS,
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["isArchived"] is False

    delete_response = await client.delete(
        f"/api/target-roles/{first['id']}",
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
        "/api/target-roles/active",
        headers=ORIGIN_HEADERS,
        json={"targetRoleId": active["id"]},
    )
    assert response.status_code == 204

    response = await client.post(
        f"/api/target-roles/{active['id']}/archive",
        headers=ORIGIN_HEADERS,
    )
    assert response.status_code == 200

    response = await client.get("/api/target-roles")
    assert response.status_code == 200
    assert response.json()["activeTargetRoleId"] is None

    response = await client.post(
        f"/api/target-roles/{archived['id']}/archive",
        headers=ORIGIN_HEADERS,
    )
    assert response.status_code == 200
    response = await client.put(
        "/api/target-roles/active",
        headers=ORIGIN_HEADERS,
        json={"targetRoleId": archived["id"]},
    )
    assert_error_response(
        response,
        status_code=409,
        code="resource.conflict",
        message="An archived target role cannot be activated.",
    )


async def test_cross_user_target_role_access_is_not_found(
    client: AsyncClient,
) -> None:
    await register_user(client)
    role = await _create_role(client, "Private")
    await register_user(client, username="OtherUser")

    response = await client.patch(
        f"/api/target-roles/{role['id']}",
        headers=ORIGIN_HEADERS,
        json={"location": None},
    )

    assert_error_response(
        response,
        status_code=404,
        code="resource.not_found",
        message="Target role was not found.",
    )
