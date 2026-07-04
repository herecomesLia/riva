from fastapi import FastAPI

from riva.core.config import Settings

from tests.helpers.fakes import FakeDatabase


def create_test_app(
    monkeypatch,
    settings: Settings,
    database: FakeDatabase,
) -> FastAPI:
    import riva.core.app as app_module

    def database_factory(database_url: str) -> FakeDatabase:
        database.database_urls.append(database_url)
        return database

    monkeypatch.setattr(app_module, "Database", database_factory)
    return app_module.create_app(settings)
