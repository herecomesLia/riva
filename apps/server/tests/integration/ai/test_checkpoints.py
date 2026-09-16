from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from riva.ai.checkpoints import delete_checkpoints, open_checkpointer, setup_checkpoints
from riva.ai.practice import PracticeRoundAgent, PracticeRoundInput
from riva.llm import LLMClient
from riva.models.practice import PracticeAnswerTurn


async def test_agent_recovers_serialized_state_after_reopening_checkpointer(
    extraction_database, practice_question, practice_result
):
    url = extraction_database.engine.url.render_as_string(hide_password=False)
    await setup_checkpoints(url)
    generated = AsyncMock(
        return_value=practice_question.model_dump(exclude={"id", "role"})
    )
    evaluated = AsyncMock(
        return_value=practice_result.model_dump(mode="json", exclude={"score"})
    )

    def structured_model(schema, **kwargs):
        calls = {"_GeneratedQuestion": generated, "_EvaluationOutput": evaluated}

        async def generate(messages):
            return {
                "raw": AIMessage(content="output"),
                "parsed": await calls[schema["name"]](messages),
                "parsing_error": None,
            }

        return RunnableLambda(generate)

    client = MagicMock(spec=LLMClient)
    client.chat_model.return_value.with_structured_output.side_effect = structured_model
    practice_id = uuid4()
    input = PracticeRoundInput(
        profile={"skills": ["Python"]},
        role={"title": "Engineer", "jd": {}},
        question_type="project",
        difficulty="hard",
        max_follow_ups=0,
    )
    async with open_checkpointer(url) as saver:
        initial = await PracticeRoundAgent(client, saver).start(practice_id, input)
    answer = PracticeAnswerTurn(id=uuid4(), content="I built the API.")
    async with open_checkpointer(url) as saver:
        agent = PracticeRoundAgent(client, saver)
        assert await agent.start(practice_id, input) == initial
        completed = await agent.answer(practice_id, answer)
    async with open_checkpointer(url) as saver:
        assert (
            await PracticeRoundAgent(client, saver).answer(practice_id, answer)
            == completed
        )
    assert completed.turns == [*initial.turns, answer]
    assert completed.result.score == 80
    replacement_id = uuid4()
    async with open_checkpointer(url) as saver:
        restarted = await PracticeRoundAgent(client, saver).restart(
            replacement_id, input, initial.turns[0]
        )
    await delete_checkpoints(url, [practice_id])
    async with open_checkpointer(url) as saver:
        agent = PracticeRoundAgent(client, saver)
        assert await agent.restart(replacement_id, input, initial.turns[0]) == restarted
        new_answer = PracticeAnswerTurn(id=uuid4(), content="My second answer")
        retried = await agent.answer(replacement_id, new_answer)
        assert retried.turns == [initial.turns[0], new_answer]
        assert retried.result is not None
    generated.assert_awaited_once()
    assert evaluated.await_count == 2
