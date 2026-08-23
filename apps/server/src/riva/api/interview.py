from uuid import UUID

from fastapi import APIRouter, Depends, Request, status

from riva.api.dependencies import (
    require_csrf,
    require_current_user,
    require_interview_service,
    require_llm_provider,
)
from riva.core.language import normalize_interaction_language
from riva.models import User
from riva.schemas.interview import (
    BeginInterviewQuestionsRequest,
    EndInterviewRequest,
    FinishInterviewRequest,
    GetInterviewReviewResponse,
    InterviewPageResponse,
    StartInterviewRequest,
    SubmitCandidateQuestionRequest,
    SubmitInterviewAnswerRequest,
)
from riva.services.interview.types import (
    BeginInterviewQuestionsRequest as DomainBeginInterviewQuestionsRequest,
)
from riva.services.interview.types import (
    EndInterviewRequest as DomainEndInterviewRequest,
)
from riva.services.interview.types import (
    FinishInterviewRequest as DomainFinishInterviewRequest,
)
from riva.services.interview.types import (
    StartInterviewRequest as DomainStartInterviewRequest,
)
from riva.services.interview.types import (
    SubmitCandidateQuestionRequest as DomainSubmitCandidateQuestionRequest,
)
from riva.services.interview.types import (
    SubmitInterviewAnswerRequest as DomainSubmitInterviewAnswerRequest,
)
from riva.services.interview.workflow import InterviewService

router = APIRouter(
    prefix="/interview",
    tags=["interview"],
    dependencies=[Depends(require_csrf)],
)


def _to_domain(payload, model):
    return model.model_validate(payload.model_dump(mode="python", by_alias=False))


@router.get("", response_model=InterviewPageResponse)
async def get_interview_page(
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewService = Depends(require_interview_service),
) -> InterviewPageResponse:
    return await interview_api_service.get_page(user_id=current_user.id)


@router.post(
    "/sessions",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def start_interview_session(
    payload: StartInterviewRequest,
    request: Request,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewService = Depends(require_interview_service),
) -> InterviewPageResponse:
    return await interview_api_service.start_session(
        user_id=current_user.id,
        payload=_to_domain(payload, DomainStartInterviewRequest),
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )


@router.post(
    "/sessions/{session_id}/questions/begin",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def begin_interview_questions(
    session_id: UUID,
    payload: BeginInterviewQuestionsRequest,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewService = Depends(require_interview_service),
) -> InterviewPageResponse:
    return await interview_api_service.begin_questions(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainBeginInterviewQuestionsRequest),
    )


@router.post(
    "/sessions/{session_id}/answers",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def submit_interview_answer(
    session_id: UUID,
    payload: SubmitInterviewAnswerRequest,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewService = Depends(require_interview_service),
) -> InterviewPageResponse:
    return await interview_api_service.submit_answer(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainSubmitInterviewAnswerRequest),
    )


@router.post(
    "/sessions/{session_id}/candidate-questions",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def submit_candidate_question(
    session_id: UUID,
    payload: SubmitCandidateQuestionRequest,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewService = Depends(require_interview_service),
) -> InterviewPageResponse:
    return await interview_api_service.submit_candidate_question(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainSubmitCandidateQuestionRequest),
    )


@router.post(
    "/sessions/{session_id}/finish",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def finish_interview(
    session_id: UUID,
    payload: FinishInterviewRequest,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewService = Depends(require_interview_service),
) -> InterviewPageResponse:
    return await interview_api_service.finish_session(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainFinishInterviewRequest),
    )


@router.post(
    "/sessions/{session_id}/end",
    response_model=InterviewPageResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def end_interview(
    session_id: UUID,
    payload: EndInterviewRequest,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewService = Depends(require_interview_service),
) -> InterviewPageResponse:
    return await interview_api_service.end_session(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainEndInterviewRequest),
    )


@router.get(
    "/sessions/{session_id}/review",
    response_model=GetInterviewReviewResponse,
)
async def get_interview_review(
    session_id: UUID,
    current_user: User = Depends(require_current_user),
    interview_api_service: InterviewService = Depends(require_interview_service),
) -> GetInterviewReviewResponse:
    return await interview_api_service.get_review(
        user_id=current_user.id,
        session_id=session_id,
    )
