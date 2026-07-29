from fastapi import APIRouter

from riva.api.auth import router as auth_router
from riva.api.health import router as health_router
from riva.api.profile import router as profile_router
from riva.api.roles import router as roles_router
from riva.api.users import router as users_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(health_router)
router.include_router(profile_router)
router.include_router(roles_router)
router.include_router(users_router)
