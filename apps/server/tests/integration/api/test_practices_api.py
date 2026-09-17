from uuid import UUID

import pytest
from sqlalchemy import text

from riva.models.practice import PracticeRound, PracticeTurn
from riva.tasks import TaskController, TaskErrorCode
from tests.support.auth import ORIGIN_HEADERS, register_user
from tests.support.practice import make_answer, make_question, make_result


async def _create_practice(client):
    profile = await client.post(
        "/api/career-profile", headers=ORIGIN_HEADERS, json={"skills": ["Python"]}
    )
    assert profile.status_code == 201, profile.text
    role = await client.post(
        "/api/roles",
        headers=ORIGIN_HEADERS,
        json={"title": "Engineer", "company": "Original company"},
    )
    assert role.status_code == 201, role.text
    response = await client.post(
        "/api/practices",
        headers=ORIGIN_HEADERS,
        json={
            "roleId": role.json()["id"],
            "questionType": "project",
            "difficulty": "hard",
        },
    )
    assert response.status_code == 201, response.text
    created = response.json()
    current = await client.get(f"/api/practices/{created['id']}")
    assert current.status_code == 200, current.text
    return {**created, "roundId": current.json()["rounds"][-1]["id"]}, role.json()["id"]


def _round_path(created):
    return f"/api/practices/{created['id']}/rounds/{created['roundId']}"


async def _publish_round(database, round_id, turns, *, result=None):
    # Publish a worker boundary; HTTP tests do not run the Agent or external LLM.
    async with database.sessionmaker() as session:
        round = await session.get(PracticeRound, UUID(round_id))
        if round.job_id is not None:
            await TaskController(session).abort(round.job_id)
        round.job_id = None
        round.result = result
        round.turns.extend(
            PracticeTurn(sequence=i, **turn.model_dump())
            for i, turn in enumerate(turns)
        )
        await session.commit()


async def test_create_and_active_identify_the_current_round(client):
    await register_user(client)
    assert (await client.get("/api/practices/active")).status_code == 204
    created, role_id = await _create_practice(client)
    listing = await client.get("/api/practices")
    assert listing.status_code == 200
    assert listing.json()["activePracticeId"] == created["id"]
    response = await client.get("/api/practices/active")
    assert response.status_code == 200
    active = response.json()
    assert active == {
        "id": created["id"],
        "rounds": [
            {"id": created["roundId"], "sequence": 0, "turns": [], "result": None}
        ],
        "endedAt": None,
        "role": {"id": role_id, "title": "Engineer", "company": "Original company"},
        "questionType": "project",
        "difficulty": "hard",
        "createdAt": active["createdAt"],
    }


async def test_round_read_returns_content_and_hides_other_users_resources(
    client, database
):
    await register_user(client)
    created, _ = await _create_practice(client)
    question, answer, result = make_question(), make_answer(), make_result()
    await _publish_round(
        database, created["roundId"], [question, answer], result=result
    )
    response = await client.get(_round_path(created))
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"id", "sequence", "turns", "result"}
    assert body["turns"] == [
        {
            "id": str(question.id),
            "role": "assistant",
            "content": question.content,
            "guidance": question.guidance.model_dump(),
            "criteria": [criterion.model_dump() for criterion in question.criteria],
            "referenceAnswer": question.reference_answer,
        },
        {"id": str(answer.id), "role": "user", "content": answer.content},
    ]
    assert (
        body["result"]["dimensionScores"]["roleAlignment"]
        == result.dimension_scores.role_alignment.model_dump()
    )
    assert (
        body["result"]["dimensionScores"]["riskAwareness"]
        == result.dimension_scores.risk_awareness.model_dump()
    )
    assert body["result"]["score"] == result.score
    assert body["result"]["summary"] == result.summary
    active = await client.get("/api/practices/active")
    assert active.status_code == 200, active.text
    assert active.json()["rounds"] == [body]
    assert active.json() == (await client.get(f"/api/practices/{created['id']}")).json()
    await register_user(client, username="OtherUser")
    denied = await client.get(_round_path(created))
    assert denied.status_code == 404
    assert denied.json()["error"]["code"] == "resource.not_found"


async def test_answer_is_readable_before_background_work_finishes(client, database):
    await register_user(client)
    created, _ = await _create_practice(client)
    question = make_question()
    await _publish_round(database, created["roundId"], [question])
    path = _round_path(created)
    response = await client.post(
        f"{path}/answers",
        headers=ORIGIN_HEADERS,
        json={"questionId": str(question.id), "content": "I designed the cache."},
    )
    assert response.status_code == 202, response.text
    assert response.content == b""
    body = (await client.get(path)).json()
    assert [(turn["role"], turn["content"]) for turn in body["turns"]] == [
        ("assistant", question.content),
        ("user", "I designed the cache."),
    ]
    assert body["result"] is None


