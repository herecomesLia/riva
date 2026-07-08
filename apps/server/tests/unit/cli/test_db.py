from typer.testing import CliRunner

import riva.cli.db as db_module
from riva.cli.main import app
from tests.helpers.fakes import FakeDatabase


def patch_database(monkeypatch) -> list[FakeDatabase]:
    databases: list[FakeDatabase] = []

    def database_factory(database_url: str) -> FakeDatabase:
        database = FakeDatabase()
        database.database_urls.append(database_url)
        databases.append(database)
        return database

    monkeypatch.setattr(db_module, "Database", database_factory)
    return databases


def test_db_setup_creates_tables_without_real_database(monkeypatch) -> None:
    runner = CliRunner()
    databases = patch_database(monkeypatch)
    monkeypatch.setenv(
        "RIVA_DATABASE_URL",
        "postgresql+asyncpg://cli_user:cli_pass@localhost/cli_db",
    )
    monkeypatch.setenv("RIVA_SESSION_DIGEST_KEY", "cli-session-digest-key")

    result = runner.invoke(app, ["db", "setup", "-y"])

    assert result.exit_code == 0, result.output
    assert "Database tables created." in result.output
    assert len(databases) == 1
    database = databases[0]
    assert database.database_urls == [
        "postgresql+asyncpg://cli_user:cli_pass@localhost/cli_db"
    ]
    assert database.enter_count == 1
    assert database.create_tables_count == 1
    assert database.dispose_count == 1


def test_db_reset_resets_tables_without_real_database(monkeypatch) -> None:
    runner = CliRunner()
    databases = patch_database(monkeypatch)
    monkeypatch.setenv(
        "RIVA_DATABASE_URL",
        "postgresql+asyncpg://cli_user:cli_pass@localhost/cli_db",
    )
    monkeypatch.setenv("RIVA_SESSION_DIGEST_KEY", "cli-session-digest-key")

    result = runner.invoke(app, ["db", "reset", "-y"])

    assert result.exit_code == 0, result.output
    assert "Database tables reset." in result.output
    assert len(databases) == 1
    database = databases[0]
    assert database.enter_count == 1
    assert database.reset_count == 1
    assert database.dispose_count == 1


def test_migration_commands_are_not_available() -> None:
    runner = CliRunner()

    for command in ["upgrade", "downgrade", "revision"]:
        result = runner.invoke(app, ["db", command])

        assert result.exit_code == 1
        assert "is not available until database migrations are added" in result.output
