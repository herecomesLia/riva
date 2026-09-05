from unittest.mock import Mock

import procrastinate
import pytest

from riva.tasks import TaskError, get_task_resources


@pytest.mark.parametrize("additional_context", [{}, {"resources": None}])
def test_get_task_resources_rejects_missing_or_invalid_resources(
    additional_context: dict,
) -> None:
    context = Mock(spec=procrastinate.JobContext, additional_context=additional_context)

    with pytest.raises(TaskError, match="Riva task resources are missing or invalid"):
        get_task_resources(context)
