from pathlib import Path

from typer.testing import CliRunner

import riva.cli.db as db_module
from riva.cli.main import app


DATABASE_URL = "postgresql+asyncpg://cli_user:cli_pass@localhost/cli_db"


def set_required_environment(monkeypatch) -> None:
    monkeypatch.setenv("RIVA_DATABASE_URL", DATABASE_URL)
    monkeypatch.setenv("RIVA_SESSION_DIGEST_KEY", "cli-session-digest-key")


def test_db_setup_upgrades_to_head(monkeypatch) -> None:
    runner = CliRunner()
    set_required_environment(monkeypatch)
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(
        db_module.migrations,
        "upgrade",
        lambda url, revision="head": calls.append((url, revision)),
    )

    result = runner.invoke(app, ["db", "setup", "-y"])

    assert result.exit_code == 0, result.output
    assert calls == [(DATABASE_URL, "head")]
    assert "Database upgraded to head." in result.output


def test_db_reset_downgrades_then_upgrades_through_migrations(monkeypatch) -> None:
    runner = CliRunner()
    set_required_environment(monkeypatch)
    calls: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        db_module.migrations,
        "downgrade",
        lambda url, revision="-1": calls.append(("downgrade", url, revision)),
    )
    monkeypatch.setattr(
        db_module.migrations,
        "upgrade",
        lambda url, revision="head": calls.append(("upgrade", url, revision)),
    )

    result = runner.invoke(app, ["db", "reset", "-y"])

    assert result.exit_code == 0, result.output
    assert calls == [
        ("downgrade", DATABASE_URL, "base"),
        ("upgrade", DATABASE_URL, "head"),
    ]
    assert "Database reset through migrations." in result.output


def test_migration_commands_forward_revision_message_and_env_file(
    monkeypatch,
    tmp_path: Path,
) -> None:
    runner = CliRunner()
    env_file = tmp_path / "riva.env"
    env_file.write_text(
        "RIVA_DATABASE_URL=postgresql+asyncpg://file_user:file_pass@localhost/file_db\n"
        "RIVA_SESSION_DIGEST_KEY=file-session-digest-key\n"
    )
    file_database_url = "postgresql+asyncpg://file_user:file_pass@localhost/file_db"
    calls: list[tuple[object, ...]] = []
    monkeypatch.setattr(
        db_module.migrations,
        "upgrade",
        lambda url, revision="head": calls.append(("upgrade", url, revision)),
    )
    monkeypatch.setattr(
        db_module.migrations,
        "downgrade",
        lambda url, revision="-1": calls.append(("downgrade", url, revision)),
    )
    monkeypatch.setattr(
        db_module.migrations,
        "revision",
        lambda url, message, *, autogenerate=True: calls.append(
            ("revision", url, message, autogenerate)
        ),
    )
    monkeypatch.setattr(
        db_module.migrations,
        "current",
        lambda url: calls.append(("current", url)),
    )
    monkeypatch.setattr(
        db_module.migrations,
        "check",
        lambda url: calls.append(("check", url)),
    )

    commands = [
        ["db", "upgrade", "--revision", "202608160001", "--env-file", str(env_file)],
        ["db", "downgrade", "--revision", "base", "--env-file", str(env_file)],
        ["db", "revision", "add interview tables", "--env-file", str(env_file)],
        ["db", "revision", "manual marker", "--empty", "--env-file", str(env_file)],
        ["db", "current", "--env-file", str(env_file)],
        ["db", "check", "--env-file", str(env_file)],
    ]
    results = [runner.invoke(app, command) for command in commands]

    assert all(result.exit_code == 0 for result in results), [
        result.output for result in results
    ]
    assert calls == [
        ("upgrade", file_database_url, "202608160001"),
        ("downgrade", file_database_url, "base"),
        ("revision", file_database_url, "add interview tables", True),
        ("revision", file_database_url, "manual marker", False),
        ("current", file_database_url),
        ("check", file_database_url),
    ]


def test_stamp_forwards_revision_after_explicit_confirmation(monkeypatch) -> None:
    runner = CliRunner()
    set_required_environment(monkeypatch)
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(
        db_module.migrations,
        "stamp",
        lambda url, revision="head": calls.append((url, revision)),
    )

    cancelled = runner.invoke(app, ["db", "stamp"], input="n\n")
    result = runner.invoke(
        app,
        ["db", "stamp", "--revision", "202608160001", "-y"],
    )

    assert cancelled.exit_code == 1
    assert "does not execute" in cancelled.output
    assert result.exit_code == 0, result.output
    assert calls == [(DATABASE_URL, "202608160001")]


def test_reset_requires_confirmation(monkeypatch) -> None:
    runner = CliRunner()
    set_required_environment(monkeypatch)
    monkeypatch.setattr(
        db_module.migrations,
        "downgrade",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("reset should not run after cancellation")
        ),
    )

    result = runner.invoke(app, ["db", "reset"], input="n\n")

    assert result.exit_code == 1
    assert "drops" not in result.output


def test_migration_error_exits_with_code_one(monkeypatch) -> None:
    runner = CliRunner()
    set_required_environment(monkeypatch)
    monkeypatch.setattr(
        db_module.migrations,
        "upgrade",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            RuntimeError("database is unavailable")
        ),
    )

    result = runner.invoke(app, ["db", "upgrade"])

    assert result.exit_code == 1
    assert "Failed to upgrade database migrations" in result.output
    assert "database is unavailable" in result.output
