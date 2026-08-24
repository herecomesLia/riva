from urllib.parse import urlsplit

from fastapi import Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from riva.api.cookies import set_session_cookie
from riva.core.config import Settings
from riva.db import require_db_session
from riva.integrations import (
    LLMProvider,
    LLMProviderConfigurationError,
    build_llm_provider,
)
from riva.models import User
from riva.services.dashboard.dashboard import DashboardService
from riva.services.errors import (
    AuthenticationRequiredError,
    ExternalDependencyError,
    PermissionDeniedError,
)
from riva.services.interview.workflow import InterviewService
from riva.services.jobs.jd_import import (
    JobDescriptionImportDraftService,
)
from riva.services.jobs.roles import TargetRoleService
from riva.services.practice.cards import QuestionCardService
from riva.services.practice.workflow import PracticeService
from riva.services.profile.service import ProfileService
from riva.services.training.competencies import CompetencyService
from riva.services.training.planning import TrainingPlanningService
from riva.services.training.record_answers import (
    TrainingRecordReferenceAnswerService,
)
from riva.services.training.records import TrainingRecordService
from riva.services.user import AuthSessionConfig, UserService

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _configured_llm_provider(request: Request) -> LLMProvider | None:
    settings: Settings = request.app.state.settings
    if not settings.llm_provider or not settings.llm_model:
        return None
    try:
        return build_llm_provider(settings)
    except LLMProviderConfigurationError:
        raise ExternalDependencyError("llm_unavailable") from None


def require_llm_provider(request: Request) -> LLMProvider:
    provider = _configured_llm_provider(request)
    if provider is None:
        raise ExternalDependencyError("llm_unavailable")
    return provider


async def require_user_service(
    request: Request,
    session: AsyncSession = Depends(require_db_session),
) -> UserService:
    settings = request.app.state.settings
    return UserService(
        session,
        AuthSessionConfig(
            session_digest_key=settings.session_digest_key,
            session_idle_timeout_seconds=settings.session_idle_timeout_seconds,
            session_refresh_interval_seconds=settings.session_refresh_interval_seconds,
        ),
    )


async def require_current_user(
    request: Request,
    response: Response,
    user_service: UserService = Depends(require_user_service),
) -> User:
    settings = request.app.state.settings
    token = request.cookies.get(settings.session_cookie_name)
    if token is None:
        raise AuthenticationRequiredError("not_authenticated")

    current_session = await user_service.current_session(token)
    if current_session.refreshed:
        set_session_cookie(response, settings, current_session.token)
    return current_session.user


async def require_csrf(request: Request) -> None:
    if request.method.upper() not in UNSAFE_METHODS:
        return

    settings: Settings = request.app.state.settings
    origin = request.headers.get("origin")
    if origin is not None:
        if _is_allowed_source(origin, request, settings):
            return
        raise PermissionDeniedError("csrf_failed")

    referer = request.headers.get("referer")
    if referer is not None and _is_allowed_source(referer, request, settings):
        return

    raise PermissionDeniedError("csrf_failed")


async def require_competency_service(
    session: AsyncSession = Depends(require_db_session),
) -> CompetencyService:
    return CompetencyService(session)


async def require_dashboard_service(
    session: AsyncSession = Depends(require_db_session),
) -> DashboardService:
    return DashboardService(session)


async def require_interview_service(
    request: Request,
    session: AsyncSession = Depends(require_db_session),
) -> InterviewService:
    settings = request.app.state.settings
    return InterviewService(
        session,
        llm_provider=_configured_llm_provider(request),
        llm_model=settings.llm_model,
    )


async def require_job_description_import_service(
    request: Request,
    session: AsyncSession = Depends(require_db_session),
) -> JobDescriptionImportDraftService:
    settings = request.app.state.settings
    return JobDescriptionImportDraftService(
        session,
        llm_provider=_configured_llm_provider(request),
        llm_model=settings.llm_model,
    )


async def require_practice_service(
    request: Request,
    session: AsyncSession = Depends(require_db_session),
) -> PracticeService:
    settings = request.app.state.settings
    return PracticeService(
        session,
        llm_provider=_configured_llm_provider(request),
        llm_model=settings.llm_model,
    )


async def require_profile_service(
    request: Request,
    session: AsyncSession = Depends(require_db_session),
) -> ProfileService:
    settings = request.app.state.settings
    return ProfileService(
        session=session,
        extractor=request.app.state.profile_resume_extractor,
        llm_provider=_configured_llm_provider(request),
        llm_model=settings.llm_model,
        max_upload_bytes=settings.resume_max_upload_bytes,
        max_extracted_characters=settings.resume_max_extracted_characters,
    )


async def require_target_role_service(
    request: Request,
    session: AsyncSession = Depends(require_db_session),
) -> TargetRoleService:
    settings = request.app.state.settings
    return TargetRoleService(
        session,
        llm_provider=_configured_llm_provider(request),
        llm_model=settings.llm_model,
    )


async def require_question_card_service(
    request: Request,
    session: AsyncSession = Depends(require_db_session),
) -> QuestionCardService:
    settings = request.app.state.settings
    return QuestionCardService(
        session,
        llm_provider=_configured_llm_provider(request),
        llm_model=settings.llm_model,
    )


async def require_training_planning_service(
    request: Request,
    session: AsyncSession = Depends(require_db_session),
) -> TrainingPlanningService:
    settings = request.app.state.settings
    return TrainingPlanningService(
        session,
        llm_provider=_configured_llm_provider(request),
        llm_model=settings.llm_model,
    )


async def require_training_record_service(
    session: AsyncSession = Depends(require_db_session),
) -> TrainingRecordService:
    return TrainingRecordService(session)


async def require_training_record_reference_answer_service(
    request: Request,
    session: AsyncSession = Depends(require_db_session),
) -> TrainingRecordReferenceAnswerService:
    settings = request.app.state.settings
    return TrainingRecordReferenceAnswerService(
        session,
        llm_provider=_configured_llm_provider(request),
        llm_model=settings.llm_model,
    )


def _is_allowed_source(source: str, request: Request, settings: Settings) -> bool:
    source_origin = _origin_from_url(source)
    if source_origin is None:
        return False

    return source_origin == _request_origin(request) or source_origin in {
        _origin_from_url(origin) for origin in settings.cors_allowed_origins
    }


def _request_origin(request: Request) -> str:
    host = request.headers.get("host") or request.url.netloc
    return f"{request.url.scheme}://{host}"


def _origin_from_url(value: str) -> str | None:
    parsed = urlsplit(value)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"
