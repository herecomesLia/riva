import procrastinate
from sqlalchemy.engine import make_url

TASK_SCHEMA = "procrastinate"


def create_task_app(database_url: str) -> procrastinate.App:
    conninfo = _to_psycopg_conninfo(database_url)
    connector = procrastinate.PsycopgConnector(
        conninfo=conninfo,
        kwargs={"options": f"-c search_path={TASK_SCHEMA}"},
    )
    return procrastinate.App(connector=connector)


def _to_psycopg_conninfo(database_url: str) -> str:
    url = make_url(database_url)
    if url.drivername != "postgresql+psycopg":
        raise ValueError("Background tasks require a postgresql+psycopg database URL.")

    return url.set(drivername="postgresql").render_as_string(hide_password=False)
