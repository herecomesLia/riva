from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from langchain_core.exceptions import OutputParserException
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableLambda
from openai import BadRequestError
from pydantic import ValidationError

from riva.ai.career_profile import CareerProfileExtractor
from riva.llm import LLMClient
from riva.llm.errors import LLMOutputError, LLMRequestError
from riva.models.career_profile import CareerProfileContent


def _extractor(responses: list[object]) -> tuple[CareerProfileExtractor, AsyncMock]:
    invoke = AsyncMock(side_effect=responses)

    async def generate(messages: list) -> object:
        return await invoke(list(messages))

    client = MagicMock(spec=LLMClient)
    client.chat_model.return_value.with_structured_output.return_value = RunnableLambda(
        generate
    )
    return CareerProfileExtractor(client), invoke


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
        await extractor.from_text("Resume")
    assert raised.value.__cause__ is failure
    invoke.assert_awaited_once()


async def test_success_returns_content_without_repair() -> None:
    extractor, invoke = _extractor([_response({"skills": ["Python"]})])
    result = await extractor.from_text("Skills: Python")
    assert isinstance(result, CareerProfileContent)
    assert result.skills == ["Python"]
    invoke.assert_awaited_once()


async def test_validation_feedback_preserves_source_and_is_isolated_between_calls() -> (
    None
):
    raw = AIMessage(content='{"skills": [""]}')
    extractor, invoke = _extractor(
        [
            _response({"skills": [""]}, raw=raw),
            _response({"skills": ["Python"]}),
            _response({"skills": ["SQL"]}),
        ]
    )
    result = await extractor.from_text("Skills: Python")
    assert result.skills == ["Python"]
    repair = invoke.await_args_list[1].args[0]
    assert repair[1].content == "Skills: Python"
    assert repair[2] is raw
    assert "skills.0" in repair[3].content
    await extractor.from_text("Skills: SQL")
    fresh = invoke.await_args_list[2].args[0]
    assert len(fresh) == 2
    assert fresh[1].content == "Skills: SQL"


async def test_parser_feedback_requests_valid_json_without_private_details() -> None:
    raw = AIMessage(content="invalid JSON")
    extractor, invoke = _extractor(
        [
            _response(
                None, raw=raw, error=OutputParserException("private parser detail")
            ),
            _response({"skills": ["Python"]}),
        ]
    )
    result = await extractor.from_text("Skills: Python")
    assert result.skills == ["Python"]
    repair = invoke.await_args_list[1].args[0]
    assert repair[2] is raw
    assert isinstance(repair[3], HumanMessage)
    assert "valid JSON" in repair[3].content
    assert "private parser detail" not in repair[3].content


async def test_validation_failure_stops_after_one_repair() -> None:
    extractor, invoke = _extractor(
        [_response({"education": [{"school": "University"}]})] * 2
    )
    with pytest.raises(LLMOutputError) as raised:
        await extractor.from_text("University")
    assert isinstance(raised.value.__cause__, ValidationError)
    assert invoke.await_count == 2


async def test_parser_failure_stops_after_one_repair() -> None:
    failure = OutputParserException("invalid JSON")
    extractor, invoke = _extractor([_response(None, error=failure)] * 2)
    with pytest.raises(LLMOutputError) as raised:
        await extractor.from_text("Resume")
    assert raised.value.__cause__ is failure
    assert invoke.await_count == 2


async def test_inconsistent_work_skills_fail_after_correction() -> None:
    content = {
        "work_experiences": [
            {
                "company": "Example Company",
                "title": "Engineer",
                "start_date": "2020-07",
                "end_date": None,
                "skills": ["Python"],
            }
        ],
        "skills": [],
    }
    extractor, invoke = _extractor([_response(content)] * 2)
    with pytest.raises(LLMOutputError) as raised:
        await extractor.from_text(
            "Engineer at Example Company since 2020-07, using Python."
        )
    assert isinstance(raised.value.__cause__, ValidationError)
    assert "work experience skills must exist" in str(raised.value.__cause__)
    assert invoke.await_count == 2
    assert "work experience skills must exist" in invoke.await_args.args[0][3].content


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
        await extractor.from_text("Resume")
    assert raised.value.__cause__ is failure
    invoke.assert_awaited_once()


@pytest.mark.parametrize("returned", [False, True])
async def test_unknown_failure_is_not_repaired(returned: bool) -> None:
    failure = ValueError("unexpected failure")
    extractor, invoke = _extractor(
        [_response(None, error=failure) if returned else failure]
    )
    with pytest.raises(ValueError) as raised:
        await extractor.from_text("Resume")
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
        await extractor.from_text("Resume")
    invoke.assert_awaited_once()
