from collections.abc import Sequence
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from testcontainers.community.postgres import PostgresContainer
from xdist.workermanage import WorkerController

_POSTGRES_URL_FILE = pytest.StashKey[Path]()


def _start_postgres(config: pytest.Config) -> str:
    postgres = PostgresContainer("postgres:18-alpine", driver="psycopg")
    config.add_cleanup(postgres.stop)
    postgres.start()
    return postgres.get_connection_url()


def pytest_configure_node(node: WorkerController) -> None:
    config = node.config
    if _POSTGRES_URL_FILE not in config.stash:
        directory = TemporaryDirectory(prefix="riva-pytest-")
        config.add_cleanup(directory.cleanup)
        config.stash[_POSTGRES_URL_FILE] = Path(directory.name) / "postgres-url"
    node.workerinput["postgres_url_file"] = str(config.stash[_POSTGRES_URL_FILE])


def pytest_xdist_node_collection_finished(
    node: WorkerController, ids: Sequence[str]
) -> None:
    # This hook runs before xdist schedules tests. Local workers share the file.
    url_file = node.config.stash[_POSTGRES_URL_FILE]
    if not url_file.exists() and any(
        node_id.startswith("tests/integration/") for node_id in ids
    ):
        url_file.write_text(_start_postgres(node.config))


@pytest.fixture(scope="session")
def postgres_url(request: pytest.FixtureRequest) -> str:
    if hasattr(request.config, "workerinput"):
        return Path(request.config.workerinput["postgres_url_file"]).read_text()
    return _start_postgres(request.config)
