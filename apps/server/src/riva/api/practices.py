from uuid import UUID

from fastapi import APIRouter, Response, status
from fastapi.exceptions import RequestValidationError

from riva.api.csrf import csrf_guard
from riva.api.deps import CurrentUserDep, PracticeServiceDep, RoleServiceDep
from riva.api.errors import AuthRequiredError, CsrfFailedError
from riva.api.errors.openapi import error_responses
from riva.models.practice import PracticeSession
from riva.schemas.practice import (
    CreatePracticeRequest,
    CreatePracticeResponse,
    PracticeListResponse,
    PracticeResponse,
    PracticeRoleResponse,
    PracticeRoundResponse,
    PracticeSummaryResponse,
    SubmitPracticeAnswerRequest,
)
from riva.schemas.tasks import (
    TaskErrorBody,
    TaskFailureResponse,
    TaskStateResponse,
    TaskStatusResponse,
)
from riva.services.errors import (
    ConflictError,
    DomainValidationError,
    InvalidSessionError,
    NotFoundError,
    SessionExpiredError,
)
from riva.tasks import TaskErrorCode, TaskStatus

router = APIRouter(
    prefix="/practices",
    tags=["practices"],
    dependencies=[csrf_guard],
    responses=error_responses(
        AuthRequiredError, InvalidSessionError, SessionExpiredError, CsrfFailedError
    ),
)


def _build_role_response(practice: PracticeSession) -> PracticeRoleResponse:
    if practice.role is not None:
        return PracticeRoleResponse.model_validate(practice.role)
    return PracticeRoleResponse(
        id=None,
        title=practice.role_title_snapshot,
        company=practice.role_company_snapshot,
    )


def _build_practice_response(practice: PracticeSession) -> PracticeResponse:
    return PracticeResponse(
        id=practice.id,
        role=_build_role_response(practice),
        question_type=practice.question_type,
        difficulty=practice.difficulty,
        max_follow_ups=practice.max_follow_ups,
        rounds=[
            PracticeRoundResponse.model_validate(round) for round in practice.rounds
        ],
        ended_at=practice.ended_at,
        created_at=practice.created_at,
    )


@router.get("", operation_id="list-practices", response_model=PracticeListResponse)
async def list_practices(
    current_user: CurrentUserDep, practice_service: PracticeServiceDep
) -> PracticeListResponse:
    practices = await practice_service.list(current_user)
    summaries = []
    for practice in practices:
        scores = [
            round.result.score for round in practice.rounds if round.result is not None
        ]
        summaries.append(
            PracticeSummaryResponse(
                id=practice.id,
                role=_build_role_response(practice),
                question_type=practice.question_type,
                difficulty=practice.difficulty,
                round_count=len(practice.rounds),
                completed_round_count=len(scores),
                average_score=sum(scores) / len(scores) if scores else None,
                ended_at=practice.ended_at,
                created_at=practice.created_at,
            )
        )
    return PracticeListResponse(
        practices=summaries,
        active_practice_id=current_user.active_practice_id,
    )


@router.get(
    "/active",
    operation_id="get-active-practice",
    response_model=PracticeResponse,
    responses={204: {"description": "No active practice session."}},
)
async def get_active_practice(
    current_user: CurrentUserDep,
    practice_service: PracticeServiceDep,
) -> PracticeResponse | Response:
    practice = await practice_service.get_active(current_user)
    if practice is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return _build_practice_response(practice)


@router.post(
    "",
    operation_id="create-practice",
    status_code=status.HTTP_201_CREATED,
    response_model=CreatePracticeResponse,
    responses=error_responses(
        NotFoundError, ConflictError, DomainValidationError, RequestValidationError
    ),
)
async def create_practice(
    payload: CreatePracticeRequest,
    current_user: CurrentUserDep,
    practice_service: PracticeServiceDep,
    role_service: RoleServiceDep,
) -> CreatePracticeResponse:
    role = await role_service.get(current_user, payload.role_id)
    practice_id = await practice_service.create(
        current_user,
        role=role,
        question_type=payload.question_type,
        difficulty=payload.difficulty,
        max_follow_ups=payload.max_follow_ups,
    )
    return CreatePracticeResponse(id=practice_id)


