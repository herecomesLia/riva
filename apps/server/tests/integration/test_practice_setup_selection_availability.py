import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from riva.db.database import Database
from riva.models import (
    AgentRun,
    AgentRunStatus,
    CareerProfile,
    PracticeAttempt,
    PracticeSession,
    QuestionCard,
    TargetRole,
    User,
)
from riva.services.practice_sessions import PracticeSessionService
from tests.integration.test_question_generation import database_url


pytestmark = pytest.mark.integration
NOW = datetime(2026, 8, 20, 9, 0, tzinfo=UTC)


def create_user() -> User:
    user_id = uuid4()
    return User(
        id=user_id,
        username=user_id.hex,
        normalized_username=user_id.hex,
        password_hash="hash",
        display_name="Practice Setup Availability User",
    )


def create_role(
    user_id: UUID,
    title: str,
    *,
    archived: bool = False,
) -> TargetRole:
    return TargetRole(
        id=uuid4(),
        user_id=user_id,
        title=title,
        company="Riva",
        recruitment_type="experienced",
        preparation_status="archived" if archived else "preparing",
        job_description_status="missing",
        version=1,
        created_at=NOW,
        updated_at=NOW,
    )


def create_run(user_id: UUID) -> AgentRun:
    run_id = uuid4()
    return AgentRun(
        id=run_id,
        user_id=user_id,
        agent_id="selection-availability-seed",
        prompt_id="selection-availability-seed",
        prompt_version="1",
        output_schema_id="selection-availability-seed-v1",
        status=AgentRunStatus.SUCCEEDED,
        payload={"runId": str(run_id)},
        idempotency_key=str(run_id),
        attempt_count=1,
        max_attempts=1,
        started_at=NOW,
        finished_at=NOW,
        provider="seed-provider",
        model="seed-model",
        input_tokens=1,
        output_tokens=1,
        result={"seeded": True},
    )


def create_card(
    *,
    user_id: UUID,
    role_id: UUID,
    profile_id: UUID,
    run: AgentRun,
    question_type: str,
    difficulty: str,
    language: str = "en",
    saved: bool = False,
) -> QuestionCard:
    return QuestionCard(
        id=uuid4(),
        user_id=user_id,
        target_role_id=role_id,
        profile_id=profile_id,
        source_agent_run_id=run.id,
        matching_analysis_run_id=run.id,
        language=language,
        question_type=question_type,
        difficulty=difficulty,
        prompt=f"{question_type} {difficulty} {run.id}",
        assessed_capabilities=[],
        recommended_materials=[],
        answer_hints=[],
        answer_framework=[],
        follow_up_directions=[],
        scoring_focus=[],
        profile_version=1,
        job_description_version=1,
        job_description_analysis_version=1,
        is_saved=saved,
        is_marked_weak=False,
        created_at=NOW,
        updated_at=NOW,
    )


def create_completed_attempt(
    *,
    user_id: UUID,
    role_id: UUID,
    card: QuestionCard,
    offset: int,
) -> tuple[PracticeSession, PracticeAttempt]:
    completed_at = NOW + timedelta(minutes=offset)
    practice_session = PracticeSession(
        id=uuid4(),
        user_id=user_id,
        target_role_id=role_id,
        language=card.language,
        version=1,
        status="completed",
        initial_question_type=card.question_type,
        initial_difficulty=card.difficulty,
        source="personalized",
        prioritize_weaknesses=False,
        started_at=completed_at - timedelta(minutes=5),
        completed_at=completed_at,
        completion_reason="reviewCompleted",
        created_at=completed_at - timedelta(minutes=5),
        updated_at=completed_at,
    )
    attempt = PracticeAttempt(
        id=uuid4(),
        user_id=user_id,
        session_id=practice_session.id,
        attempt_number=1,
        question_type=card.question_type,
        difficulty=card.difficulty,
        status="completed",
        question_card_id=card.id,
        completed_at=completed_at,
        created_at=completed_at - timedelta(minutes=5),
        updated_at=completed_at,
    )
    return practice_session, attempt


