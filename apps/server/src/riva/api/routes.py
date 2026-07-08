from fastapi import APIRouter

from riva.api.auth import router as auth_router
from riva.api.health import router as health_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(health_router)
