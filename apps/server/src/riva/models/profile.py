from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.utils import utc_now

if TYPE_CHECKING:
    from riva.models.question_cards import QuestionCard
    from riva.models.user import User


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )


class CareerProfile(TimestampMixin, Base):
    __tablename__ = "career_profiles"
    __table_args__ = (
        CheckConstraint("version >= 1"),
        UniqueConstraint(
            "user_id",
            "id",
            name="uq_career_profiles_user_id_id",
        ),
    )

    profile_id: Mapped[UUID] = mapped_column(
        "id",
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(default=1)

    user: Mapped[User] = relationship(back_populates="career_profile")
    education: Mapped[list[CareerProfileEducation]] = relationship(
        back_populates="career_profile",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CareerProfileEducation.position",
    )
    work_experiences: Mapped[list[CareerProfileWorkExperience]] = relationship(
        back_populates="career_profile",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CareerProfileWorkExperience.position",
    )
    project_experiences: Mapped[list[CareerProfileProjectExperience]] = relationship(
        back_populates="career_profile",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CareerProfileProjectExperience.position",
    )
    skills: Mapped[list[CareerProfileSkill]] = relationship(
        back_populates="career_profile",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CareerProfileSkill.position",
    )
    question_cards: Mapped[list[QuestionCard]] = relationship(
        back_populates="career_profile",
        cascade="all, delete-orphan",
        foreign_keys="[QuestionCard.user_id, QuestionCard.profile_id]",
        passive_deletes=True,
        overlaps="user,question_cards",
    )


class CareerProfileEducation(TimestampMixin, Base):
    __tablename__ = "career_profile_educations"
    __table_args__ = (
        CheckConstraint("position >= 0"),
        UniqueConstraint(
            "career_profile_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    career_profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("career_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(nullable=False)
    school: Mapped[str] = mapped_column(String(255))
    degree: Mapped[str | None] = mapped_column(String(255), nullable=True)
    major: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_date: Mapped[str] = mapped_column(String(7))
    end_date: Mapped[str | None] = mapped_column(String(7), nullable=True)
    is_current: Mapped[bool] = mapped_column(default=False)
    source: Mapped[str] = mapped_column(String(32), default="userAdded")

    career_profile: Mapped[CareerProfile] = relationship(back_populates="education")


class CareerProfileWorkExperience(TimestampMixin, Base):
    __tablename__ = "career_profile_work_experiences"
    __table_args__ = (
        CheckConstraint("position >= 0"),
        UniqueConstraint(
            "career_profile_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    career_profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("career_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(nullable=False)
    company: Mapped[str] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(255))
    employment_type: Mapped[str] = mapped_column(String(32))
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_date: Mapped[str] = mapped_column(String(7))
    end_date: Mapped[str | None] = mapped_column(String(7), nullable=True)
    is_current: Mapped[bool] = mapped_column(default=False)
    responsibilities: Mapped[list[str]] = mapped_column(JSON, default=list)
    achievements: Mapped[list[str]] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(32), default="userAdded")

    career_profile: Mapped[CareerProfile] = relationship(
        back_populates="work_experiences"
    )
    skill_links: Mapped[list[CareerProfileWorkSkill]] = relationship(
        back_populates="work_experience",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CareerProfileWorkSkill.position",
    )

    @property
    def skill_ids(self) -> list[UUID]:
        return [link.skill_id for link in self.skill_links]


class CareerProfileProjectExperience(TimestampMixin, Base):
    __tablename__ = "career_profile_project_experiences"
    __table_args__ = (
        CheckConstraint("position >= 0"),
        UniqueConstraint(
            "career_profile_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    career_profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("career_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_date: Mapped[str] = mapped_column(String(7))
    end_date: Mapped[str | None] = mapped_column(String(7), nullable=True)
    responsibilities: Mapped[list[str]] = mapped_column(JSON, default=list)
    achievements: Mapped[list[str]] = mapped_column(JSON, default=list)
    project_url: Mapped[str | None] = mapped_column(String(2083), nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="userAdded")

    career_profile: Mapped[CareerProfile] = relationship(
        back_populates="project_experiences"
    )
    skill_links: Mapped[list[CareerProfileProjectSkill]] = relationship(
        back_populates="project_experience",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CareerProfileProjectSkill.position",
    )

    @property
    def skill_ids(self) -> list[UUID]:
        return [link.skill_id for link in self.skill_links]


class CareerProfileSkill(TimestampMixin, Base):
    __tablename__ = "career_profile_skills"
    __table_args__ = (
        CheckConstraint("position >= 0"),
        UniqueConstraint(
            "career_profile_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
        ),
        UniqueConstraint(
            "career_profile_id",
            "normalized_name",
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    career_profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("career_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(255))
    normalized_name: Mapped[str] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(32), default="userAdded")

    career_profile: Mapped[CareerProfile] = relationship(back_populates="skills")
    work_links: Mapped[list[CareerProfileWorkSkill]] = relationship(
        back_populates="skill",
        passive_deletes=True,
    )
    project_links: Mapped[list[CareerProfileProjectSkill]] = relationship(
        back_populates="skill",
        passive_deletes=True,
    )


class CareerProfileWorkSkill(TimestampMixin, Base):
    __tablename__ = "career_profile_work_skills"
    __table_args__ = (
        CheckConstraint("position >= 0"),
        UniqueConstraint("work_experience_id", "skill_id"),
        UniqueConstraint(
            "work_experience_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    career_profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("career_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    work_experience_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("career_profile_work_experiences.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    skill_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("career_profile_skills.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(nullable=False)

    work_experience: Mapped[CareerProfileWorkExperience] = relationship(
        back_populates="skill_links"
    )
    skill: Mapped[CareerProfileSkill] = relationship(back_populates="work_links")


class CareerProfileProjectSkill(TimestampMixin, Base):
    __tablename__ = "career_profile_project_skills"
    __table_args__ = (
        CheckConstraint("position >= 0"),
        UniqueConstraint("project_experience_id", "skill_id"),
        UniqueConstraint(
            "project_experience_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    career_profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("career_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_experience_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("career_profile_project_experiences.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    skill_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("career_profile_skills.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(nullable=False)

    project_experience: Mapped[CareerProfileProjectExperience] = relationship(
        back_populates="skill_links"
    )
    skill: Mapped[CareerProfileSkill] = relationship(back_populates="project_links")
