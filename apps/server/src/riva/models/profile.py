from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.user import User


class Profile(Base):
    __tablename__ = "profiles"

    profile_id: Mapped[UUID] = mapped_column(
        "id",
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    education: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    work_experiences: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON,
        default=list,
    )
    project_experiences: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON,
        default=list,
    )
    skills: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    user: Mapped[User] = relationship(back_populates="profile")