@pytest.mark.parametrize("action", ["skip", "restart", "next"])
async def test_round_commands_update_the_current_round(client, database, action):
    await register_user(client)
    created, _ = await _create_practice(client)
    question = make_question()
    turns = [question] if action == "skip" else [question, make_answer()]
    await _publish_round(
        database,
        created["roundId"],
        turns,
        result=None if action == "skip" else make_result(),
    )
    response = await client.post(
        f"{_round_path(created)}/{action}", headers=ORIGIN_HEADERS
    )
    assert response.status_code == 202, response.text
    assert response.content == b""
    current = await client.get("/api/practices/active")
    assert current.status_code == 200, current.text
    new_id = current.json()["rounds"][-1]["id"]
    assert new_id != created["roundId"]


async def test_finish_accepts_existing_answers_for_evaluation(client, database):
    await register_user(client)
    created, _ = await _create_practice(client)
    question, answer = make_question(), make_answer()
    await _publish_round(
        database, created["roundId"], [question, answer, make_question("Why?")]
    )
    path = _round_path(created)
    response = await client.post(f"{path}/finish", headers=ORIGIN_HEADERS)
    assert response.status_code == 202, response.text
    body = (await client.get(path)).json()
    assert [turn["id"] for turn in body["turns"]] == [str(question.id), str(answer.id)]


async def test_task_failure_and_retry_use_the_shared_public_contract(client, database):
    await register_user(client)
    created, _ = await _create_practice(client)
    async with database.sessionmaker() as session:
        round = await session.get(PracticeRound, UUID(created["roundId"]))
        round.error_code = TaskErrorCode.LLM_UNAVAILABLE
        await session.execute(text("SET LOCAL search_path TO procrastinate, public"))
        await session.execute(
            text("UPDATE procrastinate_jobs SET status = 'failed' WHERE id = :id"),
            {"id": round.job_id},
        )
        await session.commit()
    path = f"{_round_path(created)}/task"
    response = await client.get(path)
    assert response.status_code == 200
    assert response.json() == {
        "status": "failed",
        "error": {
            "code": TaskErrorCode.LLM_UNAVAILABLE.value,
            "message": "LLM service is temporarily unavailable.",
        },
    }
    retry = await client.post(f"{path}/retry", headers=ORIGIN_HEADERS)
    assert retry.status_code == 202, retry.text
    assert (await client.get(path)).json() == {"status": "queued", "error": None}


async def test_history_aggregates_rounds_and_preserves_deleted_role_display(
    client, database
):
    await register_user(client)
    created, role_id = await _create_practice(client)
    await _publish_round(
        database,
        created["roundId"],
        [make_question(), make_answer()],
        result=make_result(),
    )
    started = await client.post(f"{_round_path(created)}/next", headers=ORIGIN_HEADERS)
    assert started.status_code == 202
    second = await client.get(f"/api/practices/{created['id']}")
    assert second.status_code == 200, second.text
    second_id = second.json()["rounds"][-1]["id"]
    await _publish_round(
        database,
        second_id,
        [make_question("Another project?"), make_answer()],
        result=make_result().model_copy(update={"score": 60}),
    )
    updated = await client.patch(
        f"/api/roles/{role_id}",
        headers=ORIGIN_HEADERS,
        json={"title": "Senior Engineer", "company": "New company"},
    )
    assert updated.status_code == 200
    listing = (await client.get("/api/practices")).json()["practices"]
    assert len(listing) == 1
    assert listing[0]["roundCount"] == 2
    assert listing[0]["completedRoundCount"] == 2
    assert listing[0]["averageScore"] == 70
    assert "rounds" not in listing[0]
    assert listing[0]["role"] == {
        "id": role_id,
        "title": "Senior Engineer",
        "company": "New company",
    }
    deleted_role = await client.delete(f"/api/roles/{role_id}", headers=ORIGIN_HEADERS)
    assert deleted_role.status_code == 204
    path = f"/api/practices/{created['id']}"
    ended = await client.post(
        f"{path}/rounds/{second_id}/end-session", headers=ORIGIN_HEADERS
    )
    assert ended.status_code == 204, ended.text
    assert (await client.get("/api/practices/active")).status_code == 204
    assert (await client.get("/api/practices")).json()["activePracticeId"] is None
    response = await client.get(path)
    assert response.status_code == 200, response.text
    detail = response.json()
    assert detail["endedAt"] is not None
    assert detail["role"] == {
        "id": None,
        "title": "Senior Engineer",
        "company": "New company",
    }
    assert [round["id"] for round in detail["rounds"]] == [
        created["roundId"],
        second_id,
    ]
    assert [round["result"]["score"] for round in detail["rounds"]] == [80, 60]
    assert all(len(round["turns"]) == 2 for round in detail["rounds"])
    assert "profileSnapshot" not in detail and "roleSnapshot" not in detail
    deleted = await client.delete(path, headers=ORIGIN_HEADERS)
    assert deleted.status_code == 204
    assert (await client.get("/api/practices")).json() == {
        "practices": [],
        "activePracticeId": None,
    }
