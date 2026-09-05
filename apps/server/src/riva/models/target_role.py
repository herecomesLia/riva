from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Enum, ForeignKey, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.db.types import PydanticJSONB
from riva.models.types import NonBlankStr
from riva.utils import utc_now


class RecruitmentTrack(StrEnum):
    CAMPUS = "campus"
    EXPERIENCED = "experienced"


class JobRequirements(BaseModel):
    education: list[NonBlankStr] = Field(default_factory=list)
    graduation_cohorts: list[NonBlankStr] = Field(default_factory=list)
    majors: list[NonBlankStr] = Field(default_factory=list)
    experience: list[NonBlankStr] = Field(default_factory=list)
    languages: list[NonBlankStr] = Field(default_factory=list)
    certifications: list[NonBlankStr] = Field(default_factory=list)
    other: list[NonBlankStr] = Field(default_factory=list)


class HardSkills(BaseModel):
    programming_languages: list[NonBlankStr] = Field(default_factory=list)
    frameworks_and_libraries: list[NonBlankStr] = Field(default_factory=list)
    platforms: list[NonBlankStr] = Field(default_factory=list)
    tools: list[NonBlankStr] = Field(default_factory=list)
    concepts_and_methods: list[NonBlankStr] = Field(default_factory=list)
    databases_and_middleware: list[NonBlankStr] = Field(default_factory=list)
    other: list[NonBlankStr] = Field(default_factory=list)


class JobDescriptionContent(BaseModel):
    responsibilities: list[NonBlankStr] = Field(default_factory=list)
    requirements: JobRequirements = Field(default_factory=JobRequirements)
    hard_skills: HardSkills = Field(default_factory=HardSkills)
    soft_skills: list[NonBlankStr] = Field(default_factory=list)
    preferred_qualifications: list[NonBlankStr] = Field(default_factory=list)
    business_domains: list[NonBlankStr] = Field(default_factory=list)


class JobDescription(Base):
    __tablename__ = "job_descriptions"

    target_role_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("target_roles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    responsibilities: Mapped[list[NonBlankStr]] = mapped_column(
        PydanticJSONB(list[NonBlankStr]),
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    requirements: Mapped[JobRequirements] = mapped_column(
        PydanticJSONB(JobRequirements),
        default=JobRequirements,
        server_default=text("'{}'::jsonb"),
    )
    hard_skills: Mapped[HardSkills] = mapped_column(
        PydanticJSONB(HardSkills),
        default=HardSkills,
        server_default=text("'{}'::jsonb"),
    )
    soft_skills: Mapped[list[NonBlankStr]] = mapped_column(
        PydanticJSONB(list[NonBlankStr]),
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    preferred_qualifications: Mapped[list[NonBlankStr]] = mapped_column(
        PydanticJSONB(list[NonBlankStr]),
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    business_domains: Mapped[list[NonBlankStr]] = mapped_column(
        PydanticJSONB(list[NonBlankStr]),
        default=list,
        server_default=text("'[]'::jsonb"),
    )


class TargetRole(Base):
    __tablename__ = "target_roles"

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String)
    company: Mapped[str | None] = mapped_column(String, nullable=True)
    recruitment_track: Mapped[RecruitmentTrack | None] = mapped_column(
        Enum(
            RecruitmentTrack,
            values_callable=lambda enum: [member.value for member in enum],
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            name="target_role_recruitment_track",
        ),
        nullable=True,
    )
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    is_archived: Mapped[bool] = mapped_column(
        default=False,
        server_default=text("false"),
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

    jd: Mapped[JobDescription] = relationship(
        cascade="all, delete-orphan",
        lazy="selectin",
        uselist=False,
    )
