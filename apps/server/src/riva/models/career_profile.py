from datetime import datetime
from enum import StrEnum
from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl, model_validator
from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.db.types import PydanticJSONB
from riva.models.types import NonBlankStr, YearMonthRangeModel
from riva.tasks.types import TaskErrorCode
from riva.utils import utc_now


class EmploymentType(StrEnum):
    FULL_TIME = "full-time"
    PART_TIME = "part-time"
    INTERNSHIP = "internship"
    CONTRACT = "contract"
    FREELANCE = "freelance"


class EducationEntry(YearMonthRangeModel):
    school: NonBlankStr
    degree: NonBlankStr | None = Field(
        default=None, description="Degree or education level; null when unspecified."
    )
    major: NonBlankStr | None = Field(
        default=None, description="Field of study; null when unspecified."
    )


class WorkExperienceEntry(YearMonthRangeModel):
    company: NonBlankStr
    title: NonBlankStr
    employment_type: EmploymentType | None = None
    location: NonBlankStr | None = None
    responsibilities: list[NonBlankStr] = Field(
        default_factory=list,
        description="Duties and activities performed in this work experience.",
    )
    achievements: list[NonBlankStr] = Field(
        default_factory=list,
        description="Outcomes and impact achieved in this work experience, distinct from duties.",
    )
    skills: list[NonBlankStr] = Field(
        default_factory=list,
        description="Related skills selected from the career profile's top-level skills list.",
    )


class ProjectEntry(YearMonthRangeModel):
    name: NonBlankStr
    role: NonBlankStr | None = None
    description: list[NonBlankStr] = Field(
        default_factory=list,
        description="Separate points describing the project and its scope.",
    )
    achievements: list[NonBlankStr] = Field(
        default_factory=list,
        description="Separate points describing project outcomes and impact.",
    )
    tech_stack: list[NonBlankStr] = Field(
        default_factory=list,
        description="Technologies used in this project; independent of the profile's top-level skills list.",
    )
    url: HttpUrl | None = None


class CareerProfileContent(BaseModel):
    education: list[EducationEntry] = Field(
        default_factory=list,
        description="Education history, including institutions, degrees, fields of study and dates.",
    )
    work_experiences: list[WorkExperienceEntry] = Field(
        default_factory=list,
        description="Work history, including roles, responsibilities, achievements and related skills.",
    )
    projects: list[ProjectEntry] = Field(
        default_factory=list,
        description="Project experience, including contributions, outcomes and project-specific technologies.",
    )
    skills: list[NonBlankStr] = Field(
        default_factory=list,
        description="Profile-wide skill names available for association with work experiences.",
    )

    @model_validator(mode="after")
    def validate_skill_consistency(self) -> Self:
        if any(
            skill not in self.skills
            for work_experience in self.work_experiences
            for skill in work_experience.skills
        ):
            raise ValueError(
                "work experience skills must exist in the career profile skills list"
            )
        return self


class CareerProfileExtraction(Base):
    __tablename__ = "career_profile_extractions"

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    job_id: Mapped[int | None] = mapped_column(BigInteger)
    error_code: Mapped[TaskErrorCode | None] = mapped_column(
        Enum(
            TaskErrorCode,
            values_callable=lambda enum: [member.value for member in enum],
            native_enum=False,
            validate_strings=True,
        )
    )


class CareerProfile(Base):
    __tablename__ = "career_profiles"

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    education: Mapped[list[EducationEntry]] = mapped_column(
        PydanticJSONB(list[EducationEntry]),
        default=list,
        server_default=text("'[]'::jsonb"),
    )

    work_experiences: Mapped[list[WorkExperienceEntry]] = mapped_column(
        PydanticJSONB(list[WorkExperienceEntry]),
        default=list,
        server_default=text("'[]'::jsonb"),
    )

    projects: Mapped[list[ProjectEntry]] = mapped_column(
        PydanticJSONB(list[ProjectEntry]),
        default=list,
        server_default=text("'[]'::jsonb"),
    )

    skills: Mapped[list[NonBlankStr]] = mapped_column(
        PydanticJSONB(list[NonBlankStr]),
        default=list,
        server_default=text("'[]'::jsonb"),
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
