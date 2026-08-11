from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request, status

from riva.core.auth import require_current_user
from riva.core.csrf import csrf_protect
from riva.core.language import normalize_interaction_language
from riva.core.practice import get_practice_api_service
from riva.models import User
from riva.schemas.practice_sessions import (
    CurrentPracticeSessionResponse,
    PracticeActiveSessionResponse,
    RefreshPracticeFollowUpGenerationRequest,
    RefreshPracticeQuestionGenerationRequest,
    StartPracticeSessionRequest,
    SubmitPrimaryAnswerRequest,
)
from riva.services.practice_api import PracticeAPIService


PracticeSessionId = Annotated[UUID, Path(alias="sessionId")]

router = APIRouter(
    prefix="/practice",
    tags=["practice"],
    dependencies=[Depends(csrf_protect)],
)


@router.post(
    "/sessions",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_practice_session(
    payload: StartPracticeSessionRequest,
    request: Request,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.start_session(
        user_id=current_user.id,
        payload=payload,
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )


@router.post(
    "/sessions/{sessionId}/question-generation/refresh",
    response_model=PracticeActiveSessionResponse,
)
async def refresh_practice_question_generation(
    session_id: PracticeSessionId,
    payload: RefreshPracticeQuestionGenerationRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.refresh_question_generation(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.post(
    "/sessions/{sessionId}/answers/main",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def submit_practice_primary_answer(
    session_id: PracticeSessionId,
    payload: SubmitPrimaryAnswerRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.submit_primary_answer(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.post(
    "/sessions/{sessionId}/follow-up-generation/refresh",
    response_model=PracticeActiveSessionResponse,
)
async def refresh_practice_follow_up_generation(
    session_id: PracticeSessionId,
    payload: RefreshPracticeFollowUpGenerationRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.refresh_follow_up_generation(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.get(
    "/sessions/current",
    response_model=CurrentPracticeSessionResponse,
)
async def get_current_practice_session(
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> CurrentPracticeSessionResponse:
    return await practice_api_service.get_current_session(
        user_id=current_user.id,
    )


@router.get(
    "/sessions/{sessionId}",
    response_model=PracticeActiveSessionResponse,
)
async def get_practice_session(
    session_id: PracticeSessionId,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.get_session(
        user_id=current_user.id,
        session_id=session_id,
    )


__all__ = ["router"]
