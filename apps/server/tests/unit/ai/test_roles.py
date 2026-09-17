from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from langchain_core.exceptions import OutputParserException
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableLambda
from openai import BadRequestError
from pydantic import ValidationError

from riva.ai.role import (
    CriterionMatch,
    JobDescriptionExtractor,
    MatchingCriteria,
    MatchingCriterion,
    MatchingHardSkills,
    MatchingRequirements,
    MatchReason,
    RoleMatchingEvaluation,
    _build_matching_criteria,
    _build_report_payload,
    _calculate_matching_scores,
    _MatchingEvaluationError,
    _validate_matching_evaluation,
)
from riva.llm import LLMClient
from riva.llm.errors import LLMOutputError, LLMRequestError
from riva.models.career_profile import CareerProfileContent
from riva.models.role import JobDescriptionContent


def _extractor(responses: list[object]) -> tuple[JobDescriptionExtractor, AsyncMock]:
    invoke = AsyncMock(side_effect=responses)

    async def generate(messages: list) -> object:
        return await invoke(list(messages))

    client = MagicMock(spec=LLMClient)
    client.chat_model.return_value.with_structured_output.return_value = RunnableLambda(
        generate
    )
    return JobDescriptionExtractor(client), invoke


def _response(parsed: object, *, raw: AIMessage | None = None, error=None) -> dict:
    return {
        "raw": raw or AIMessage(content="answer"),
        "parsed": parsed,
        "parsing_error": error,
    }


async def test_provider_request_failure_is_not_repaired() -> None:
    request = httpx.Request("POST", "https://llm.test/v1/chat/completions")
    failure = BadRequestError(
        "invalid request", response=httpx.Response(400, request=request), body=None
    )
    extractor, invoke = _extractor([failure])
    with pytest.raises(LLMRequestError) as raised:
        await extractor.from_text("Job description")
    assert raised.value.__cause__ is failure
    invoke.assert_awaited_once()


async def test_success_returns_content_without_repair() -> None:
    extractor, invoke = _extractor(
        [_response({"responsibilities": ["Maintain services"]})]
    )
    result = await extractor.from_text("Maintain services")
    assert isinstance(result, JobDescriptionContent)
    assert result.responsibilities == ["Maintain services"]
    invoke.assert_awaited_once()


async def test_validation_feedback_preserves_source_and_is_isolated_between_calls() -> (
    None
):
    raw = AIMessage(content='{"responsibilities": [""]}')
    extractor, invoke = _extractor(
        [
            _response({"responsibilities": [""]}, raw=raw),
            _response({"responsibilities": ["Maintain services"]}),
            _response({"responsibilities": ["Analyze data"]}),
        ]
    )
    await extractor.from_text("Maintain services")
    repair = invoke.await_args_list[1].args[0]
    assert repair[1].content == "Maintain services"
    assert repair[2] is raw
    assert "responsibilities.0" in repair[3].content
    await extractor.from_text("Analyze data")
    fresh = invoke.await_args_list[2].args[0]
    assert len(fresh) == 2
    assert fresh[1].content == "Analyze data"


async def test_parser_feedback_requests_valid_json_without_private_details() -> None:
    raw = AIMessage(content="invalid JSON")
    extractor, invoke = _extractor(
        [
            _response(
                None, raw=raw, error=OutputParserException("private parser detail")
            ),
            _response({}),
        ]
    )
    await extractor.from_text("Job description")
    repair = invoke.await_args_list[1].args[0]
    assert repair[2] is raw
    assert isinstance(repair[3], HumanMessage)
    assert "valid JSON" in repair[3].content
    assert "private parser detail" not in repair[3].content


async def test_validation_failure_stops_after_one_repair() -> None:
    extractor, invoke = _extractor([_response({"responsibilities": [""]})] * 2)
    with pytest.raises(LLMOutputError) as raised:
        await extractor.from_text("Job description")
    assert isinstance(raised.value.__cause__, ValidationError)
    assert invoke.await_count == 2


async def test_parser_failure_stops_after_one_repair() -> None:
    failure = OutputParserException("invalid JSON")
    extractor, invoke = _extractor([_response(None, error=failure)] * 2)
    with pytest.raises(LLMOutputError) as raised:
        await extractor.from_text("Job description")
    assert raised.value.__cause__ is failure
    assert invoke.await_count == 2


@pytest.mark.parametrize("has_error", [False, True])
async def test_refusal_is_not_repaired(has_error: bool) -> None:
    failure = ValueError("provider refusal") if has_error else None
    extractor, invoke = _extractor(
        [
            _response(
                None,
                raw=AIMessage(content="", additional_kwargs={"refusal": "refused"}),
                error=failure,
            )
        ]
    )
    with pytest.raises(LLMOutputError) as raised:
        await extractor.from_text("Job description")
    assert raised.value.__cause__ is failure
    invoke.assert_awaited_once()


