from pathlib import Path
from typing import ClassVar, Self

from typer.testing import CliRunner

import riva.cli.db as db_module
from riva.cli.main import app

DATABASE_URL = "postgresql+asyncpg://cli_user:cli_pass@localhost/cli_db"


class DatabaseDouble:
    instances: ClassVar[list[Self]] = []
    operation_error: BaseException | None = None

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url
        self.calls: list[str] = []
        type(self).instances.append(self)

    async def __aenter__(self) -> Self:
        self.calls.append("enter")
        return self

    async def __aexit__(self, *args: object) -> None:
        self.calls.append("exit")

    async def create_tables(self) -> None:
        self.calls.append("create_tables")
        if self.operation_error is not None:
            raise self.operation_error

    async def reset(self) -> None:
        self.calls.append("reset")
        if self.operation_error is not None:
            raise self.operation_error


def set_required_environment(monkeypatch) -> None:
    monkeypatch.setenv("RIVA_DATABASE_URL", DATABASE_URL)
    monkeypatch.setenv("RIVA_SESSION_DIGEST_KEY", "cli-session-digest-key")


def install_database_double(monkeypatch) -> None:
    DatabaseDouble.instances = []
    DatabaseDouble.operation_error = None
    monkeypatch.setattr(db_module, "Database", DatabaseDouble)


def test_db_setup_creates_tables(monkeypatch) -> None:
    runner = CliRunner()
    set_required_environment(monkeypatch)
    install_database_double(monkeypatch)

    result = runner.invoke(app, ["db", "setup", "-y"])

    assert result.exit_code == 0, result.output
    assert len(DatabaseDouble.instances) == 1
    database = DatabaseDouble.instances[0]
    assert database.database_url == DATABASE_URL
    assert database.calls == ["enter", "create_tables", "exit"]
    assert "Database tables created." in result.output


def test_db_reset_uses_model_managed_reset(monkeypatch) -> None:
    runner = CliRunner()
    set_required_environment(monkeypatch)
    install_database_double(monkeypatch)

    result = runner.invoke(app, ["db", "reset", "-y"])

    assert result.exit_code == 0, result.output
    assert len(DatabaseDouble.instances) == 1
    database = DatabaseDouble.instances[0]
    assert database.database_url == DATABASE_URL
    assert database.calls == ["enter", "reset", "exit"]
    assert "Database tables reset." in result.output


def test_db_setup_uses_env_file(monkeypatch, tmp_path: Path) -> None:
    runner = CliRunner()
    monkeypatch.delenv("RIVA_DATABASE_URL", raising=False)
    monkeypatch.delenv("RIVA_SESSION_DIGEST_KEY", raising=False)
    env_file = tmp_path / "riva.env"
    env_file.write_text(
        "RIVA_DATABASE_URL=postgresql+asyncpg://file_user:file_pass@localhost/file_db\n"
        "RIVA_SESSION_DIGEST_KEY=file-session-digest-key\n"
    )
    install_database_double(monkeypatch)

    result = runner.invoke(
        app,
        ["db", "setup", "--env-file", str(env_file), "-y"],
    )

    assert result.exit_code == 0, result.output
    assert DatabaseDouble.instances[0].database_url == (
        "postgresql+asyncpg://file_user:file_pass@localhost/file_db"
    )


def test_db_reset_requires_confirmation(monkeypatch) -> None:
    runner = CliRunner()
    set_required_environment(monkeypatch)
    install_database_double(monkeypatch)

    result = runner.invoke(app, ["db", "reset"], input="n\n")

    assert result.exit_code == 1
    assert DatabaseDouble.instances == []


def test_yes_skips_confirmation(monkeypatch) -> None:
    runner = CliRunner()
    set_required_environment(monkeypatch)
    install_database_double(monkeypatch)

    result = runner.invoke(app, ["db", "setup", "--yes"])

    assert result.exit_code == 0, result.output
    assert DatabaseDouble.instances[0].calls == ["enter", "create_tables", "exit"]
    assert "Continue?" not in result.output


def test_database_error_exits_with_code_one(monkeypatch) -> None:
    runner = CliRunner()
    set_required_environment(monkeypatch)
    install_database_double(monkeypatch)
    DatabaseDouble.operation_error = RuntimeError("database is unavailable")

    result = runner.invoke(app, ["db", "setup", "-y"])

    assert result.exit_code == 1
    assert "Failed to create database tables" in result.output
    assert "database is unavailable" in result.output


def test_db_only_exposes_setup_and_reset() -> None:
    result = CliRunner().invoke(app, ["db", "--help"])

    assert result.exit_code == 0, result.output
    assert "setup" in result.output
    assert "reset" in result.output
    for removed_command in (
        "upgrade",
        "downgrade",
        "revision",
        "current",
        "check",
        "stamp",
    ):
        assert removed_command not in result.output
