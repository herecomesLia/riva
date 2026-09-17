from uuid import uuid4

from riva.models.practice import PracticeSession
from riva.models.role import (
    JobDescription,
    JobDescriptionExtraction,
    Role,
    RoleMatchingAnalysis,
)
from riva.models.user import User
from riva.services.role import RoleService
from tests.support.practice import make_input


async def test_delete_role_refreshes_practice_display_snapshot(extraction_database):
    db, input = extraction_database, make_input()
    async with db.sessionmaker() as session:
        user = User(
            id=uuid4(),
            username="Candidate",
            display_name="Candidate",
            password_hash="unused",
        )
        role = Role(
            id=uuid4(),
            user_id=user.id,
            title=input.role.title,
            company=input.role.company,
            jd=JobDescription(**input.role.jd.model_dump()),
            jd_extraction=JobDescriptionExtraction(),
            matching_analysis=RoleMatchingAnalysis(),
        )
        practice = PracticeSession(
            id=uuid4(),
            user_id=user.id,
            role=role,
            profile_snapshot=input.profile,
            role_snapshot=input.role,
            role_title_snapshot=role.title,
            role_company_snapshot=role.company,
            question_type=input.question_type,
            difficulty=input.difficulty,
            max_follow_ups=input.max_follow_ups,
            rounds=[],
        )
        session.add_all([user, practice])
        await session.commit()
        user_id, role_id, practice_id = user.id, role.id, practice.id
        await RoleService(session).update(
            user, role_id, title="Senior Engineer", company="New company"
        )
    async with db.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert (practice.role_title_snapshot, practice.role_company_snapshot) == (
            input.role.title,
            input.role.company,
        )
        assert practice.role_snapshot == input.role
        await RoleService(session).delete(await session.get(User, user_id), role_id)
    async with db.sessionmaker() as session:
        practice = await session.get(PracticeSession, practice_id)
        assert practice.role_id is None
        assert (practice.role_title_snapshot, practice.role_company_snapshot) == (
            "Senior Engineer",
            "New company",
        )
        assert practice.role_snapshot == input.role
