from fastapi import APIRouter

from riva.api.auth import router as auth_router
from riva.api.career_profile import router as career_profile_router
from riva.api.errors.openapi import error_responses
from riva.api.health import router as health_router
from riva.api.practices import router as practices_router
from riva.api.roles import router as roles_router
from riva.api.users import router as users_router

router = APIRouter()
router.include_router(
    auth_router,
    responses=error_responses(Exception),
)
router.include_router(
    health_router,
    responses=error_responses(Exception),
)
router.include_router(
    users_router,
    responses=error_responses(Exception),
)
router.include_router(
    career_profile_router,
    responses=error_responses(Exception),
)
router.include_router(
    roles_router,
    responses=error_responses(Exception),
)
router.include_router(
    practices_router,
    responses=error_responses(Exception),
)
