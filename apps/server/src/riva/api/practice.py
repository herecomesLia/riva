from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request, status

from riva.core.auth import require_current_user
from riva.core.csrf import csrf_protect
from riva.core.language import normalize_interaction_language
from riva.core.practice import get_practice_api_service
from riva.models import User
from riva.schemas.practice_sessions import (
    CompletePracticeSessionRequest,
    ContinuePracticeQuestionRequest,
    CurrentPracticeSessionResponse,
    EndPracticeFollowUpsRequest,
    EndPracticeSessionEarlyRequest,
    PracticeActiveSessionResponse,
    PracticeCompletedSessionResponse,
    PracticeSessionResponse,
    RefreshPracticeEvaluationRequest,
    RefreshPracticeFollowUpGenerationRequest,
    RefreshPracticeQuestionGenerationRequest,
    RetryPracticeQuestionRequest,
    SetPracticeQuestionSavedRequest,
    SetPracticeQuestionWeakRequest,
    SubmitFollowUpAnswerRequest,
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
    "/sessions/{sessionId}/questions/next",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def continue_to_next_practice_question(
    session_id: PracticeSessionId,
    payload: ContinuePracticeQuestionRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.continue_to_next_question(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.post(
    "/sessions/{sessionId}/questions/retry",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def retry_current_practice_question(
    session_id: PracticeSessionId,
    payload: RetryPracticeQuestionRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.retry_current_question(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.patch(
    "/sessions/{sessionId}/questions/saved",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def set_practice_question_saved(
    session_id: PracticeSessionId,
    payload: SetPracticeQuestionSavedRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.set_question_saved(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.patch(
    "/sessions/{sessionId}/questions/weak",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def set_practice_question_weak(
    session_id: PracticeSessionId,
    payload: SetPracticeQuestionWeakRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.set_question_weak(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
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
    "/sessions/{sessionId}/answers/follow-up",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def submit_practice_follow_up_answer(
    session_id: PracticeSessionId,
    payload: SubmitFollowUpAnswerRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.submit_follow_up_answer(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.post(
    "/sessions/{sessionId}/follow-ups/end",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def end_practice_follow_ups(
    session_id: PracticeSessionId,
    payload: EndPracticeFollowUpsRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.end_follow_ups(
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


@router.post(
    "/sessions/{sessionId}/evaluation/refresh",
    response_model=PracticeActiveSessionResponse,
)
async def refresh_practice_evaluation_generation(
    session_id: PracticeSessionId,
    payload: RefreshPracticeEvaluationRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.refresh_evaluation(
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
    response_model=PracticeSessionResponse,
)
async def get_practice_session(
    session_id: PracticeSessionId,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeSessionResponse:
    return await practice_api_service.get_session(
        user_id=current_user.id,
        session_id=session_id,
    )


@router.post(
    "/sessions/{sessionId}/complete",
    response_model=PracticeCompletedSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def complete_practice_session(
    session_id: PracticeSessionId,
    payload: CompletePracticeSessionRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeCompletedSessionResponse:
    return await practice_api_service.complete_session(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.post(
    "/sessions/{sessionId}/end",
    response_model=PracticeCompletedSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def end_practice_session_early(
    session_id: PracticeSessionId,
    payload: EndPracticeSessionEarlyRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeAPIService = Depends(
        get_practice_api_service
    ),
) -> PracticeCompletedSessionResponse:
    return await practice_api_service.end_session_early(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


__all__ = ["router"]
