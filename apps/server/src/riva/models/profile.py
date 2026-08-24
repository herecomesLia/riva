from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now


def _empty_profile_content() -> dict[str, Any]:
    return {
        "summary": None,
        "education": [],
        "work_experiences": [],
        "project_experiences": [],
        "skills": [],
    }


class CareerProfile(Base):
    """The user's editable career profile document.

    Profile sections are stored as one JSON document so their ordering and
    cross-section skill references are updated atomically with the aggregate.
    ``user_id`` is both the owner foreign key and the aggregate primary key;
    the profile has no independent identity.
    """

    __tablename__ = "career_profiles"
    __table_args__ = (CheckConstraint("version >= 1"),)

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    version: Mapped[int] = mapped_column(default=1, nullable=False)
    content: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=_empty_profile_content,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )
