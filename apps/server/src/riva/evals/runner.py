from __future__ import annotations

import json
from collections.abc import Iterable, Mapping, Sequence
from numbers import Real
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from riva.evals.models import (
    AgentEvalAssertion,
    AgentEvalCase,
    AgentEvalCaseResult,
    AgentEvalRunResult,
    AgentEvalRubricResult,
    ContainsAllAssertion,
    ContainsAssertion,
    ExactAssertion,
    ItemCountAssertion,
    NotContainsAssertion,
    NumberRangeAssertion,
)
from riva.evals.quality_judge import (
    AgentEvalQualityJudge,
    QualityJudgeInput,
    QualityJudgeRubricMismatchError,
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
        quality_judge: AgentEvalQualityJudge | None = None,
    ) -> None:
        if not model.strip():
            raise ValueError("eval model must not be empty")
        self.provider = provider
        self.model = model
        self.registry = registry
        self.quality_judge = quality_judge

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
            validated_input = TypeAdapter(
                registration.input_schema
            ).validate_python(case.input)
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

        rubric_results: list[AgentEvalRubricResult] = []
        average_rubric_score: float | None = None
        input_tokens = result.usage.input_tokens
        output_tokens = result.usage.output_tokens
        if case.rubrics:
            if self.quality_judge is None:
                failures.append(
                    "quality judge is required for cases with rubrics"
                )
            else:
                judge_input = QualityJudgeInput(
                    caseId=case.id,
                    targetAgentId=case.agent_id,
                    targetPromptVersion=case.prompt_version,
                    input=case.input,
                    output=output,
                    rubrics=case.rubrics,
                )
                try:
                    judge_result = await self.quality_judge.run(judge_input)
                    _validate_quality_judge_scores(
                        case.rubrics,
                        judge_result.output,
                        usage=judge_result.usage,
                    )
                except Exception as error:
                    judge_usage = getattr(error, "usage", None)
                    if judge_usage is not None:
                        input_tokens += judge_usage.input_tokens
                        output_tokens += judge_usage.output_tokens
                    failures.append(
                        _exception_message("quality judge failed", error)
                    )
                else:
                    input_tokens += judge_result.usage.input_tokens
                    output_tokens += judge_result.usage.output_tokens
                    rubric_results, average_rubric_score = _rubric_results(
                        case.rubrics,
                        judge_result.output,
                    )
                    failures.extend(
                        _rubric_failures(case.rubrics, rubric_results)
                    )

        return AgentEvalCaseResult(
            caseId=case.id,
            agentId=case.agent_id,
            promptVersion=case.prompt_version,
            passed=not failures,
            failedAssertions=failures,
            inputTokens=input_tokens,
            outputTokens=output_tokens,
            rubricResults=rubric_results,
            averageRubricScore=average_rubric_score,
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
        rubric_scores = [
            rubric.score
            for result in results
            for rubric in result.rubric_results
        ]
        total = len(results)
        return AgentEvalRunResult(
            agentId=agent_id or "all",
            total=total,
            passed=passed,
            failed=total - passed,
            passRate=passed / total if total else 0.0,
            inputTokens=input_tokens,
            outputTokens=output_tokens,
            averageRubricScore=(
                sum(rubric_scores) / len(rubric_scores)
                if rubric_scores
                else None
            ),
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


def _validate_quality_judge_scores(
    rubrics: Sequence[Any],
    output: Any,
    *,
    usage: Any,
) -> None:
    expected_ids = [rubric.id for rubric in rubrics]
    actual_ids = [score.rubric_id for score in output.scores]
    if (
        len(actual_ids) != len(set(actual_ids))
        or len(actual_ids) != len(expected_ids)
        or set(actual_ids) != set(expected_ids)
    ):
        raise QualityJudgeRubricMismatchError(
            expected_ids,
            actual_ids,
            usage=usage,
        )


def _rubric_results(
    rubrics: Sequence[Any],
    output: Any,
) -> tuple[list[AgentEvalRubricResult], float]:
    scores = {score.rubric_id: score for score in output.scores}
    results = [
        AgentEvalRubricResult(
            rubricId=rubric.id,
            score=scores[rubric.id].score,
            passed=scores[rubric.id].score >= rubric.min_score,
            evidence=scores[rubric.id].evidence,
        )
        for rubric in rubrics
    ]
    return results, sum(result.score for result in results) / len(results)


def _rubric_failures(
    rubrics: Sequence[Any],
    results: Sequence[AgentEvalRubricResult],
) -> list[str]:
    minimums = {rubric.id: rubric.min_score for rubric in rubrics}
    return [
        f"rubric[{result.rubric_id}] score={result.score}/"
        f"{minimums[result.rubric_id]}: {result.evidence}"
        for result in results
        if not result.passed
    ]


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
