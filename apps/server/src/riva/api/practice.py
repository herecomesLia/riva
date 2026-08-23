from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request, status

from riva.api.dependencies import (
    require_csrf,
    require_current_user,
    require_llm_provider,
    require_practice_service,
    require_question_card_service,
)
from riva.core.language import normalize_interaction_language
from riva.models import User
from riva.schemas.practice_sessions import (
    CompletePracticeSessionRequest,
    ContinuePracticeQuestionRequest,
    CurrentPracticeSessionResponse,
    EndPracticeFollowUpsRequest,
    EndPracticeSessionEarlyRequest,
    PracticeActiveSessionResponse,
    PracticeCompletedSessionResponse,
    PracticeFollowUpReferenceAnswerRequest,
    PracticeQuestionReferenceAnswerRequest,
    PracticeSessionResponse,
    PracticeSetupResponse,
    RetryPracticeQuestionRequest,
    RevealPracticeFollowUpGuidanceRequest,
    RevealPracticeQuestionGuidanceRequest,
    SetPracticeQuestionSavedRequest,
    SetPracticeQuestionWeakRequest,
    SkipPracticeQuestionRequest,
    StartPracticeSessionRequest,
    SubmitFollowUpAnswerRequest,
    SubmitPrimaryAnswerRequest,
)
from riva.schemas.question_cards import (
    QuestionCardResponse,
    StartQuestionGenerationRequest,
)
from riva.services.practice.cards import QuestionCardService
from riva.services.practice.question_types import (
    StartQuestionGenerationRequest as DomainStartQuestionGenerationRequest,
)
from riva.services.practice.types import (
    CompletePracticeSessionRequest as DomainCompletePracticeSessionRequest,
)
from riva.services.practice.types import (
    ContinuePracticeQuestionRequest as DomainContinuePracticeQuestionRequest,
)
from riva.services.practice.types import (
    EndPracticeFollowUpsRequest as DomainEndPracticeFollowUpsRequest,
)
from riva.services.practice.types import (
    EndPracticeSessionEarlyRequest as DomainEndPracticeSessionEarlyRequest,
)
from riva.services.practice.types import (
    PracticeFollowUpReferenceAnswerRequest as DomainPracticeFollowUpReferenceAnswerRequest,
)
from riva.services.practice.types import (
    PracticeQuestionReferenceAnswerRequest as DomainPracticeQuestionReferenceAnswerRequest,
)
from riva.services.practice.types import (
    RetryPracticeQuestionRequest as DomainRetryPracticeQuestionRequest,
)
from riva.services.practice.types import (
    RevealPracticeFollowUpGuidanceRequest as DomainRevealPracticeFollowUpGuidanceRequest,
)
from riva.services.practice.types import (
    RevealPracticeQuestionGuidanceRequest as DomainRevealPracticeQuestionGuidanceRequest,
)
from riva.services.practice.types import (
    SetPracticeQuestionSavedRequest as DomainSetPracticeQuestionSavedRequest,
)
from riva.services.practice.types import (
    SetPracticeQuestionWeakRequest as DomainSetPracticeQuestionWeakRequest,
)
from riva.services.practice.types import (
    SkipPracticeQuestionRequest as DomainSkipPracticeQuestionRequest,
)
from riva.services.practice.types import (
    StartPracticeSessionRequest as DomainStartPracticeSessionRequest,
)
from riva.services.practice.types import (
    SubmitFollowUpAnswerRequest as DomainSubmitFollowUpAnswerRequest,
)
from riva.services.practice.types import (
    SubmitPrimaryAnswerRequest as DomainSubmitPrimaryAnswerRequest,
)
from riva.services.practice.workflow import PracticeService

# Practice session routes

PracticeSessionId = Annotated[UUID, Path(alias="sessionId")]


def _to_domain(payload, model):
    return model.model_validate(payload.model_dump(mode="python", by_alias=False))


session_router = APIRouter(
    prefix="/practice",
    tags=["practice"],
    dependencies=[Depends(require_csrf)],
)


