from uuid import uuid4

from riva.ai.checkpoints import open_checkpointer, setup_checkpoints
from riva.ai.practice import PracticeRoundAgent
from tests.support.practice import (
    ScriptedPracticeModel,
    make_answer,
    make_input,
    make_result,
)


async def test_practice_round_resumes_after_checkpointer_reopen(
    test_database_url, initialized_database
):
    await setup_checkpoints(test_database_url)
    model = ScriptedPracticeModel()
    round_id = uuid4()
    async with open_checkpointer(test_database_url) as saver:
        initial = await PracticeRoundAgent(model.client, saver).start(
            round_id, make_input(max_follow_ups=0)
        )
    answer = make_answer()
    async with open_checkpointer(test_database_url) as saver:
        completed = await PracticeRoundAgent(model.client, saver).answer(
            round_id, answer
        )
    assert completed.turns == [initial.turns[0], answer]
    assert completed.result == make_result()
    model.generate.assert_awaited_once()
