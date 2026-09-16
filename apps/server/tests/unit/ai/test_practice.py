import json
from collections.abc import Sequence
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda
from langgraph.checkpoint.memory import InMemorySaver

from riva.ai.practice import PracticeRoundAgent, PracticeRoundInput
from riva.llm import LLMClient
from riva.models.career_profile import CareerProfileContent
from riva.models.practice import PracticeAnswerTurn
from riva.models.role import JobDescriptionContent, RoleContent


def _question(content: str) -> dict:
    return {
        "content": content,
        "guidance": {
            "hints": ["Explain your contribution"],
            "framework": ["Context", "Action", "Result"],
        },
        "criteria": [{"dimension": "Ownership", "expectation": "Identify your work"}],
        "reference_answer": "Describe the work you personally completed.",
    }


def _evaluation() -> dict:
    scores = {
        "relevance": 90,
        "structure": 80,
        "specificity": 70,
        "contribution": 60,
        "evidence": 50,
        "role_alignment": 40,
        "communication": 30,
        "risk_awareness": 20,
    }
    return {
        "dimension_scores": {
            dimension: {
                "score": score,
                "explanation": "Evidence from the answer",
            }
            for dimension, score in scores.items()
        },
        "summary": "Relevant answer with limited supporting evidence.",
        "strengths": ["Addresses the question"],
        "issues": ["Lacks outcome evidence"],
        "suggestions": ["Explain how the outcome was verified"],
    }


def _input(max_follow_ups: int = 1) -> PracticeRoundInput:
    return PracticeRoundInput(
        profile=CareerProfileContent(),
        role=RoleContent(title="Engineer", jd=JobDescriptionContent()),
        question_type="project",
        difficulty="basic",
        max_follow_ups=max_follow_ups,
    )


def _engine(
    *, next_steps: Sequence[object] = ()
) -> tuple[PracticeRoundAgent, dict[str, AsyncMock]]:
    calls = {
        "_GeneratedQuestion": AsyncMock(
            side_effect=[_question("Describe your project.")]
        ),
        "_NextStep": AsyncMock(side_effect=next_steps),
        "_EvaluationOutput": AsyncMock(side_effect=[_evaluation()]),
    }

    def structured_model(schema: dict, **kwargs: object) -> RunnableLambda:
        invoke = calls[schema["name"]]

        async def generate(messages: list) -> dict:
            parsed = await invoke(list(messages))
            return {
                "raw": AIMessage(content="output"),
                "parsed": parsed,
                "parsing_error": None,
            }

        return RunnableLambda(generate)

    client = MagicMock(spec=LLMClient)
    client.chat_model.return_value.with_structured_output.side_effect = structured_model
    return PracticeRoundAgent(client, InMemorySaver()), calls


async def test_start_is_idempotent() -> None:
    engine, calls = _engine()
    practice_id = uuid4()

    first = await engine.start(practice_id, _input())
    repeated = await engine.start(practice_id, _input())

    assert repeated == first
    assert len(first.turns) == 1
    assert first.turns[0].content == "Describe your project."
    assert first.result is None
    calls["_GeneratedQuestion"].assert_awaited_once()


async def test_finish_discards_unanswered_follow_up_and_recovers_evaluation() -> None:
    agent, calls = _engine(
        next_steps=[{"action": "follow_up", "question": _question("Why that design?")}]
    )
    round_id = uuid4()
    initial = await agent.start(round_id, _input())
    with pytest.raises(ValueError, match="main question"):
        await agent.finish(round_id)
    answer = PracticeAnswerTurn(id=uuid4(), content="I designed the cache.")
    await agent.answer(round_id, answer)
    calls["_EvaluationOutput"].side_effect = [
        RuntimeError("Evaluation failed"),
        _evaluation(),
    ]
    with pytest.raises(RuntimeError, match="Evaluation failed"):
        await agent.finish(round_id)
    completed = await agent.finish(round_id)
    assert completed.turns == [initial.turns[0], answer]
    assert completed.result is not None
    assert await agent.finish(round_id) == completed
    payload = json.loads(calls["_EvaluationOutput"].await_args.args[0][1].content)
    assert len(payload["turns"]) == 2
    calls["_NextStep"].assert_awaited_once()
    assert calls["_EvaluationOutput"].await_count == 2


async def test_restart_seeds_new_round_without_resetting_recovered_work() -> None:
    agent, calls = _engine()
    input = _input(max_follow_ups=0)
    initial = await agent.start(uuid4(), input)
    main_question = initial.turns[0]
    replacement_id = uuid4()
    restarted = await agent.restart(replacement_id, input, main_question)
    assert restarted == initial
    assert await agent.restart(replacement_id, input, main_question) == restarted
    answer = PracticeAnswerTurn(id=uuid4(), content="New attempt")
    completed = await agent.answer(replacement_id, answer)
    assert completed.result is not None
    assert await agent.restart(replacement_id, input, main_question) == completed
    calls["_GeneratedQuestion"].assert_awaited_once()
    calls["_EvaluationOutput"].assert_awaited_once()


