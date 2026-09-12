from collections.abc import AsyncIterator
from typing import Annotated

import structlog
from fastapi import Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from riva.api.cookies import set_session_cookie
from riva.api.errors import AuthRequiredError
from riva.core.config import Settings
from riva.db import Database
from riva.llm import LLMClient
from riva.models import User
from riva.services.career_profiles import CareerProfileService
from riva.services.job_descriptions import JobDescriptionService
from riva.services.roles import RoleService
from riva.services.users import UserService


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_database(request: Request) -> Database:
    return request.app.state.database


DatabaseDep = Annotated[Database, Depends(get_database)]


async def get_db_session(database: DatabaseDep) -> AsyncIterator[AsyncSession]:
    async with database.sessionmaker() as session:
        yield session


DbSessionDep = Annotated[AsyncSession, Depends(get_db_session)]


def get_llm(request: Request) -> LLMClient:
    return request.app.state.llm


LLMClientDep = Annotated[LLMClient, Depends(get_llm)]


async def get_user_service(
    session: DbSessionDep,
    settings: SettingsDep,
) -> UserService:
    return UserService(session, settings)


UserServiceDep = Annotated[UserService, Depends(get_user_service)]


async def require_current_user(
    request: Request,
    response: Response,
    user_service: UserServiceDep,
    settings: SettingsDep,
) -> User:
    token = request.cookies.get(settings.session.cookie_name)
    if token is None:
        raise AuthRequiredError()

    session_state = await user_service.get_current_session(token)
    user = session_state.user
    structlog.contextvars.bind_contextvars(user_id=str(user.id))
    if session_state.refreshed:
        set_session_cookie(response, token, settings)
    return user


CurrentUserDep = Annotated[User, Depends(require_current_user)]


async def get_career_profile_service(
    session: DbSessionDep,
) -> CareerProfileService:
    return CareerProfileService(session)


CareerProfileServiceDep = Annotated[
    CareerProfileService,
    Depends(get_career_profile_service),
]


async def get_role_service(
    session: DbSessionDep,
) -> RoleService:
    return RoleService(session)


RoleServiceDep = Annotated[
    RoleService,
    Depends(get_role_service),
]


async def get_job_description_service(session: DbSessionDep) -> JobDescriptionService:
    return JobDescriptionService(session)


JobDescriptionServiceDep = Annotated[
    JobDescriptionService,
    Depends(get_job_description_service),
]
