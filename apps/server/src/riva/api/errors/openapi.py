from collections import defaultdict
from http import HTTPStatus
from typing import Any

from riva.api.errors.mapping import resolve_error_details, resolve_http_policy
from riva.errors import ErrorCode
from riva.schemas import ErrorResponse


def error_responses(*error_types: type[Exception]) -> dict[int, dict[str, Any]]:
    errors_by_status: dict[int, dict[ErrorCode, str]] = defaultdict(dict)
    for error_type in error_types:
        policy = resolve_http_policy(error_type)
        details = resolve_error_details(error_type)
        errors_by_status[policy.status_code][details.code] = details.message

    return {
        status_code: {
            "model": ErrorResponse,
            "description": "\n\n".join(
                (
                    HTTPStatus(status_code).phrase,
                    "Error codes:\n" + "\n".join(f"- {code.value}" for code in errors),
                )
            ),
            "content": {
                "application/json": {
                    "examples": {
                        code.value: {
                            "value": {
                                "error": {
                                    "code": code.value,
                                    "message": message,
                                }
                            }
                        }
                        for code, message in errors.items()
                    }
                }
            },
        }
        for status_code, errors in errors_by_status.items()
    }
