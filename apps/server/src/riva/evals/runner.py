from __future__ import annotations

import json
from collections.abc import Iterable, Mapping, Sequence
from numbers import Real
from pathlib import Path
from typing import Any

from riva.evals.models import (
    AgentEvalAssertion,
    AgentEvalCase,
    AgentEvalCaseResult,
    AgentEvalRunResult,
    ContainsAllAssertion,
    ContainsAssertion,
    ExactAssertion,
    ItemCountAssertion,
    NotContainsAssertion,
    NumberRangeAssertion,
)
from riva.evals.registry import AgentEvalRegistry, UnknownAgentError
from riva.integrations import LLMProvider


_MISSING = object()


class AgentEvalRunner:
    def __init__(
        self,
        provider: LLMProvider,
        model: str,
        registry: AgentEvalRegistry,
    ) -> None:
        if not model.strip():
            raise ValueError("eval model must not be empty")
        self.provider = provider
        self.model = model
        self.registry = registry

    async def run_case(self, case: AgentEvalCase) -> AgentEvalCaseResult:
        try:
            registration = self.registry.get(case.agent_id)
        except UnknownAgentError as error:
            return _failed_case(case, [str(error)])

        if case.prompt_version != registration.prompt_version:
            return _failed_case(
                case,
                [
                    "promptVersion mismatch: "
                    f"case={case.prompt_version!r}, "
                    f"current={registration.prompt_version!r}"
                ],
            )

        try:
            validated_input = registration.input_schema.model_validate(case.input)
        except Exception as error:
            return _failed_case(
                case,
                [_exception_message("input schema validation failed", error)],
            )

        try:
            agent = registration.agent_factory(self.provider, self.model)
            result = await agent.run(validated_input)
            output = result.output.model_dump(mode="json", by_alias=True)
        except Exception as error:
            return _failed_case(
                case,
                [_exception_message("agent execution failed", error)],
            )

        failures: list[str] = []
        if result.agent_id != registration.agent_id:
            failures.append(
                "AgentResult agentId mismatch: "
                f"expected={registration.agent_id!r}, actual={result.agent_id!r}"
            )
        if result.prompt_id != registration.prompt_id:
            failures.append(
                "AgentResult promptId mismatch: "
                f"expected={registration.prompt_id!r}, actual={result.prompt_id!r}"
            )
        if result.prompt_version != registration.prompt_version:
            failures.append(
                "AgentResult promptVersion mismatch: "
                f"expected={registration.prompt_version!r}, "
                f"actual={result.prompt_version!r}"
            )

        for index, assertion in enumerate(case.assertions):
            failure = _evaluate_assertion(output, assertion, index)
            if failure is not None:
                failures.append(failure)

        return AgentEvalCaseResult(
            caseId=case.id,
            agentId=case.agent_id,
            promptVersion=case.prompt_version,
            passed=not failures,
            failedAssertions=failures,
            inputTokens=result.usage.input_tokens,
            outputTokens=result.usage.output_tokens,
        )

    async def run_cases(
        self,
        cases: Iterable[AgentEvalCase],
        agent_id: str | None = None,
    ) -> AgentEvalRunResult:
        if agent_id is not None:
            self.registry.get(agent_id)

        selected_cases = sorted(
            (
                case
                for case in cases
                if agent_id is None or case.agent_id == agent_id
            ),
            key=lambda case: case.id,
        )
        results = [await self.run_case(case) for case in selected_cases]
        passed = sum(result.passed for result in results)
        input_tokens = sum(result.input_tokens for result in results)
        output_tokens = sum(result.output_tokens for result in results)
        total = len(results)
        return AgentEvalRunResult(
            agentId=agent_id or "all",
            total=total,
            passed=passed,
            failed=total - passed,
            passRate=passed / total if total else 0.0,
            inputTokens=input_tokens,
            outputTokens=output_tokens,
            cases=results,
        )


def load_eval_cases(path: str | Path) -> list[AgentEvalCase]:
    """Load one case file or all JSON case files below a directory."""

    root = Path(path)
    if root.is_file():
        if root.suffix.lower() != ".json":
            raise ValueError(f"Eval case file must have a .json suffix: {root}")
        files = [root]
    elif root.is_dir():
        files = sorted(
            (candidate for candidate in root.rglob("*.json") if candidate.is_file()),
            key=lambda candidate: candidate.as_posix(),
        )
        if not files:
            raise ValueError(f"Eval case directory is empty: {root}")
    else:
        raise ValueError(f"Eval case path does not exist: {root}")

    cases: list[AgentEvalCase] = []
    seen_ids: set[str] = set()
    for file_path in files:
        try:
            raw = json.loads(file_path.read_text())
        except json.JSONDecodeError as error:
            raise ValueError(
                f"Malformed eval case JSON: {file_path}: {error}"
            ) from error
        except (OSError, UnicodeError) as error:
            raise ValueError(
                f"Unable to read eval case: {file_path}: {error}"
            ) from error

        try:
            case = AgentEvalCase.model_validate(raw)
        except Exception as error:
            raise ValueError(f"Invalid eval case {file_path}: {error}") from error
        if case.id in seen_ids:
            raise ValueError(f"Duplicate eval case id: {case.id}")
        seen_ids.add(case.id)
        cases.append(case)

    return cases


