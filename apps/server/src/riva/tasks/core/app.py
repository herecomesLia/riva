import procrastinate
from sqlalchemy.engine import make_url

from riva.tasks.errors import TaskError

TASK_SCHEMA = "procrastinate"


app = procrastinate.App(connector=procrastinate.PsycopgConnector())


def create_task_connector(database_url: str) -> procrastinate.PsycopgConnector:
    conninfo = _to_psycopg_conninfo(database_url)
    return procrastinate.PsycopgConnector(
        conninfo=conninfo,
        kwargs={"options": f"-c search_path={TASK_SCHEMA}"},
    )


def _to_psycopg_conninfo(database_url: str) -> str:
    url = make_url(database_url)
    if url.drivername != "postgresql+psycopg":
        raise TaskError("Background tasks require a postgresql+psycopg database URL.")

    return url.set(drivername="postgresql").render_as_string(hide_password=False)
