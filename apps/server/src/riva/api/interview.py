from fastapi import APIRouter, Depends, Request, status

from riva.core.auth import require_current_user
from riva.core.csrf import csrf_protect
from riva.core.interview import get_interview_api_service
from riva.core.language import normalize_interaction_language
from riva.models import User
from riva.schemas.interview import (
    InterviewPageResponse,
    StartInterviewRequest,
)
from riva.services.interview_api import InterviewAPIService


router = APIRouter(
    prefix="/interview",
    tags=["interview"],
    dependencies=[Depends(csrf_protect)],
)


@router.get("", response_model=InterviewPageResponse)
async def get_interview_page(
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewAPIService = Depends(
        get_interview_api_service
    ),
) -> InterviewPageResponse:
    return await interview_api_service.get_page(user_id=current_user.id)


@router.post(
    "/sessions",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_interview_session(
    payload: StartInterviewRequest,
    request: Request,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewAPIService = Depends(
        get_interview_api_service
    ),
) -> InterviewPageResponse:
    return await interview_api_service.start_session(
        user_id=current_user.id,
        payload=payload,
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )
