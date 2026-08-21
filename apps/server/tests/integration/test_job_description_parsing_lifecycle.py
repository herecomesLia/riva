import asyncio
import os
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import status
from sqlalchemy import func, select

from riva.core.errors import APIError
from riva.db import Database
from riva.models import AgentRun, AgentRunStatus, TargetRole, User
from riva.prompts import JOB_DESCRIPTION_PARSING_PROMPT
from riva.schemas.roles import (
    JobDescriptionParsingStatusQuery,
    StartJobDescriptionParsingRequest,
)
from riva.services.agent_runs import AgentRunService
from riva.services.roles import TargetRoleService

pytestmark = pytest.mark.integration


def database_url() -> str:
    value = os.getenv("RIVA_TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")
    if os.getenv("RIVA_DATABASE_URL") == value:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")
    return value


def owner(user_id: UUID, suffix: str) -> User:
    return User(
        id=user_id,
        username=f"parsing-{suffix}-{user_id.hex[:8]}",
        normalized_username=f"parsing-{suffix}-{user_id.hex[:8]}",
        password_hash="hash",
        display_name="Parsing User",
    )


def role(user_id: UUID, *, saved: bool = True) -> TargetRole:
    return TargetRole(
        id=uuid4(),
        user_id=user_id,
        title="Backend Engineer",
        company="Riva",
        preparation_status="preparing",
        job_description_status="saved" if saved else "missing",
        raw_job_description="Build reliable APIs." if saved else None,
        job_description_version=1 if saved else None,
        version=1,
    )


def request(version: int = 1) -> StartJobDescriptionParsingRequest:
    return StartJobDescriptionParsingRequest(
        version=version,
        job_description_version=1,
    )


def service(session) -> TargetRoleService:
    return TargetRoleService(
        session,
        llm_provider=" QWEN ",
        llm_model=" test-model ",
    )


