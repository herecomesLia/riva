from collections.abc import Callable
from contextlib import redirect_stdout
from io import StringIO

import pytest
from alembic import command
from alembic.runtime.environment import EnvironmentContext

from riva.db import migrations


DATABASE_URL = "postgresql+asyncpg://user:password@localhost:5432/riva"


def test_config_uses_package_script_location_and_attributes_only() -> None:
    config = migrations.create_config(DATABASE_URL)

    assert config.get_main_option("script_location") == "riva:migrations"
    assert config.get_main_option("sqlalchemy.url") is None
    assert config.attributes["database_url"] == DATABASE_URL


@pytest.mark.parametrize(
    ("name", "invoke"),
    [
        ("upgrade", lambda: migrations.upgrade(DATABASE_URL, "202608160001")),
        ("downgrade", lambda: migrations.downgrade(DATABASE_URL, "base")),
        ("current", lambda: migrations.current(DATABASE_URL)),
        ("check", lambda: migrations.check(DATABASE_URL)),
        ("stamp", lambda: migrations.stamp(DATABASE_URL, "head")),
    ],
)
def test_commands_forward_config_and_arguments(
    monkeypatch,
    name: str,
    invoke: Callable[[], None],
) -> None:
    calls: list[tuple[object, tuple[object, ...], dict[str, object]]] = []

    def command_double(config, *args: object, **kwargs: object) -> None:
        calls.append((config, args, kwargs))

    monkeypatch.setattr(migrations.command, name, command_double)

    invoke()

    assert len(calls) == 1
    config, args, kwargs = calls[0]
    assert config.get_main_option("script_location") == "riva:migrations"
    assert config.attributes["database_url"] == DATABASE_URL
    if name == "upgrade":
        assert args == ("202608160001",)
    elif name == "downgrade":
        assert args == ("base",)
    elif name == "stamp":
        assert args == ("head",)
    else:
        assert args == ()
    assert kwargs == {}


def test_revision_forwards_message_and_autogenerate(monkeypatch) -> None:
    calls: list[tuple[object, tuple[object, ...], dict[str, object]]] = []

    def revision_double(config, *args: object, **kwargs: object) -> None:
        calls.append((config, args, kwargs))

    monkeypatch.setattr(migrations.command, "revision", revision_double)

    migrations.revision(DATABASE_URL, "add interview tables")
    migrations.revision(DATABASE_URL, "manual marker", autogenerate=False)

    assert len(calls) == 2
    assert calls[0][1] == ()
    assert calls[0][2] == {"message": "add interview tables", "autogenerate": True}
    assert calls[1][1] == ()
    assert calls[1][2] == {"message": "manual marker", "autogenerate": False}


def test_offline_migration_context_excludes_checkconstraint_byname(monkeypatch) -> None:
    configure_calls: list[dict[str, object]] = []
    original_configure = EnvironmentContext.configure

    def configure_spy(self, *args: object, **kwargs: object) -> None:
        configure_calls.append(kwargs.copy())
        original_configure(self, *args, **kwargs)

    monkeypatch.setattr(EnvironmentContext, "configure", configure_spy)
    with redirect_stdout(StringIO()):
        command.upgrade(
            migrations.create_config(DATABASE_URL),
            "head",
            sql=True,
        )

    assert len(configure_calls) == 1
    assert configure_calls[0]["target_metadata"] is not None
    assert configure_calls[0]["compare_type"] is True
    assert configure_calls[0]["compare_server_default"] is True
    assert configure_calls[0]["autogenerate_plugins"] == [
        "alembic.autogenerate.*",
        "~alembic.autogenerate.checkconstraint_byname",
    ]
