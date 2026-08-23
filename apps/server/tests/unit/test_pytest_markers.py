import tomllib
from pathlib import Path

REQUIRED_MARKERS = {"unit", "integration"}
PYPROJECT_PATH = Path(__file__).parents[2] / "pyproject.toml"


def test_pytest_config_registers_server_test_markers() -> None:
    with PYPROJECT_PATH.open("rb") as pyproject_file:
        pytest_config = tomllib.load(pyproject_file)["tool"]["pytest"]["ini_options"]

    configured_markers = {
        marker.partition(":")[0].strip() for marker in pytest_config["markers"]
    }

    assert REQUIRED_MARKERS <= configured_markers
