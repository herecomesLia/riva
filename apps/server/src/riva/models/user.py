from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.auth import AuthSession
    from riva.models.career_profile import CareerProfile
    from riva.models.target_role import TargetRole


def normalize_username(username: str) -> str:
    return username.lower()


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    _username: Mapped[str] = mapped_column("username", String(32))
    _normalized_username: Mapped[str] = mapped_column(
        "normalized_username", String(32), unique=True, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(64))
    avatar_url: Mapped[str | None] = mapped_column(String(2083), nullable=True)
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    active_target_role_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey(
            "target_roles.id",
            name="fk_users_active_target_role_id_target_roles",
            ondelete="SET NULL",
            use_alter=True,
        ),
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

    @hybrid_property
    def username(self) -> str:
        return self._username

    @username.setter
    def username(self, value: str) -> None:
        self._username = value
        self._normalized_username = normalize_username(value)

    @hybrid_property
    def normalized_username(self) -> str:
        return self._normalized_username

    @normalized_username.expression
    def normalized_username(cls):
        return cls._normalized_username

    sessions: Mapped[list[AuthSession]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )

    career_profile: Mapped[CareerProfile | None] = relationship(
        "CareerProfile",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    target_roles: Mapped[list[TargetRole]] = relationship(
        "TargetRole",
        cascade="all, delete-orphan",
        foreign_keys="TargetRole.user_id",
        lazy="selectin",
    )

    active_target_role: Mapped[TargetRole | None] = relationship(
        "TargetRole",
        foreign_keys=[active_target_role_id],
        lazy="selectin",
        post_update=True,
    )
