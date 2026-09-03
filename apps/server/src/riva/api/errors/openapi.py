from collections import defaultdict
from http import HTTPStatus
from typing import Any

from riva.api.errors.mapping import resolve_error_details, resolve_http_policy
from riva.errors import AppError, ErrorCode
from riva.schemas import ErrorResponse


def error_responses(*error_types: type[Exception]) -> dict[int, dict[str, Any]]:
    errors_by_status: dict[int, set[ErrorCode]] = defaultdict(set)
    for error_type in error_types:
        policy = resolve_http_policy(error_type)
        if isinstance(error_type, type) and issubclass(error_type, AppError):
            code = error_type.code
        else:
            code = resolve_error_details(error_type).code
        errors_by_status[policy.status_code].add(code)

    return {
        status_code: {
            "model": ErrorResponse,
            "description": "\n\n".join(
                (
                    HTTPStatus(status_code).phrase,
                    "Error codes:\n"
                    + "\n".join(f"- {code.value}" for code in sorted(errors)),
                )
            ),
        }
        for status_code, errors in errors_by_status.items()
    }