@pytest.mark.parametrize("returned", [False, True])
async def test_unknown_failure_is_not_repaired(returned: bool) -> None:
    failure = ValueError("unexpected failure")
    extractor, invoke = _extractor(
        [_response(None, error=failure) if returned else failure]
    )
    with pytest.raises(ValueError) as raised:
        await extractor.from_text("Job description")
    assert raised.value is failure
    invoke.assert_awaited_once()


@pytest.mark.parametrize("finish", ["length", "content_filter"])
async def test_incomplete_output_is_not_repaired(finish: str) -> None:
    extractor, invoke = _extractor(
        [
            _response(
                {},
                raw=AIMessage(content="", response_metadata={"finish_reason": finish}),
            )
        ]
    )
    with pytest.raises(LLMOutputError, match="refused or truncated"):
        await extractor.from_text("Job description")
    invoke.assert_awaited_once()


def _match(
    criterion_id: str, score: int, *, reasons: bool | None = None
) -> CriterionMatch:
    return CriterionMatch(
        criterion_id=criterion_id,
        score=score,
        reasons=[
            MatchReason(
                profile_section="projects",
                evidence=["Implemented an API"],
                explanation="Related API development experience",
            )
        ]
        if (score > 0 if reasons is None else reasons)
        else [],
    )


def _criteria(module: str, ids: list[str]) -> MatchingCriteria:
    items = [MatchingCriterion(id=value, text="Original condition") for value in ids]
    values = {
        "requirements": MatchingRequirements(),
        "hard_skills": MatchingHardSkills(),
        "preferred_qualifications": [],
        "responsibilities": [],
    }
    if module == "requirements":
        values[module] = MatchingRequirements(experience=items)
    elif module == "hard_skills":
        values[module] = MatchingHardSkills(tools=items)
    else:
        values[module] = items
    return MatchingCriteria(**values)


def test_preprocessing_preserves_conditions_and_excludes_unscored_modules():
    jd = JobDescriptionContent.model_validate(
        {
            "requirements": {
                "experience": [
                    "A or B, at least 3 years",
                    "No internship unless specified",
                ]
            },
            "hard_skills": {"tools": ["A or B, at least 3 years"]},
            "preferred_qualifications": ["Certificate preferred"],
            "responsibilities": ["Maintain APIs"],
            "soft_skills": ["Communication"],
            "business_domains": ["Retail"],
        }
    )
    result = _build_matching_criteria(jd)
    assert result.requirements.experience == [
        MatchingCriterion(
            id="requirements.experience.0", text="A or B, at least 3 years"
        ),
        MatchingCriterion(
            id="requirements.experience.1", text="No internship unless specified"
        ),
    ]
    assert result.hard_skills.tools == [
        MatchingCriterion(id="hard_skills.tools.0", text="A or B, at least 3 years")
    ]
    assert result.preferred_qualifications == [
        MatchingCriterion(id="preferred_qualifications.0", text="Certificate preferred")
    ]
    assert result.responsibilities == [
        MatchingCriterion(id="responsibilities.0", text="Maintain APIs")
    ]
    assert result == _build_matching_criteria(
        jd.model_copy(update={"soft_skills": [], "business_domains": []})
    )


@pytest.mark.parametrize(
    ("ids", "error"),
    [
        (["a"], "missing criterion: b"),
        (["a", "b", "c"], "unknown criterion: c"),
        (["a", "b", "a"], "duplicate criterion: a"),
        (["b", "a"], None),
    ],
)
def test_completeness(ids, error):
    criteria = _criteria("responsibilities", ["a", "b"])
    evaluation = RoleMatchingEvaluation(matches=[_match(value, 80) for value in ids])
    if error:
        with pytest.raises(_MatchingEvaluationError, match=error):
            _validate_matching_evaluation(criteria, evaluation)
    else:
        _validate_matching_evaluation(criteria, evaluation)


