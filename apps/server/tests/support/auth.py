from httpx import AsyncClient, Response

from tests.support.settings import TEST_ORIGIN

DEFAULT_USERNAME = "TestUser"
DEFAULT_PASSWORD = "ValidPass123!"
ORIGIN_HEADERS = {"Origin": TEST_ORIGIN}


async def register_user(
    client: AsyncClient,
    *,
    username: str = DEFAULT_USERNAME,
    password: str = DEFAULT_PASSWORD,
) -> Response:
    response = await client.post(
        "/api/auth/register",
        headers=ORIGIN_HEADERS,
        json={"username": username, "password": password},
    )
    assert response.status_code == 201, response.text
    return response


async def login_user(
    client: AsyncClient,
    *,
    username: str = DEFAULT_USERNAME,
    password: str = DEFAULT_PASSWORD,
) -> Response:
    response = await client.post(
        "/api/auth/login",
        headers=ORIGIN_HEADERS,
        json={"username": username, "password": password},
    )
    assert response.status_code == 200, response.text
    return response