@router.get(
    "/{practice_id}",
    operation_id="get-practice",
    response_model=PracticeResponse,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def get_practice(
    practice_id: UUID,
    current_user: CurrentUserDep,
    practice_service: PracticeServiceDep,
) -> PracticeResponse:
    practice = await practice_service.get(current_user, practice_id)
    return _build_practice_response(practice)


@router.delete(
    "/{practice_id}",
    operation_id="delete-practice",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def delete_practice(
    practice_id: UUID,
    current_user: CurrentUserDep,
    practice_service: PracticeServiceDep,
) -> None:
    await practice_service.delete(current_user, practice_id)


@router.get(
    "/{practice_id}/rounds/{round_id}",
    operation_id="get-practice-round",
    response_model=PracticeRoundResponse,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def get_practice_round(
    practice_id: UUID,
    round_id: UUID,
    current_user: CurrentUserDep,
    practice_service: PracticeServiceDep,
) -> PracticeRoundResponse:
    return PracticeRoundResponse.model_validate(
        await practice_service.get_round(current_user, practice_id, round_id)
    )


@router.post(
    "/{practice_id}/rounds/{round_id}/answers",
    operation_id="submit-practice-answer",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(
        NotFoundError, ConflictError, DomainValidationError, RequestValidationError
    ),
)
async def submit_practice_answer(
    practice_id: UUID,
    round_id: UUID,
    payload: SubmitPracticeAnswerRequest,
    current_user: CurrentUserDep,
    practice_service: PracticeServiceDep,
) -> Response:
    await practice_service.answer(
        current_user,
        practice_id,
        round_id=round_id,
        question_id=payload.question_id,
        content=payload.content,
    )
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/{practice_id}/rounds/{round_id}/skip",
    operation_id="skip-practice-round",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def skip_practice_round(
    practice_id: UUID,
    round_id: UUID,
    current_user: CurrentUserDep,
    practice_service: PracticeServiceDep,
) -> Response:
    await practice_service.skip_round(current_user, practice_id, round_id=round_id)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/{practice_id}/rounds/{round_id}/finish",
    operation_id="finish-practice-round",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def finish_practice_round(
    practice_id: UUID,
    round_id: UUID,
    current_user: CurrentUserDep,
    practice_service: PracticeServiceDep,
) -> Response:
    await practice_service.finish_round(current_user, practice_id, round_id=round_id)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/{practice_id}/rounds/{round_id}/restart",
    operation_id="restart-practice-round",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def restart_practice_round(
    practice_id: UUID,
    round_id: UUID,
    current_user: CurrentUserDep,
    practice_service: PracticeServiceDep,
) -> Response:
    await practice_service.restart_round(current_user, practice_id, round_id=round_id)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/{practice_id}/rounds/{round_id}/next",
    operation_id="start-next-practice-round",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def start_next_practice_round(
    practice_id: UUID,
    round_id: UUID,
    current_user: CurrentUserDep,
    practice_service: PracticeServiceDep,
) -> Response:
    await practice_service.next_round(current_user, practice_id, round_id=round_id)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/{practice_id}/rounds/{round_id}/end-session",
    operation_id="end-practice-session",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def end_practice_session(
    practice_id: UUID,
    round_id: UUID,
    current_user: CurrentUserDep,
    practice_service: PracticeServiceDep,
) -> None:
    await practice_service.end_session(current_user, practice_id, round_id=round_id)


@router.get(
    "/{practice_id}/rounds/{round_id}/task",
    operation_id="get-practice-task-state",
    response_model=TaskStateResponse,
    responses=error_responses(NotFoundError, RequestValidationError),
)
async def get_practice_task_state(
    practice_id: UUID,
    round_id: UUID,
    current_user: CurrentUserDep,
    practice_service: PracticeServiceDep,
) -> TaskStateResponse:
    state = await practice_service.get_round_task_state(
        current_user, practice_id, round_id=round_id
    )
    if state.status is TaskStatus.FAILED:
        error = TaskErrorBody(
            code=state.error_code,
            message={
                TaskErrorCode.SERVICE_UNAVAILABLE: "Service is temporarily unavailable. Please try again later.",
                TaskErrorCode.INVALID_OUTPUT: "Unable to complete the task.",
                TaskErrorCode.LLM_UNAVAILABLE: "LLM service is temporarily unavailable.",
                TaskErrorCode.INTERNAL_ERROR: "Unable to complete the task.",
            }[state.error_code],
        )
        return TaskFailureResponse(status=state.status, error=error)
    return TaskStatusResponse(status=state.status, error=None)


@router.post(
    "/{practice_id}/rounds/{round_id}/task/retry",
    operation_id="retry-practice-task",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=error_responses(NotFoundError, ConflictError, RequestValidationError),
)
async def retry_practice_task(
    practice_id: UUID,
    round_id: UUID,
    current_user: CurrentUserDep,
    practice_service: PracticeServiceDep,
) -> Response:
    await practice_service.retry_task(current_user, practice_id, round_id=round_id)
    return Response(status_code=status.HTTP_202_ACCEPTED)