def _failed_case(case: AgentEvalCase, failures: list[str]) -> AgentEvalCaseResult:
    return AgentEvalCaseResult(
        caseId=case.id,
        agentId=case.agent_id,
        promptVersion=case.prompt_version,
        passed=False,
        failedAssertions=failures,
    )


def _exception_message(prefix: str, error: Exception) -> str:
    detail = str(error).strip()
    if detail:
        return f"{prefix}: {type(error).__name__}: {detail}"
    return f"{prefix}: {type(error).__name__}"


def _evaluate_assertion(
    output: object,
    assertion: AgentEvalAssertion,
    index: int,
) -> str | None:
    actual = _resolve_json_pointer(output, assertion.path)
    if actual is _MISSING:
        return _assertion_failure(
            index,
            assertion,
            "path is missing",
        )

    if isinstance(assertion, ExactAssertion):
        passed = _json_equal(actual, assertion.expected)
        detail = f"expected exact value {assertion.expected!r}, got {actual!r}"
    elif isinstance(assertion, ContainsAssertion):
        passed = _contains(actual, assertion.expected)
        detail = f"expected value containing {assertion.expected!r}, got {actual!r}"
    elif isinstance(assertion, ContainsAllAssertion):
        passed = _contains_all(actual, assertion.expected)
        detail = f"expected all values {assertion.expected!r}, got {actual!r}"
    elif isinstance(assertion, NotContainsAssertion):
        passed = _not_contains(actual, assertion.forbidden)
        detail = f"forbidden values {assertion.forbidden!r} found in {actual!r}"
    elif isinstance(assertion, ItemCountAssertion):
        passed, detail = _item_count_result(actual, assertion)
    elif isinstance(assertion, NumberRangeAssertion):
        passed, detail = _number_range_result(actual, assertion)
    else:
        return _assertion_failure(index, assertion, "unsupported assertion")

    if passed:
        return None
    return _assertion_failure(index, assertion, detail)


def _assertion_failure(
    index: int,
    assertion: AgentEvalAssertion,
    detail: str,
) -> str:
    return (
        f"assertion[{index}] {assertion.operator} at {assertion.path}: {detail}"
    )


def _resolve_json_pointer(document: object, path: str) -> object:
    current = document
    for raw_token in path.split("/")[1:]:
        token = raw_token.replace("~1", "/").replace("~0", "~")
        if isinstance(current, Mapping):
            if token not in current:
                return _MISSING
            current = current[token]
        elif isinstance(current, list):
            if not token.isdigit():
                return _MISSING
            index = int(token)
            if index >= len(current):
                return _MISSING
            current = current[index]
        else:
            return _MISSING
    return current


def _json_equal(actual: object, expected: object) -> bool:
    if isinstance(actual, bool) or isinstance(expected, bool):
        return type(actual) is type(expected) and actual == expected
    if isinstance(actual, Real) and isinstance(expected, Real):
        return actual == expected
    return type(actual) is type(expected) and actual == expected


def _contains(actual: object, expected: object) -> bool:
    if isinstance(actual, (str, list, dict)):
        try:
            return expected in actual
        except TypeError:
            return False
    return False


def _contains_all(actual: object, expected: Sequence[object]) -> bool:
    return all(_contains(actual, value) for value in expected)


def _not_contains(actual: object, forbidden: Sequence[object]) -> bool:
    return not any(_contains(actual, value) for value in forbidden)


def _item_count_result(
    actual: object,
    assertion: ItemCountAssertion,
) -> tuple[bool, str]:
    if not isinstance(actual, (str, list, dict)):
        return False, f"expected a countable JSON value, got {actual!r}"
    count = len(actual)
    passed = (assertion.min is None or count >= assertion.min) and (
        assertion.max is None or count <= assertion.max
    )
    detail = (
        f"expected count between {assertion.min!r} and {assertion.max!r}, "
        f"got {count}"
    )
    return passed, detail


def _number_range_result(
    actual: object,
    assertion: NumberRangeAssertion,
) -> tuple[bool, str]:
    if isinstance(actual, bool) or not isinstance(actual, Real):
        return False, f"expected a number, got {actual!r}"
    passed = (assertion.min is None or actual >= assertion.min) and (
        assertion.max is None or actual <= assertion.max
    )
    detail = (
        f"expected number between {assertion.min!r} and {assertion.max!r}, "
        f"got {actual!r}"
    )
    return passed, detail


__all__ = ["AgentEvalRunner", "load_eval_cases"]
