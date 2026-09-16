from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from riva.ai.checkpoints import open_checkpointer, setup_checkpoints
from riva.ai.practice import PracticeAgent, PracticeInput
from riva.llm import LLMClient
from riva.models.practice import PracticeAnswerTurn, PracticeDimension


async def test_agent_recovers_serialized_state_after_reopening_checkpointer(
    extraction_database, practice_question
):
    url = extraction_database.engine.url.render_as_string(hide_password=False)
    await setup_checkpoints(url)
    generated = AsyncMock(
        return_value=practice_question.model_dump(exclude={"id", "role"})
    )
    evaluated = AsyncMock(
        return_value={
            "dimensions": [
                {"dimension": dimension.value, "score": 80, "explanation": ["Evidence"]}
                for dimension in PracticeDimension
            ],
            "review": {
                "summary": "Clear answer",
                "strengths": [],
                "issues": [],
                "suggestions": [],
            },
        }
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
    input = PracticeInput(
        profile={"skills": ["Python"]},
        role={"title": "Engineer", "jd": {}},
        question_type="project",
        difficulty="hard",
        max_follow_ups=0,
    )
    async with open_checkpointer(url) as saver:
        initial = await PracticeAgent(client, saver).start(practice_id, input)
    answer = PracticeAnswerTurn(id=uuid4(), content="I built the API.")
    async with open_checkpointer(url) as saver:
        agent = PracticeAgent(client, saver)
        assert await agent.start(practice_id, input) == initial
        completed = await agent.answer(practice_id, answer)
    async with open_checkpointer(url) as saver:
        assert (
            await PracticeAgent(client, saver).answer(practice_id, answer) == completed
        )
    assert completed.turns == [*initial.turns, answer]
    assert completed.result.evaluation.score == 80
    generated.assert_awaited_once()
    evaluated.assert_awaited_once()
