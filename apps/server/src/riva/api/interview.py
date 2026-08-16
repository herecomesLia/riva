from uuid import UUID

from fastapi import APIRouter, Depends, Request, status

from riva.core.auth import require_current_user
from riva.core.csrf import csrf_protect
from riva.core.interview import get_interview_api_service
from riva.core.language import normalize_interaction_language
from riva.models import User
from riva.schemas.interview import (
    BeginInterviewQuestionsRequest,
    EndInterviewRequest,
    FinishInterviewRequest,
    GetInterviewReviewResponse,
    RetryInterviewCandidateAnswerRequest,
    RetryInterviewReviewRequest,
    InterviewPageResponse,
    RetryInterviewTurnRequest,
    SubmitCandidateQuestionRequest,
    SubmitInterviewAnswerRequest,
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


@router.post(
    "/sessions/{session_id}/questions/begin",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def begin_interview_questions(
    session_id: UUID,
    payload: BeginInterviewQuestionsRequest,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewAPIService = Depends(
        get_interview_api_service
    ),
) -> InterviewPageResponse:
    return await interview_api_service.begin_questions(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.post(
    "/sessions/{session_id}/answers",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def submit_interview_answer(
    session_id: UUID,
    payload: SubmitInterviewAnswerRequest,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewAPIService = Depends(
        get_interview_api_service
    ),
) -> InterviewPageResponse:
    return await interview_api_service.submit_answer(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.post(
    "/sessions/{session_id}/turn/retry",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_interview_turn(
    session_id: UUID,
    payload: RetryInterviewTurnRequest,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewAPIService = Depends(
        get_interview_api_service
    ),
) -> InterviewPageResponse:
    return await interview_api_service.retry_turn(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.post(
    "/sessions/{session_id}/candidate-questions",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def submit_candidate_question(
    session_id: UUID,
    payload: SubmitCandidateQuestionRequest,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewAPIService = Depends(
        get_interview_api_service
    ),
) -> InterviewPageResponse:
    return await interview_api_service.submit_candidate_question(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.post(
    "/sessions/{session_id}/candidate-answer/retry",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_candidate_answer(
    session_id: UUID,
    payload: RetryInterviewCandidateAnswerRequest,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewAPIService = Depends(
        get_interview_api_service
    ),
) -> InterviewPageResponse:
    return await interview_api_service.retry_candidate_answer(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.post(
    "/sessions/{session_id}/finish",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def finish_interview(
    session_id: UUID,
    payload: FinishInterviewRequest,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewAPIService = Depends(
        get_interview_api_service
    ),
) -> InterviewPageResponse:
    return await interview_api_service.finish_session(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.post(
    "/sessions/{session_id}/end",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def end_interview(
    session_id: UUID,
    payload: EndInterviewRequest,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewAPIService = Depends(
        get_interview_api_service
    ),
) -> InterviewPageResponse:
    return await interview_api_service.end_session(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.post(
    "/sessions/{session_id}/review/retry",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_interview_review(
    session_id: UUID,
    payload: RetryInterviewReviewRequest,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewAPIService = Depends(
        get_interview_api_service
    ),
) -> InterviewPageResponse:
    return await interview_api_service.retry_review(
        user_id=current_user.id,
        session_id=session_id,
        payload=payload,
    )


@router.get(
    "/sessions/{session_id}/review",
    response_model=GetInterviewReviewResponse,
)
async def get_interview_review(
    session_id: UUID,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewAPIService = Depends(
        get_interview_api_service
    ),
) -> GetInterviewReviewResponse:
    return await interview_api_service.get_review(
        user_id=current_user.id,
        session_id=session_id,
    )
