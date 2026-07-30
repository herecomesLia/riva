from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.agent_runs import AgentRun
    from riva.models.auth import AuthSession
    from riva.models.profile import CareerProfile
    from riva.models.roles import CurrentTargetRole, TargetRole


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    username: Mapped[str] = mapped_column(String(32))
    normalized_username: Mapped[str] = mapped_column(
        String(32), unique=True, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(64))
    avatar_url: Mapped[str | None] = mapped_column(String(2083), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    sessions: Mapped[list[AuthSession]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    agent_runs: Mapped[list[AgentRun]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    career_profile: Mapped[CareerProfile | None] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )
    target_roles: Mapped[list[TargetRole]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="TargetRole.user_id",
        passive_deletes=True,
    )
    current_target_role: Mapped[CurrentTargetRole | None] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="CurrentTargetRole.user_id",
        overlaps="current_target_role,role",
        passive_deletes=True,
        uselist=False,
    )
