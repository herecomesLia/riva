from fastapi import APIRouter, status

from riva.api.auth import router as auth_router
from riva.api.errors import error_responses
from riva.api.health import router as health_router
from riva.api.users import router as users_router

router = APIRouter()
router.include_router(
    auth_router,
    responses=error_responses(status.HTTP_500_INTERNAL_SERVER_ERROR),
)
router.include_router(
    health_router,
    responses=error_responses(status.HTTP_500_INTERNAL_SERVER_ERROR),
)
router.include_router(
    users_router,
    responses=error_responses(status.HTTP_500_INTERNAL_SERVER_ERROR),
)