async def test_answer_retry_does_not_consume_answer_twice() -> None:
    engine, calls = _engine(
        next_steps=[{"action": "follow_up", "question": _question("Why that design?")}]
    )
    practice_id = uuid4()
    initial = await engine.start(practice_id, _input())
    answer = PracticeAnswerTurn(id=uuid4(), content="I designed the cache.")

    first = await engine.answer(practice_id, answer)
    repeated = await engine.answer(practice_id, answer)

    assert repeated == first
    assert first.turns[:2] == [initial.turns[0], answer]
    assert len(first.turns) == 3
    assert first.turns[2].content == "Why that design?"
    assert first.result is None
    calls["_NextStep"].assert_awaited_once()


async def test_answer_recovers_pending_work_after_failure() -> None:
    engine, calls = _engine(
        next_steps=[
            RuntimeError("Planning failed"),
            {"action": "follow_up", "question": _question("Why that design?")},
        ]
    )
    practice_id = uuid4()
    initial = await engine.start(practice_id, _input())
    answer = PracticeAnswerTurn(id=uuid4(), content="I designed the cache.")

    with pytest.raises(RuntimeError, match="Planning failed"):
        await engine.answer(practice_id, answer)
    recovered = await engine.answer(practice_id, answer)

    assert recovered.turns[:2] == [initial.turns[0], answer]
    assert len(recovered.turns) == 3
    assert recovered.turns[2].content == "Why that design?"
    assert recovered.result is None
    calls["_GeneratedQuestion"].assert_awaited_once()
    assert calls["_NextStep"].await_count == 2
    for call in calls["_NextStep"].await_args_list:
        payload = json.loads(call.args[0][1].content)
        assert payload["turns"] == [
            initial.turns[0].model_dump(mode="json"),
            answer.model_dump(mode="json"),
        ]


async def test_follow_up_limit_is_enforced() -> None:
    engine, calls = _engine(
        next_steps=[{"action": "follow_up", "question": _question("Why that design?")}]
    )
    practice_id = uuid4()
    await engine.start(practice_id, _input(max_follow_ups=1))
    first = await engine.answer(
        practice_id, PracticeAnswerTurn(id=uuid4(), content="I designed the cache.")
    )
    assert first.result is None
    assert len(first.turns) == 3

    answer = PracticeAnswerTurn(id=uuid4(), content="To reduce database load.")
    completed = await engine.answer(practice_id, answer)

    assert completed.turns == [*first.turns, answer]
    assert completed.result is not None
    calls["_NextStep"].assert_awaited_once()
    calls["_EvaluationOutput"].assert_awaited_once()


async def test_zero_follow_ups_skips_next_decision() -> None:
    engine, calls = _engine()
    practice_id = uuid4()
    initial = await engine.start(practice_id, _input(max_follow_ups=0))
    answer = PracticeAnswerTurn(id=uuid4(), content="I designed the cache.")

    completed = await engine.answer(practice_id, answer)

    assert completed.turns == [initial.turns[0], answer]
    assert completed.result is not None
    calls["_NextStep"].assert_not_awaited()
    calls["_EvaluationOutput"].assert_awaited_once()


async def test_evaluation_builds_weighted_result() -> None:
    engine, _ = _engine()
    practice_id = uuid4()
    await engine.start(practice_id, _input(max_follow_ups=0))

    completed = await engine.answer(
        practice_id, PracticeAnswerTurn(id=uuid4(), content="I designed the cache.")
    )

    assert completed.result is not None
    # Five 15% dimensions, two 10% dimensions and one 5% dimension.
    assert completed.result.score == 60.5
    assert completed.result.model_dump(exclude={"score"}) == _evaluation()


async def test_same_turn_id_with_different_answer_is_rejected() -> None:
    engine, calls = _engine(
        next_steps=[{"action": "follow_up", "question": _question("Why that design?")}]
    )
    practice_id = uuid4()
    await engine.start(practice_id, _input())
    answer = PracticeAnswerTurn(id=uuid4(), content="I designed the cache.")
    accepted = await engine.answer(practice_id, answer)

    with pytest.raises(ValueError, match="existing turn ID"):
        await engine.answer(
            practice_id,
            PracticeAnswerTurn(id=answer.id, content="I designed the queue."),
        )

    assert await engine.answer(practice_id, answer) == accepted
    calls["_NextStep"].assert_awaited_once()
