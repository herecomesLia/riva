from types import SimpleNamespace

from riva.schemas.base import APIModel


class ExampleResponse(APIModel):
    display_name: str
    avatar_url: str | None


class TestAPIModelAlias:
    def test_serialize_by_alias(self) -> None:
        response = ExampleResponse(
            display_name="Lia",
            avatar_url=None,
        )

        assert response.model_dump() == {
            "displayName": "Lia",
            "avatarUrl": None,
        }

    def test_validate_by_alias(self) -> None:
        response = ExampleResponse.model_validate(
            {
                "displayName": "Lia",
                "avatarUrl": None,
            }
        )

        assert response.display_name == "Lia"
        assert response.avatar_url is None

    def test_validate_by_name(self) -> None:
        response = ExampleResponse.model_validate(
            {
                "display_name": "Lia",
                "avatar_url": None,
            }
        )

        assert response.display_name == "Lia"
        assert response.avatar_url is None

    def test_from_attributes(self) -> None:
        source = SimpleNamespace(
            display_name="Lia",
            avatar_url=None,
        )

        response = ExampleResponse.model_validate(source)

        assert response.display_name == "Lia"
        assert response.avatar_url is None