def test_setup_availability_is_selection_aware_and_scoped() -> None:
    async def run_test() -> None:
        async with Database(database_url()) as database:
            await database.reset()
            try:
                owner = create_user()
                profile = CareerProfile(
                    profile_id=uuid4(), user_id=owner.id, version=1
                )
                role_a = create_role(owner.id, "Role A")
                role_b = create_role(owner.id, "Role B")
                archived_role = create_role(
                    owner.id, "Archived Role", archived=True
                )

                other_owner = create_user()
                other_profile = CareerProfile(
                    profile_id=uuid4(), user_id=other_owner.id, version=1
                )
                other_role = create_role(other_owner.id, "Other User Role")

                card_specs = [
                    (
                        owner,
                        profile,
                        role_a,
                        "projectDeepDive",
                        "basic",
                        "en",
                        True,
                    ),
                    (
                        owner,
                        profile,
                        role_a,
                        "projectDeepDive",
                        "basic",
                        "en",
                        True,
                    ),
                    (
                        owner,
                        profile,
                        role_a,
                        "projectDeepDive",
                        "pressure",
                        "en",
                        False,
                    ),
                    (
                        owner,
                        profile,
                        role_a,
                        "behavioral",
                        "pressure",
                        "en",
                        True,
                    ),
                    (
                        owner,
                        profile,
                        role_b,
                        "behavioral",
                        "basic",
                        "en",
                        False,
                    ),
                    (
                        owner,
                        profile,
                        role_b,
                        "projectDeepDive",
                        "basic",
                        "en",
                        True,
                    ),
                    (
                        owner,
                        profile,
                        role_a,
                        "projectDeepDive",
                        "basic",
                        "zh-CN",
                        True,
                    ),
                    (
                        owner,
                        profile,
                        archived_role,
                        "projectDeepDive",
                        "basic",
                        "en",
                        True,
                    ),
                    (
                        other_owner,
                        other_profile,
                        other_role,
                        "projectDeepDive",
                        "basic",
                        "en",
                        True,
                    ),
                ]
                cards: list[QuestionCard] = []
                runs: list[AgentRun] = []
                for (
                    card_owner,
                    card_profile,
                    role,
                    question_type,
                    difficulty,
                    language,
                    saved,
                ) in card_specs:
                    run = create_run(card_owner.id)
                    runs.append(run)
                    cards.append(
                        create_card(
                            user_id=card_owner.id,
                            role_id=role.id,
                            profile_id=card_profile.profile_id,
                            run=run,
                            question_type=question_type,
                            difficulty=difficulty,
                            language=language,
                            saved=saved,
                        )
                    )

                history_specs = [
                    (cards[0], owner.id, role_a.id),
                    (cards[0], owner.id, role_a.id),
                    (cards[2], owner.id, role_a.id),
                    (cards[4], owner.id, role_b.id),
                    (cards[6], owner.id, role_a.id),
                    (cards[7], owner.id, archived_role.id),
                    (cards[8], other_owner.id, other_role.id),
                ]
                sessions_and_attempts = [
                    create_completed_attempt(
                        user_id=user_id,
                        role_id=role_id,
                        card=card,
                        offset=index + 1,
                    )
                    for index, (card, user_id, role_id) in enumerate(
                        history_specs
                    )
                ]

                async with database.sessionmaker() as session:
                    session.add_all(
                        [
                            owner,
                            other_owner,
                            profile,
                            other_profile,
                            role_a,
                            role_b,
                            archived_role,
                            other_role,
                            *runs,
                            *cards,
                            *(item for pair in sessions_and_attempts for item in pair),
                        ]
                    )
                    await session.commit()

                async with database.sessionmaker() as session:
                    capabilities = await PracticeSessionService(
                        session
                    ).get_setup_capabilities(
                        user_id=owner.id,
                        interaction_language="en",
                    )

                availability = {
                    (
                        item.target_role_id,
                        item.question_type.value,
                        item.difficulty.value,
                    ): (item.saved_question_count, item.history_question_count)
                    for item in capabilities.question_source_availability
                }
                assert availability == {
                    (role_a.id, "behavioral", "pressure"): (1, 0),
                    (role_a.id, "projectDeepDive", "basic"): (2, 1),
                    (role_a.id, "projectDeepDive", "pressure"): (0, 1),
                    (role_b.id, "behavioral", "basic"): (0, 1),
                    (role_b.id, "projectDeepDive", "basic"): (1, 0),
                }
                assert capabilities.saved_question_count == 4
                assert capabilities.history_question_count == 3
            finally:
                await database.reset()

    asyncio.run(run_test())
