import pytest

from riva.tasks import app
from riva.tasks.core.app import create_task_connector


@pytest.fixture
async def task_database(extraction_database):
    url = extraction_database.engine.url.render_as_string(hide_password=False)
    with app.replace_connector(create_task_connector(url)):
        async with app.open_async():
            yield extraction_database
