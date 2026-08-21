from alembic import command
from alembic.config import Config

MIGRATION_SCRIPT_LOCATION = "riva:migrations"


def create_config(database_url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", MIGRATION_SCRIPT_LOCATION)
    config.attributes["database_url"] = database_url
    return config


def upgrade(database_url: str, revision: str = "head") -> None:
    command.upgrade(create_config(database_url), revision)


def downgrade(database_url: str, revision: str = "-1") -> None:
    command.downgrade(create_config(database_url), revision)


def revision(
    database_url: str,
    message: str,
    *,
    autogenerate: bool = True,
) -> None:
    command.revision(
        create_config(database_url),
        message=message,
        autogenerate=autogenerate,
    )


def current(database_url: str) -> None:
    command.current(create_config(database_url))


def check(database_url: str) -> None:
    command.check(create_config(database_url))


def stamp(database_url: str, revision: str = "head") -> None:
    command.stamp(create_config(database_url), revision)


__all__ = [
    "MIGRATION_SCRIPT_LOCATION",
    "check",
    "create_config",
    "current",
    "downgrade",
    "revision",
    "stamp",
    "upgrade",
]
