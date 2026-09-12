from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from pydantic import BaseModel, Field
from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.db.types import PydanticJSONB
from riva.models.types import NonBlankStr
from riva.tasks.types import TaskErrorCode
from riva.utils import utc_now


class RecruitmentTrack(StrEnum):
    CAMPUS = "campus"
    EXPERIENCED = "experienced"


class JobRequirements(BaseModel):
    education: list[NonBlankStr] = Field(
        default_factory=list,
        description="Required degrees or education levels, excluding fields of study.",
    )
    graduation_cohorts: list[NonBlankStr] = Field(
        default_factory=list,
        description="Eligible graduation cohorts, retaining stated years and ranges.",
    )
    majors: list[NonBlankStr] = Field(
        default_factory=list,
        description="Required fields of study, excluding degree levels.",
    )
    experience: list[NonBlankStr] = Field(
        default_factory=list,
        description="Required work experience, including duration and qualifying conditions.",
    )
    languages: list[NonBlankStr] = Field(
        default_factory=list,
        description="Required natural languages and proficiency levels, not programming languages.",
    )
    certifications: list[NonBlankStr] = Field(
        default_factory=list,
        description="Required certificates or professional credentials.",
    )


class HardSkills(BaseModel):
    programming_languages: list[NonBlankStr] = Field(
        default_factory=list,
        description="Required programming languages and stated proficiency.",
    )
    frameworks_and_libraries: list[NonBlankStr] = Field(
        default_factory=list, description="Required software frameworks and libraries."
    )
    platforms: list[NonBlankStr] = Field(
        default_factory=list,
        description="Required operating, cloud or application platforms, such as Web or Android.",
    )
    tools: list[NonBlankStr] = Field(
        default_factory=list,
        description="Required software tools used to perform the work.",
    )
    concepts_and_methods: list[NonBlankStr] = Field(
        default_factory=list,
        description="Required technical knowledge, principles and methods, such as architecture or accessibility.",
    )
    databases_and_middleware: list[NonBlankStr] = Field(
        default_factory=list,
        description="Required databases, data stores and middleware technologies.",
    )
    other: list[NonBlankStr] = Field(
        default_factory=list,
        description="Other required technical skills not covered by the named categories.",
    )


class JobDescriptionContent(BaseModel):
    responsibilities: list[NonBlankStr] = Field(
        default_factory=list,
        description="Work activities and expected outcomes, expressed as separate points.",
    )
    requirements: JobRequirements = Field(
        default_factory=JobRequirements,
        description="Mandatory eligibility conditions; preferred conditions belong in preferred_qualifications.",
    )
    hard_skills: HardSkills = Field(
        default_factory=HardSkills,
        description="Required technical skills, retaining stated proficiency and conditions; excludes preferred-only skills.",
    )
    soft_skills: list[NonBlankStr] = Field(
        default_factory=list,
        description="Required interpersonal and organizational abilities, including communication, collaboration and problem analysis.",
    )
    preferred_qualifications: list[NonBlankStr] = Field(
        default_factory=list,
        description="Preferred, bonus or optional qualifications, including skills that are not mandatory.",
    )
    business_domains: list[NonBlankStr] = Field(
        default_factory=list,
        description="Business sectors, contexts or product domains; excludes generic engineering activities.",
    )


class JobDescription(Base):
    __tablename__ = "job_descriptions"

    role_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    extraction_job_id: Mapped[int | None] = mapped_column(BigInteger)
    extraction_error_code: Mapped[TaskErrorCode | None] = mapped_column(
        Enum(
            TaskErrorCode,
            values_callable=lambda enum: [member.value for member in enum],
            native_enum=False,
            validate_strings=True,
        ),
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


class Role(Base):
    __tablename__ = "roles"

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
            name="role_recruitment_track",
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
