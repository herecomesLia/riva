import asyncio
import os
from uuid import UUID, uuid4

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from riva.db.database import Database
from riva.models import (
    CareerProfile,
    CareerProfileEducation,
    CareerProfileSkill,
    CurrentTargetRole,
    TargetRole,
    User,
)
from riva.schemas.roles import (
    ArchiveTargetRoleRequest,
    CreateTargetRoleRequest,
    SaveJobDescriptionRequest,
    SetCurrentTargetRoleRequest,
    UpdatePreparationStatusRequest,
    UpdateTargetRoleRequest,
)
from riva.services.errors import ResourceMissingError, ServiceError
from riva.services.jobs.roles import TargetRoleService

pytestmark = pytest.mark.integration


def user(user_id: UUID, username: str) -> User:
    return User(
        id=user_id,
        username=username,
        normalized_username=username,
        password_hash="hash",
        display_name=username,
    )


def create_request(
    title: str,
    preparation_status: str = "preparing",
) -> CreateTargetRoleRequest:
    return CreateTargetRoleRequest.model_validate(
        {
            "title": title,
            "company": "Riva",
            "recruitmentType": "experienced",
            "location": "Shanghai",
            "experienceRange": {"minYears": 2, "maxYears": 5},
            "preparationStatus": preparation_status,
        }
    )


def update_request(version: int, title: str) -> UpdateTargetRoleRequest:
    return UpdateTargetRoleRequest.model_validate(
        {
            "version": version,
            "title": title,
            "company": "",
            "recruitmentType": "campus",
            "location": "",
            "experienceRange": {"minYears": None, "maxYears": 3},
        }
    )


async def page(database: Database, owner: User):
    async with database.sessionmaker() as session:
        return await TargetRoleService(session).get_roles_page(owner)


class FailingTargetRoleService(TargetRoleService):
    async def _roles_page(self, user_id: UUID):
        raise RuntimeError("forced response failure")


