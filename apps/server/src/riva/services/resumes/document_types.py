from datetime import datetime
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, StringConstraints

from riva.services.profile.types import RequiredText, StandardUUID
from riva.services.types import DomainModel


class StrictDomainModel(DomainModel):
    model_config = ConfigDict(extra="forbid")


class ResumeDocumentResponseBase(StrictDomainModel):
    id: StandardUUID
    source_type: Literal["file", "pastedText"]
    original_filename: Annotated[str, StringConstraints(max_length=255)] | None
    media_type: Annotated[str, StringConstraints(min_length=1, max_length=127)]
    byte_size: int = Field(ge=1)
    uploaded_at: datetime


class PendingResumeDocumentResponse(ResumeDocumentResponseBase):
    extraction_status: Literal["pending"]
    extracted_at: None = None
    failure_reason: None = None


class SucceededResumeDocumentResponse(ResumeDocumentResponseBase):
    extraction_status: Literal["succeeded"]
    extracted_at: datetime
    failure_reason: None = None


class FailedResumeDocumentResponse(ResumeDocumentResponseBase):
    extraction_status: Literal["failed"]
    extracted_at: datetime
    failure_reason: RequiredText


ResumeDocumentResponse = Annotated[
    PendingResumeDocumentResponse
    | SucceededResumeDocumentResponse
    | FailedResumeDocumentResponse,
    Field(discriminator="extraction_status"),
]


class ResumeDocumentsResponse(StrictDomainModel):
    documents: list[ResumeDocumentResponse]