@session_router.get(
    "/setup",
    response_model=PracticeSetupResponse,
)
async def get_practice_setup_capabilities(
    request: Request,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeSetupResponse:
    return await practice_api_service.get_setup_capabilities(
        user_id=current_user.id,
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )


@session_router.post(
    "/sessions",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def start_practice_session(
    payload: StartPracticeSessionRequest,
    request: Request,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.start_session(
        user_id=current_user.id,
        payload=_to_domain(payload, DomainStartPracticeSessionRequest),
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )


@session_router.post(
    "/sessions/{sessionId}/questions/next",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def continue_to_next_practice_question(
    session_id: PracticeSessionId,
    payload: ContinuePracticeQuestionRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.continue_to_next_question(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainContinuePracticeQuestionRequest),
    )


@session_router.post(
    "/sessions/{sessionId}/questions/retry",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def retry_current_practice_question(
    session_id: PracticeSessionId,
    payload: RetryPracticeQuestionRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.retry_current_question(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainRetryPracticeQuestionRequest),
    )


@session_router.post(
    "/sessions/{sessionId}/questions/skip",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def skip_current_practice_question(
    session_id: PracticeSessionId,
    payload: SkipPracticeQuestionRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.skip_current_question(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainSkipPracticeQuestionRequest),
    )


@session_router.patch(
    "/sessions/{sessionId}/questions/saved",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def set_practice_question_saved(
    session_id: PracticeSessionId,
    payload: SetPracticeQuestionSavedRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.set_question_saved(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainSetPracticeQuestionSavedRequest),
    )


@session_router.patch(
    "/sessions/{sessionId}/questions/weak",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def set_practice_question_weak(
    session_id: PracticeSessionId,
    payload: SetPracticeQuestionWeakRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.set_question_weak(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainSetPracticeQuestionWeakRequest),
    )


@session_router.post(
    "/sessions/{sessionId}/questions/hint",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def reveal_practice_question_hint(
    session_id: PracticeSessionId,
    payload: RevealPracticeQuestionGuidanceRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.reveal_question_hint(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainRevealPracticeQuestionGuidanceRequest),
    )


@session_router.post(
    "/sessions/{sessionId}/questions/framework",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def reveal_practice_question_framework(
    session_id: PracticeSessionId,
    payload: RevealPracticeQuestionGuidanceRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.reveal_question_framework(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainRevealPracticeQuestionGuidanceRequest),
    )


@session_router.post(
    "/sessions/{sessionId}/questions/reference-answer",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def request_practice_question_reference_answer(
    session_id: PracticeSessionId,
    payload: PracticeQuestionReferenceAnswerRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.request_question_reference_answer(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainPracticeQuestionReferenceAnswerRequest),
    )


@session_router.post(
    "/sessions/{sessionId}/answers/main",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def submit_practice_primary_answer(
    session_id: PracticeSessionId,
    payload: SubmitPrimaryAnswerRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.submit_primary_answer(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainSubmitPrimaryAnswerRequest),
    )


@session_router.post(
    "/sessions/{sessionId}/answers/follow-up",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def submit_practice_follow_up_answer(
    session_id: PracticeSessionId,
    payload: SubmitFollowUpAnswerRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.submit_follow_up_answer(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainSubmitFollowUpAnswerRequest),
    )


@session_router.post(
    "/sessions/{sessionId}/follow-ups/end",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def end_practice_follow_ups(
    session_id: PracticeSessionId,
    payload: EndPracticeFollowUpsRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.end_follow_ups(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainEndPracticeFollowUpsRequest),
    )


@session_router.post(
    "/sessions/{sessionId}/follow-ups/hint",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def reveal_practice_follow_up_hint(
    session_id: PracticeSessionId,
    payload: RevealPracticeFollowUpGuidanceRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.reveal_follow_up_hint(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainRevealPracticeFollowUpGuidanceRequest),
    )


@session_router.post(
    "/sessions/{sessionId}/follow-ups/framework",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def reveal_practice_follow_up_framework(
    session_id: PracticeSessionId,
    payload: RevealPracticeFollowUpGuidanceRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.reveal_follow_up_framework(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainRevealPracticeFollowUpGuidanceRequest),
    )


@session_router.post(
    "/sessions/{sessionId}/follow-ups/reference-answer",
    response_model=PracticeActiveSessionResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def request_practice_follow_up_reference_answer(
    session_id: PracticeSessionId,
    payload: PracticeFollowUpReferenceAnswerRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeActiveSessionResponse:
    return await practice_api_service.request_follow_up_reference_answer(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainPracticeFollowUpReferenceAnswerRequest),
    )


@session_router.get(
    "/sessions/current",
    response_model=CurrentPracticeSessionResponse,
)
async def get_current_practice_session(
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> CurrentPracticeSessionResponse:
    return await practice_api_service.get_current_session(
        user_id=current_user.id,
    )


@session_router.get(
    "/sessions/{sessionId}",
    response_model=PracticeSessionResponse,
)
async def get_practice_session(
    session_id: PracticeSessionId,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeSessionResponse:
    return await practice_api_service.get_session(
        user_id=current_user.id,
        session_id=session_id,
    )


@session_router.post(
    "/sessions/{sessionId}/complete",
    response_model=PracticeCompletedSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def complete_practice_session(
    session_id: PracticeSessionId,
    payload: CompletePracticeSessionRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeCompletedSessionResponse:
    return await practice_api_service.complete_session(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainCompletePracticeSessionRequest),
    )


@session_router.post(
    "/sessions/{sessionId}/end",
    response_model=PracticeCompletedSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def end_practice_session_early(
    session_id: PracticeSessionId,
    payload: EndPracticeSessionEarlyRequest,
    current_user: User = Depends(require_current_user),
    practice_api_service: PracticeService = Depends(require_practice_service),
) -> PracticeCompletedSessionResponse:
    return await practice_api_service.end_session_early(
        user_id=current_user.id,
        session_id=session_id,
        payload=_to_domain(payload, DomainEndPracticeSessionEarlyRequest),
    )


# Question card routes

QuestionCardId = Annotated[UUID, Path(alias="questionCardId")]

question_cards_router = APIRouter(
    prefix="/question-cards",
    tags=["question-cards"],
    dependencies=[Depends(require_csrf)],
)


@question_cards_router.post(
    "/generations",
    response_model=QuestionCardResponse,
    dependencies=[Depends(require_current_user), Depends(require_llm_provider)],
)
async def start_question_generation(
    payload: StartQuestionGenerationRequest,
    request: Request,
    current_user: User = Depends(require_current_user),
    question_card_service: QuestionCardService = Depends(require_question_card_service),
) -> QuestionCardResponse:
    return await question_card_service.start_generation(
        current_user,
        _to_domain(payload, DomainStartQuestionGenerationRequest),
        interaction_language=normalize_interaction_language(
            request.headers.get("accept-language")
        ),
    )


@question_cards_router.get(
    "/{questionCardId}",
    response_model=QuestionCardResponse,
)
async def get_question_card(
    question_card_id: QuestionCardId,
    current_user: User = Depends(require_current_user),
    question_card_service: QuestionCardService = Depends(require_question_card_service),
) -> QuestionCardResponse:
    return await question_card_service.get_question_card(
        user_id=current_user.id,
        question_card_id=question_card_id,
    )


router = APIRouter()
router.include_router(session_router)
router.include_router(question_cards_router)
