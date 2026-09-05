from datetime import datetime
from enum import StrEnum
from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl, model_validator
from sqlalchemy import DateTime, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql.sqltypes import Uuid

from riva.db.base import Base
from riva.db.types import PydanticJSONB
from riva.models.types import NonBlankStr, YearMonthRangeModel
from riva.utils import utc_now


class EmploymentType(StrEnum):
    FULL_TIME = "full-time"
    PART_TIME = "part-time"
    INTERNSHIP = "internship"
    CONTRACT = "contract"
    FREELANCE = "freelance"


class EducationEntry(YearMonthRangeModel):
    school: NonBlankStr
    degree: NonBlankStr | None = None
    major: NonBlankStr | None = None


class WorkExperienceEntry(YearMonthRangeModel):
    company: NonBlankStr
    title: NonBlankStr
    employment_type: EmploymentType | None = None
    location: NonBlankStr | None = None
    responsibilities: list[NonBlankStr] = Field(default_factory=list)
    achievements: list[NonBlankStr] = Field(default_factory=list)
    skills: list[NonBlankStr] = Field(default_factory=list)


class ProjectEntry(YearMonthRangeModel):
    name: NonBlankStr
    role: NonBlankStr | None = None
    description: list[NonBlankStr] = Field(default_factory=list)
    achievements: list[NonBlankStr] = Field(default_factory=list)
    tech_stack: list[NonBlankStr] = Field(default_factory=list)
    url: HttpUrl | None = None


class CareerProfileContent(BaseModel):
    education: list[EducationEntry] = Field(default_factory=list)
    work_experiences: list[WorkExperienceEntry] = Field(default_factory=list)
    projects: list[ProjectEntry] = Field(default_factory=list)
    skills: list[NonBlankStr] = Field(default_factory=list)

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
