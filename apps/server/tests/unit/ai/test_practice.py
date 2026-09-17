import json
from uuid import uuid4

import pytest
from langgraph.checkpoint.memory import InMemorySaver

from riva.ai.practice import PracticeRoundAgent
from tests.support.practice import (
    ScriptedPracticeModel,
    make_answer,
    make_dimension_scores,
    make_input,
    make_question,
    make_result,
)


async def test_start_generates_main_question_and_waits_for_answer():
    model = ScriptedPracticeModel()
    agent = PracticeRoundAgent(model.client, InMemorySaver())
    output = await agent.start(uuid4(), make_input())
    assert len(output.turns) == 1 and output.result is None
    assert output.turns[0].model_dump(exclude={"id"}) == model.question.model_dump(
        exclude={"id"}
    )


async def test_start_recovers_existing_round_without_regenerating_question():
    model = ScriptedPracticeModel()
    agent = PracticeRoundAgent(model.client, InMemorySaver())
    round_id = uuid4()
    initial = await agent.start(round_id, make_input())
    assert await agent.start(round_id, make_input()) == initial
    model.generate.assert_awaited_once()


async def test_answer_evaluates_directly_when_followups_are_disabled():
    evaluation = make_result().model_dump(mode="json", exclude={"score"})
    evaluation["dimension_scores"] = make_dimension_scores(
        {
            "relevance": 90,
            "structure": 80,
            "specificity": 70,
            "contribution": 60,
            "evidence": 50,
            "role_alignment": 40,
            "communication": 30,
            "risk_awareness": 20,
        }
    ).model_dump()
    model = ScriptedPracticeModel(evaluation={**evaluation, "score": 100})
    agent = PracticeRoundAgent(model.client, InMemorySaver())
    round_id = uuid4()
    initial = await agent.start(round_id, make_input(max_follow_ups=0))
    answer = make_answer()
    output = await agent.answer(round_id, answer)
    assert output.turns == [initial.turns[0], answer]
    # Five 15% weights, two 10% weights and one 5% weight; ignore model-provided total.
    assert output.result.score == 60.5
    assert output.result.model_dump(exclude={"score"}) == evaluation
    model.plan.assert_not_awaited()


async def test_followup_limit_stops_further_question_generation():
    followup = make_question("Why that design?")
    model = ScriptedPracticeModel(
        next_steps=[
            {
                "action": "follow_up",
                "question": followup.model_dump(exclude={"id", "role"}),
            }
        ]
    )
    agent = PracticeRoundAgent(model.client, InMemorySaver())
    round_id = uuid4()
    await agent.start(round_id, make_input(max_follow_ups=1))
    waiting = await agent.answer(round_id, make_answer())
    assert waiting.result is None and waiting.turns[-1].content == followup.content
    answer = make_answer("To reduce database load.")
    completed = await agent.answer(round_id, answer)
    assert completed.turns == [*waiting.turns, answer] and completed.result is not None
    model.plan.assert_awaited_once()


async def test_answer_replay_is_idempotent_and_conflicting_replay_is_rejected():
    model = ScriptedPracticeModel(
        next_steps=[
            {
                "action": "follow_up",
                "question": make_question("Why?").model_dump(exclude={"id", "role"}),
            }
        ]
    )
    agent = PracticeRoundAgent(model.client, InMemorySaver())
    round_id = uuid4()
    await agent.start(round_id, make_input())
    answer = make_answer()
    accepted = await agent.answer(round_id, answer)
    assert await agent.answer(round_id, answer) == accepted
    with pytest.raises(ValueError, match="existing turn ID"):
        await agent.answer(round_id, make_answer("Different answer", id=answer.id))
    assert await agent.answer(round_id, answer) == accepted
    model.plan.assert_awaited_once()


async def test_finish_discards_unanswered_followup_and_evaluates_completed_answers():
    model = ScriptedPracticeModel(
        next_steps=[
            {
                "action": "follow_up",
                "question": make_question("Why?").model_dump(exclude={"id", "role"}),
            }
        ]
    )
    agent = PracticeRoundAgent(model.client, InMemorySaver())
    round_id = uuid4()
    initial = await agent.start(round_id, make_input())
    answer = make_answer()
    await agent.answer(round_id, answer)
    completed = await agent.finish(round_id)
    assert (
        completed.turns == [initial.turns[0], answer] and completed.result is not None
    )
    payload = json.loads(model.evaluate.await_args.args[0][1].content)
    assert payload["turns"] == [
        turn.model_dump(mode="json") for turn in completed.turns
    ]


async def test_finish_rejects_round_without_main_answer():
    model = ScriptedPracticeModel()
    agent = PracticeRoundAgent(model.client, InMemorySaver())
    round_id = uuid4()
    await agent.start(round_id, make_input())
    with pytest.raises(ValueError, match="main question"):
        await agent.finish(round_id)
    model.evaluate.assert_not_awaited()


async def test_restart_preserves_main_question_and_is_idempotent():
    model = ScriptedPracticeModel()
    agent = PracticeRoundAgent(model.client, InMemorySaver())
    round_id, main_question = uuid4(), make_question()
    initial = await agent.restart(round_id, make_input(), main_question)
    assert initial.turns == [main_question] and initial.result is None
    assert await agent.restart(round_id, make_input(), main_question) == initial
    model.generate.assert_not_awaited()
