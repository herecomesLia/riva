from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from riva.api.dependencies import (
    require_csrf,
    require_current_user,
    require_profile_service,
)
from riva.core.language import normalize_interaction_language
from riva.models import User
from riva.schemas.profile import ProfileContent, ProfileResponse, SaveProfileRequest
from riva.services.errors import InvalidDataError
from riva.services.profile.service import ProfileService
from riva.services.profile.types import SaveProfileRequest as DomainSaveProfileRequest

router = APIRouter(
    prefix="/profile",
    tags=["profile"],
    dependencies=[Depends(require_csrf)],
)


@router.get("", response_model=ProfileResponse | None)
async def get_profile(
    current_user: User = Depends(require_current_user),
    profile_service: ProfileService = Depends(require_profile_service),
) -> ProfileResponse | None:
    return await profile_service.get_profile(current_user)


@router.put("", response_model=ProfileResponse)
async def save_profile(
    payload: SaveProfileRequest,
    current_user: User = Depends(require_current_user),
    profile_service: ProfileService = Depends(require_profile_service),
) -> ProfileResponse:
    result = await profile_service.save(
        current_user,
        DomainSaveProfileRequest.model_validate(
            payload.model_dump(mode="python", by_alias=False)
        ),
    )
    return result


@router.post("/import/resume", response_model=ProfileContent)
async def import_resume(
    request: Request,
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    current_user: User = Depends(require_current_user),
    profile_service: ProfileService = Depends(require_profile_service),
) -> ProfileContent:
    has_text = text is not None and bool(text.strip())
    if file is None and not has_text:
        raise InvalidDataError("resume_source_required")
    if file is not None and has_text:
        raise InvalidDataError("resume_source_ambiguous")

    try:
        if file is None:
            data = text.encode("utf-8")
            media_type = "text/plain"
        else:
            data = await file.read(
                request.app.state.settings.resume_max_upload_bytes + 1
            )
            media_type = file.content_type
        result = await profile_service.import_from_resume(
            current_user,
            data=data,
            declared_media_type=media_type,
            interaction_language=normalize_interaction_language(
                request.headers.get("accept-language")
            ),
        )
        return result
    finally:
        if file is not None:
            await file.close()