@pytest.mark.parametrize(
    ("module", "allowed", "forbidden"),
    [
        ("requirements", [0, 100], [1, 50, 60, 99]),
        ("hard_skills", [0, 50, 60, 80, 100], [1, 49, 51, 59]),
        ("preferred_qualifications", [0, 60, 80, 100], [1, 50, 59]),
        ("responsibilities", [0, 60, 80, 100], [1, 50, 59]),
    ],
)
def test_score_rules_use_actual_module_not_id_text(module, allowed, forbidden):
    # The misleading ID must remain an opaque key, never determine the module.
    criterion_id = (
        "hard_skills.tools.99"
        if module == "requirements"
        else "requirements.education.99"
    )
    criteria = _criteria(module, [criterion_id])
    for score in allowed:
        _validate_matching_evaluation(
            criteria, RoleMatchingEvaluation(matches=[_match(criterion_id, score)])
        )
    for score in forbidden:
        with pytest.raises(_MatchingEvaluationError, match="must have score"):
            _validate_matching_evaluation(
                criteria, RoleMatchingEvaluation(matches=[_match(criterion_id, score)])
            )


@pytest.mark.parametrize(
    "module",
    ["requirements", "hard_skills", "preferred_qualifications", "responsibilities"],
)
def test_reasons_rules(module):
    criteria = _criteria(module, ["a"])
    with pytest.raises(_MatchingEvaluationError, match="requires reasons"):
        _validate_matching_evaluation(
            criteria, RoleMatchingEvaluation(matches=[_match("a", 100, reasons=False)])
        )
    evaluation = RoleMatchingEvaluation(matches=[_match("a", 0, reasons=True)])
    if module == "requirements":
        _validate_matching_evaluation(criteria, evaluation)
    else:
        with pytest.raises(_MatchingEvaluationError, match="empty reasons"):
            _validate_matching_evaluation(criteria, evaluation)


def test_requirements_average_within_field_then_renormalize_weights():
    criteria = _build_matching_criteria(
        JobDescriptionContent.model_validate(
            {
                "requirements": {
                    "education": ["Degree"],
                    "experience": ["Backend", "Three years"],
                },
            }
        )
    )
    scores = _calculate_matching_scores(
        criteria,
        RoleMatchingEvaluation(
            matches=[
                _match("requirements.experience.1", 100),
                _match("requirements.education.0", 100),
                _match("requirements.experience.0", 0),
            ]
        ),
    )
    assert scores.requirements == pytest.approx(83.3333333333)
    assert scores.overall == scores.requirements


def test_hard_skills_weight_items_not_categories():
    criteria = _build_matching_criteria(
        JobDescriptionContent.model_validate(
            {
                "hard_skills": {
                    "programming_languages": ["Python"],
                    "tools": ["A", "B", "C"],
                },
            }
        )
    )
    scores = _calculate_matching_scores(
        criteria,
        RoleMatchingEvaluation(
            matches=[
                _match("hard_skills.programming_languages.0", 100),
                _match("hard_skills.tools.0", 0),
                _match("hard_skills.tools.1", 50),
                _match("hard_skills.tools.2", 50),
            ]
        ),
    )
    assert scores.hard_skills == 50


def test_overall_renormalizes_present_modules():
    criteria = _build_matching_criteria(
        JobDescriptionContent.model_validate(
            {
                "requirements": {"education": ["Degree"]},
                "hard_skills": {"tools": ["Docker"]},
            }
        )
    )
    scores = _calculate_matching_scores(
        criteria,
        RoleMatchingEvaluation(
            matches=[
                _match("requirements.education.0", 100),
                _match("hard_skills.tools.0", 50),
            ]
        ),
    )
    assert scores.overall == pytest.approx(78.5714285714)
    assert scores.preferred_qualifications is None
    assert scores.responsibilities is None


@pytest.mark.parametrize(
    "module",
    ["requirements", "hard_skills", "preferred_qualifications", "responsibilities"],
)
def test_missing_module_is_distinct_from_zero(module):
    with pytest.raises(ValueError, match="at least one scoring criterion"):
        _calculate_matching_scores(
            _criteria(module, []), RoleMatchingEvaluation(matches=[])
        )
    zero = _calculate_matching_scores(
        _criteria(module, ["a"]), RoleMatchingEvaluation(matches=[_match("a", 0)])
    )
    assert getattr(zero, module) == 0
    assert zero.overall == 0


def test_report_selection_uses_strict_thresholds_and_preserves_evidence():
    matches = [_match(str(score), score) for score in [0, 50, 60, 80, 81, 100]]
    criteria = _criteria("hard_skills", [match.criterion_id for match in matches])
    evaluation = RoleMatchingEvaluation(matches=matches)
    scores = _calculate_matching_scores(criteria, evaluation)
    payload = _build_report_payload(
        criteria, evaluation, scores, CareerProfileContent()
    )
    assert payload["strengths"] == [
        match.model_dump(mode="json") for match in matches[4:]
    ]
    assert payload["gaps"] == [match.model_dump(mode="json") for match in matches[:2]]
