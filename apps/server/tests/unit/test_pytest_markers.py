import warnings

import pytest


REQUIRED_MARKERS = {"unit", "integration", "migration", "eval", "slow"}


def test_pytest_config_registers_server_test_markers(pytestconfig) -> None:
    configured_markers = {
        marker.partition(":")[0].strip()
        for marker in pytestconfig.getini("markers")
    }

    assert REQUIRED_MARKERS <= configured_markers


@pytest.mark.parametrize("marker_name", sorted(REQUIRED_MARKERS))
def test_registered_markers_do_not_emit_unknown_mark_warning(
    marker_name: str,
) -> None:
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        getattr(pytest.mark, marker_name)

    assert not any(
        isinstance(item.message, pytest.PytestUnknownMarkWarning)
        for item in caught
    )


def test_unit_directory_tests_receive_unit_marker(request) -> None:
    assert request.node.get_closest_marker("unit") is not None