def test_roles_transactions_concurrency_profiles_and_constraints() -> None:
    test_database_url = os.getenv("RIVA_TEST_DATABASE_URL")
    if not test_database_url:
        pytest.skip("Set RIVA_TEST_DATABASE_URL to run database integration tests.")

    development_database_url = os.getenv("RIVA_DATABASE_URL")
    if development_database_url == test_database_url:
        pytest.fail("RIVA_TEST_DATABASE_URL must not equal RIVA_DATABASE_URL.")

    async def run() -> None:
        user_ids = [uuid4() for _ in range(15)]
        users = [
            user(user_id, f"roles-user-{index}")
            for index, user_id in enumerate(user_ids)
        ]

        async with Database(test_database_url) as database:
            await database.reset()
            try:
                async with database.sessionmaker() as session:
                    session.add_all(users)
                    await session.commit()

                owner = users[0]
                empty = await page(database, owner)
                assert empty.roles == []
                assert empty.current_role_id is None
                assert empty.profile_context.exists is False

                async with database.sessionmaker() as session:
                    service = TargetRoleService(session)
                    first_page = await service.create_role(
                        owner,
                        create_request("Backend Engineer"),
                    )
                    first = first_page.roles[0]
                    assert first_page.current_role_id == first.id
                    assert first.version == 1
                    assert first.job_description.status == "missing"

                async with database.sessionmaker() as session:
                    duplicate_page = await TargetRoleService(session).create_role(
                        owner,
                        create_request("Backend Engineer", "paused"),
                    )
                    assert [role.title for role in duplicate_page.roles] == [
                        "Backend Engineer",
                        "Backend Engineer",
                    ]
                    second = duplicate_page.roles[1]
                    assert duplicate_page.current_role_id == first.id

                async with database.sessionmaker() as session:
                    updated_page = await TargetRoleService(session).update_role(
                        owner,
                        first.id,
                        update_request(1, "Platform Engineer"),
                    )
                    updated = next(
                        role for role in updated_page.roles if role.id == first.id
                    )
                    assert updated.version == 2
                    assert updated.title == "Platform Engineer"
                    assert updated.company is None
                    assert updated.preparation_status == "preparing"
                    assert updated.job_description.status == "missing"

                updated_at = updated.updated_at
                async with database.sessionmaker() as session:
                    update_no_op_page = await TargetRoleService(session).update_role(
                        owner,
                        first.id,
                        update_request(2, "Platform Engineer"),
                    )
                    update_no_op = next(
                        role for role in update_no_op_page.roles if role.id == first.id
                    )
                    assert update_no_op.version == 2
                    assert update_no_op.updated_at == updated_at
                async with database.sessionmaker() as session:
                    with pytest.raises(ServiceError) as stale_update_no_op:
                        await TargetRoleService(session).update_role(
                            owner,
                            first.id,
                            update_request(1, "Platform Engineer"),
                        )
                    assert (
                        stale_update_no_op.value.error == "target_role_version_conflict"
                    )

                async with database.sessionmaker() as session:
                    current_no_op = await TargetRoleService(session).set_current_role(
                        owner,
                        first.id,
                        SetCurrentTargetRoleRequest(version=2),
                    )
                    assert current_no_op.current_role_id == first.id
                    assert current_no_op.roles[0].version == 2
                async with database.sessionmaker() as session:
                    with pytest.raises(ServiceError) as stale_current_no_op:
                        await TargetRoleService(session).set_current_role(
                            owner,
                            first.id,
                            SetCurrentTargetRoleRequest(version=1),
                        )
                    assert (
                        stale_current_no_op.value.error
                        == "target_role_version_conflict"
                    )

                async with database.sessionmaker() as session:
                    paused_page = await TargetRoleService(
                        session
                    ).update_preparation_status(
                        owner,
                        first.id,
                        UpdatePreparationStatusRequest(
                            version=2,
                            preparation_status="paused",
                        ),
                    )
                    paused = next(
                        role for role in paused_page.roles if role.id == first.id
                    )
                    assert paused.version == 3
                    assert paused_page.current_role_id == first.id

                async with database.sessionmaker() as session:
                    no_op = await TargetRoleService(session).update_preparation_status(
                        owner,
                        first.id,
                        UpdatePreparationStatusRequest(
                            version=3,
                            preparation_status="paused",
                        ),
                    )
                    assert (
                        next(
                            role for role in no_op.roles if role.id == first.id
                        ).version
                        == 3
                    )

                async with database.sessionmaker() as session:
                    with pytest.raises(ServiceError) as stale_no_op:
                        await TargetRoleService(session).update_preparation_status(
                            owner,
                            first.id,
                            UpdatePreparationStatusRequest(
                                version=2,
                                preparation_status="paused",
                            ),
                        )
                    assert stale_no_op.value.error == "target_role_version_conflict"

                second_updated_at = second.updated_at
                async with database.sessionmaker() as session:
                    current_page = await TargetRoleService(session).set_current_role(
                        owner,
                        second.id,
                        SetCurrentTargetRoleRequest(version=1),
                    )
                    current_second = next(
                        role for role in current_page.roles if role.id == second.id
                    )
                    assert current_page.current_role_id == second.id
                    assert current_second.version == 1
                    assert current_second.updated_at == second_updated_at

                async with database.sessionmaker() as session:
                    archived_page = await TargetRoleService(session).archive_role(
                        owner,
                        second.id,
                        ArchiveTargetRoleRequest(version=1),
                    )
                    archived = next(
                        role for role in archived_page.roles if role.id == second.id
                    )
                    assert archived.preparation_status == "archived"
                    assert archived.version == 2
                    assert archived_page.current_role_id is None

                async with database.sessionmaker() as session:
                    archive_no_op = await TargetRoleService(session).archive_role(
                        owner,
                        second.id,
                        ArchiveTargetRoleRequest(version=2),
                    )
                    assert (
                        next(
                            role for role in archive_no_op.roles if role.id == second.id
                        ).version
                        == 2
                    )
                async with database.sessionmaker() as session:
                    with pytest.raises(ServiceError) as stale_archive_no_op:
                        await TargetRoleService(session).archive_role(
                            owner,
                            second.id,
                            ArchiveTargetRoleRequest(version=1),
                        )
                    assert (
                        stale_archive_no_op.value.error
                        == "target_role_version_conflict"
                    )

                async with database.sessionmaker() as session:
                    with pytest.raises(ServiceError) as archived_current:
                        await TargetRoleService(session).set_current_role(
                            owner,
                            second.id,
                            SetCurrentTargetRoleRequest(version=2),
                        )
                    assert archived_current.value.error == "target_role_state_conflict"

                async with database.sessionmaker() as session:
                    preparing_page = await TargetRoleService(
                        session
                    ).update_preparation_status(
                        owner,
                        first.id,
                        UpdatePreparationStatusRequest(
                            version=3,
                            preparation_status="preparing",
                        ),
                    )
                    preparing_first = next(
                        role for role in preparing_page.roles if role.id == first.id
                    )
                    assert preparing_first.version == 4

                async with database.sessionmaker() as session:
                    await TargetRoleService(session).set_current_role(
                        owner,
                        first.id,
                        SetCurrentTargetRoleRequest(version=4),
                    )
                async with database.sessionmaker() as session:
                    third_page = await TargetRoleService(session).create_role(
                        owner,
                        create_request("Site Reliability Engineer"),
                    )
                    third = third_page.roles[2]
                async with database.sessionmaker() as session:
                    fourth_page = await TargetRoleService(session).create_role(
                        owner,
                        create_request("Infrastructure Engineer"),
                    )
                    fourth = fourth_page.roles[3]
                async with database.sessionmaker() as session:
                    fallback_page = await TargetRoleService(session).archive_role(
                        owner,
                        first.id,
                        ArchiveTargetRoleRequest(version=4),
                    )
                    assert fallback_page.current_role_id == third.id
                async with database.sessionmaker() as session:
                    deleted_current = await TargetRoleService(session).delete_role(
                        owner,
                        third.id,
                        1,
                    )
                    assert deleted_current.current_role_id == fourth.id
                    assert all(role.id != third.id for role in deleted_current.roles)
                async with database.sessionmaker() as session:
                    deleted_fallback = await TargetRoleService(session).delete_role(
                        owner,
                        fourth.id,
                        1,
                    )
                    assert deleted_fallback.current_role_id is None
                    assert all(
                        role.preparation_status == "archived"
                        for role in deleted_fallback.roles
                    )

                archived_owner = users[1]
                async with database.sessionmaker() as session:
                    old_page = await TargetRoleService(session).create_role(
                        archived_owner,
                        create_request("Old Role"),
                    )
                    old = old_page.roles[0]
                async with database.sessionmaker() as session:
                    await TargetRoleService(session).archive_role(
                        archived_owner,
                        old.id,
                        ArchiveTargetRoleRequest(version=1),
                    )
                async with database.sessionmaker() as session:
                    new_page = await TargetRoleService(session).create_role(
                        archived_owner,
                        create_request("New Paused Role", "paused"),
                    )
                    assert new_page.current_role_id == new_page.roles[1].id

                active_without_current = users[2]
                async with database.sessionmaker() as session:
                    active_page = await TargetRoleService(session).create_role(
                        active_without_current,
                        create_request("Existing Paused", "paused"),
                    )
                    await session.execute(
                        delete(CurrentTargetRole).where(
                            CurrentTargetRole.user_id == active_without_current.id
                        )
                    )
                    await session.commit()
                async with database.sessionmaker() as session:
                    no_auto_page = await TargetRoleService(session).create_role(
                        active_without_current,
                        create_request("Additional Preparing"),
                    )
                    assert no_auto_page.current_role_id is None
                    assert len(no_auto_page.roles) == 2
                    assert active_page.roles[0].id == no_auto_page.roles[0].id

                delete_owner = users[3]
                async with database.sessionmaker() as session:
                    only_page = await TargetRoleService(session).create_role(
                        delete_owner,
                        create_request("Only Role"),
                    )
                    only = only_page.roles[0]
                async with database.sessionmaker() as session:
                    deleted_last = await TargetRoleService(session).delete_role(
                        delete_owner,
                        only.id,
                        1,
                    )
                    assert deleted_last.roles == []
                    assert deleted_last.current_role_id is None

                jd_owner = users[4]
                async with database.sessionmaker() as session:
                    jd_page = await TargetRoleService(session).create_role(
                        jd_owner,
                        create_request("JD Role"),
                    )
                    jd_role = jd_page.roles[0]
                async with database.sessionmaker() as session:
                    first_jd_page = await TargetRoleService(
                        session
                    ).save_job_description(
                        jd_owner,
                        jd_role.id,
                        SaveJobDescriptionRequest(
                            version=1,
                            raw_text="Build reliable APIs.",
                        ),
                    )
                    first_jd = first_jd_page.roles[0]
                    assert first_jd.version == 2
                    assert first_jd.job_description.status == "saved"
                    assert first_jd.job_description.version == 1
                    assert first_jd.job_description_analysis is None
                    assert first_jd.matching_analysis is None
                async with database.sessionmaker() as session:
                    same_jd_page = await TargetRoleService(
                        session
                    ).save_job_description(
                        jd_owner,
                        jd_role.id,
                        SaveJobDescriptionRequest(
                            version=2,
                            raw_text="Build reliable APIs.",
                        ),
                    )
                    same_jd = same_jd_page.roles[0]
                    assert same_jd.version == 2
                    assert same_jd.job_description.version == 1
                async with database.sessionmaker() as session:
                    with pytest.raises(ServiceError) as stale_jd:
                        await TargetRoleService(session).save_job_description(
                            jd_owner,
                            jd_role.id,
                            SaveJobDescriptionRequest(
                                version=1,
                                raw_text="Build reliable APIs.",
                            ),
                        )
                    assert stale_jd.value.error == "target_role_version_conflict"
                async with database.sessionmaker() as session:
                    changed_jd_page = await TargetRoleService(
                        session
                    ).save_job_description(
                        jd_owner,
                        jd_role.id,
                        SaveJobDescriptionRequest(
                            version=2,
                            raw_text="Build distributed systems.",
                        ),
                    )
                    changed_jd = changed_jd_page.roles[0]
                    assert changed_jd.version == 3
                    assert changed_jd.job_description.version == 2

                other_owner = users[5]
                async with database.sessionmaker() as session:
                    other_page = await TargetRoleService(session).create_role(
                        other_owner,
                        create_request("Private Role"),
                    )
                    private_role = other_page.roles[0]
                async with database.sessionmaker() as session:
                    with pytest.raises(ServiceError) as isolated:
                        await TargetRoleService(session).update_role(
                            owner,
                            private_role.id,
                            update_request(1, "Stolen"),
                        )
                    assert isinstance(isolated.value, ResourceMissingError)
                    assert isolated.value.error == "target_role_not_found"

                concurrent_owner = users[6]
                async with database.sessionmaker() as session:
                    concurrent_page = await TargetRoleService(session).create_role(
                        concurrent_owner,
                        create_request("Concurrent"),
                    )
                    concurrent_role = concurrent_page.roles[0]

                async def concurrent_update(title: str):
                    async with database.sessionmaker() as session:
                        return await TargetRoleService(session).update_role(
                            concurrent_owner,
                            concurrent_role.id,
                            update_request(1, title),
                        )

                update_results = await asyncio.gather(
                    concurrent_update("First Winner"),
                    concurrent_update("Second Winner"),
                    return_exceptions=True,
                )
                assert (
                    sum(
                        not isinstance(result, BaseException)
                        for result in update_results
                    )
                    == 1
                )
                conflicts = [
                    result
                    for result in update_results
                    if isinstance(result, ServiceError)
                ]
                assert len(conflicts) == 1
                assert conflicts[0].error == "target_role_version_conflict"

                current_owner = users[7]
                async with database.sessionmaker() as session:
                    current_first_page = await TargetRoleService(session).create_role(
                        current_owner,
                        create_request("Current One"),
                    )
                    current_first = current_first_page.roles[0]
                async with database.sessionmaker() as session:
                    current_both_page = await TargetRoleService(session).create_role(
                        current_owner,
                        create_request("Current Two"),
                    )
                    current_second = current_both_page.roles[1]

                async def concurrent_current(role_id: UUID):
                    async with database.sessionmaker() as session:
                        return await TargetRoleService(session).set_current_role(
                            current_owner,
                            role_id,
                            SetCurrentTargetRoleRequest(version=1),
                        )

                current_results = await asyncio.gather(
                    concurrent_current(current_first.id),
                    concurrent_current(current_second.id),
                )
                assert len(current_results) == 2
                final_current = await page(database, current_owner)
                assert final_current.current_role_id in {
                    current_first.id,
                    current_second.id,
                }
                assert [role.version for role in final_current.roles] == [1, 1]
                async with database.sessionmaker() as session:
                    mapping_count = await session.scalar(
                        select(func.count())
                        .select_from(CurrentTargetRole)
                        .where(CurrentTargetRole.user_id == current_owner.id)
                    )
                    assert mapping_count == 1

                rollback_owner = users[8]
                async with database.sessionmaker() as session:
                    rollback_page = await TargetRoleService(session).create_role(
                        rollback_owner,
                        create_request("Persisted"),
                    )
                    rollback_role = rollback_page.roles[0]
                async with database.sessionmaker() as session:
                    with pytest.raises(RuntimeError, match="forced response failure"):
                        await FailingTargetRoleService(session).update_role(
                            rollback_owner,
                            rollback_role.id,
                            update_request(1, "Must Roll Back"),
                        )
                persisted = await page(database, rollback_owner)
                assert persisted.roles[0].title == "Persisted"
                assert persisted.roles[0].version == 1

                profile_users = users[9:13]
                async with database.sessionmaker() as session:
                    no_skills = CareerProfile(
                        profile_id=uuid4(),
                        user_id=profile_users[0].id,
                        version=2,
                    )
                    no_skills.education = [
                        CareerProfileEducation(
                            id=uuid4(),
                            position=0,
                            school="University",
                            start_date="2020-01",
                            end_date="2024-01",
                            is_current=False,
                            source="userAdded",
                        )
                    ]
                    skills_only = CareerProfile(
                        profile_id=uuid4(),
                        user_id=profile_users[1].id,
                        version=3,
                    )
                    skills_only.skills = [
                        CareerProfileSkill(
                            id=uuid4(),
                            position=0,
                            name="Python",
                            normalized_name="python",
                            source="userAdded",
                        )
                    ]
                    complete = CareerProfile(
                        profile_id=uuid4(),
                        user_id=profile_users[2].id,
                        version=4,
                    )
                    complete.skills = [
                        CareerProfileSkill(
                            id=uuid4(),
                            position=0,
                            name="SQL",
                            normalized_name="sql",
                            source="userAdded",
                        )
                    ]
                    complete.education = [
                        CareerProfileEducation(
                            id=uuid4(),
                            position=0,
                            school="University",
                            start_date="2020-01",
                            end_date="2024-01",
                            is_current=False,
                            source="userAdded",
                        )
                    ]
                    session.add_all([no_skills, skills_only, complete])
                    await session.commit()

                missing_context = await page(database, profile_users[3])
                no_skills_context = await page(database, profile_users[0])
                skills_only_context = await page(database, profile_users[1])
                complete_context = await page(database, profile_users[2])
                assert missing_context.profile_context.exists is False
                assert no_skills_context.profile_context.version == 2
                assert no_skills_context.profile_context.completed is False
                assert skills_only_context.profile_context.version == 3
                assert skills_only_context.profile_context.completed is True
                assert complete_context.profile_context.version == 4
                assert complete_context.profile_context.completed is True

                wrong_mapping_owner = users[13]
                cascade_owner = users[14]
                async with database.sessionmaker() as session:
                    cascade_page = await TargetRoleService(session).create_role(
                        cascade_owner,
                        create_request("Cascade Role"),
                    )
                    cascade_role = cascade_page.roles[0]
                async with database.sessionmaker() as session:
                    session.add(
                        CurrentTargetRole(
                            user_id=wrong_mapping_owner.id,
                            role_id=cascade_role.id,
                        )
                    )
                    with pytest.raises(IntegrityError):
                        await session.commit()
                    await session.rollback()
                async with database.sessionmaker() as session:
                    await session.execute(
                        delete(User).where(User.id == cascade_owner.id)
                    )
                    await session.commit()
                async with database.sessionmaker() as session:
                    role_count = await session.scalar(
                        select(func.count())
                        .select_from(TargetRole)
                        .where(TargetRole.user_id == cascade_owner.id)
                    )
                    current_count = await session.scalar(
                        select(func.count())
                        .select_from(CurrentTargetRole)
                        .where(CurrentTargetRole.user_id == cascade_owner.id)
                    )
                    assert role_count == 0
                    assert current_count == 0
            finally:
                await database.drop_tables()

    asyncio.run(run())