def test_start_retry_status_conflicts_and_concurrency() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                user = owner(uuid4(), "owner")
                other = owner(uuid4(), "other")
                target = role(user.id)
                missing = role(user.id, saved=False)
                concurrent = role(user.id)
                unavailable = role(user.id)
                async with database.sessionmaker() as session:
                    session.add_all(
                        [user, other, target, missing, concurrent, unavailable]
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    started = await service(session).start_job_description_parsing(
                        user, target.id, request()
                    )
                projected = next(item for item in started.roles if item.id == target.id)
                assert projected.version == 2
                assert projected.job_description.status == "parsing"

                async with database.sessionmaker() as session:
                    stored_role = await session.get(TargetRole, target.id)
                    assert stored_role is not None
                    run = await session.get(
                        AgentRun, stored_role.job_description_parsing_run_id
                    )
                    assert run is not None
                    assert run.status is AgentRunStatus.QUEUED
                    assert run.prompt_id == JOB_DESCRIPTION_PARSING_PROMPT.prompt_id
                    assert run.prompt_version == JOB_DESCRIPTION_PARSING_PROMPT.version
                    assert (
                        run.output_schema_id
                        == JOB_DESCRIPTION_PARSING_PROMPT.output_schema_id
                    )
                    assert run.payload == {
                        "roleId": str(target.id),
                        "jobDescriptionVersion": 1,
                        "interactionLanguage": "zh-CN",
                    }
                    assert run.model == "test-model"
                    assert run.max_attempts == 3
                    assert target.title not in run.idempotency_key
                    first_run_id = run.id
                    role_updated_at = stored_role.updated_at

                async with database.sessionmaker() as session:
                    repeated = await service(session).start_job_description_parsing(
                        user, target.id, request(2)
                    )
                repeated_role = next(
                    item for item in repeated.roles if item.id == target.id
                )
                assert repeated_role.version == 2
                async with database.sessionmaker() as session:
                    count = await session.scalar(
                        select(func.count()).select_from(AgentRun)
                    )
                    assert count == 1

                async with database.sessionmaker() as session:
                    snapshot = await service(
                        session
                    ).get_job_description_parsing_status(
                        user,
                        target.id,
                        JobDescriptionParsingStatusQuery(
                            version=1,
                            job_description_version=1,
                        ),
                    )
                assert snapshot.version == 2
                assert snapshot.job_description.status == "parsing"
                assert snapshot.updated_at == role_updated_at

                async with database.sessionmaker() as session:
                    claimed = await AgentRunService(session).claim_next(
                        lease_owner="test-worker",
                        lease_duration=timedelta(minutes=5),
                    )
                assert claimed is not None and claimed.lease_token is not None
                async with database.sessionmaker() as session:
                    await AgentRunService(session).mark_failed(
                        run_id=claimed.id,
                        lease_token=claimed.lease_token,
                        error_code="invalid_structured_output",
                        retryable=False,
                        retry_delay=timedelta(0),
                    )
                async with database.sessionmaker() as session:
                    failed = await service(session).get_job_description_parsing_status(
                        user,
                        target.id,
                        JobDescriptionParsingStatusQuery(
                            version=1,
                            job_description_version=1,
                        ),
                    )
                assert failed.version == 2
                assert failed.updated_at == role_updated_at
                assert failed.job_description.status == "failed"
                assert "invalid_structured_output" not in (
                    failed.job_description.parsing_failure_reason or ""
                )

                async with database.sessionmaker() as session:
                    retried = await service(session).start_job_description_parsing(
                        user, target.id, request(2)
                    )
                retried_role = next(
                    item for item in retried.roles if item.id == target.id
                )
                assert retried_role.version == 3
                assert retried_role.job_description.status == "parsing"
                async with database.sessionmaker() as session:
                    runs = list((await session.scalars(select(AgentRun))).all())
                    assert len(runs) == 2
                    assert any(item.id == first_run_id for item in runs)

                async with database.sessionmaker() as session:
                    with pytest.raises(APIError) as missing_error:
                        await service(session).start_job_description_parsing(
                            user, missing.id, request()
                        )
                    assert missing_error.value.error == "job_description_missing"

                async with database.sessionmaker() as session:
                    with pytest.raises(APIError) as unavailable_error:
                        await TargetRoleService(session).start_job_description_parsing(
                            user, unavailable.id, request()
                        )
                    assert unavailable_error.value.status_code == (
                        status.HTTP_503_SERVICE_UNAVAILABLE
                    )
                    assert unavailable_error.value.error == (
                        "job_description_parsing_unavailable"
                    )

                async with database.sessionmaker() as session:
                    with pytest.raises(APIError) as isolated:
                        await service(session).get_job_description_parsing_status(
                            other,
                            target.id,
                            JobDescriptionParsingStatusQuery(
                                version=1,
                                job_description_version=1,
                            ),
                        )
                    assert isolated.value.status_code == status.HTTP_404_NOT_FOUND

                async def concurrent_start():
                    async with database.sessionmaker() as session:
                        return await service(session).start_job_description_parsing(
                            user, concurrent.id, request()
                        )

                results = await asyncio.gather(
                    concurrent_start(), concurrent_start(), return_exceptions=True
                )
                assert sum(not isinstance(item, Exception) for item in results) == 1
                conflict = next(item for item in results if isinstance(item, APIError))
                assert conflict.error == "target_role_version_conflict"
                async with database.sessionmaker() as session:
                    stored = await session.get(TargetRole, concurrent.id)
                    assert stored is not None and stored.version == 2
                    assert stored.job_description_parsing_run_id is not None
            finally:
                await database.reset()

    asyncio.run(run_test())


def test_transactional_enqueue_is_invisible_until_role_binding_commits() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                user = owner(uuid4(), "atomic")
                target = role(user.id)
                async with database.sessionmaker() as setup_session:
                    setup_session.add_all([user, target])
                    await setup_session.commit()

                async with database.sessionmaker() as enqueue_session:
                    locked = await enqueue_session.scalar(
                        select(TargetRole)
                        .where(TargetRole.id == target.id)
                        .with_for_update()
                    )
                    assert locked is not None
                    prompt = JOB_DESCRIPTION_PARSING_PROMPT
                    run = await AgentRunService(enqueue_session).enqueue_in_transaction(
                        user_id=user.id,
                        agent_id="job-description-parser",
                        prompt_id=prompt.prompt_id,
                        prompt_version=prompt.version,
                        output_schema_id=prompt.output_schema_id,
                        model="test-model",
                        payload={
                            "roleId": target.id,
                            "jobDescriptionVersion": 1,
                        },
                        idempotency_key=f"atomic:{target.id}:1",
                        max_attempts=3,
                    )
                    locked.job_description_parsing_run_id = run.id
                    locked.version += 1
                    await enqueue_session.flush()

                    async with database.sessionmaker() as worker_session:
                        invisible = await AgentRunService(worker_session).claim_next(
                            lease_owner="atomic-worker",
                            lease_duration=timedelta(minutes=5),
                        )
                    assert invisible is None
                    await enqueue_session.commit()

                async with database.sessionmaker() as worker_session:
                    visible = await AgentRunService(worker_session).claim_next(
                        lease_owner="atomic-worker",
                        lease_duration=timedelta(minutes=5),
                    )
                assert visible is not None and visible.id == run.id
                async with database.sessionmaker() as verify_session:
                    stored = await verify_session.get(TargetRole, target.id)
                    assert stored is not None
                    assert stored.job_description_parsing_run_id == run.id
                    assert stored.version == 2
            finally:
                await database.reset()

    asyncio.run(run_test())
