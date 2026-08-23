from fastapi import APIRouter

from riva.api.auth import router as auth_router
from riva.api.dashboard import router as dashboard_router
from riva.api.health import router as health_router
from riva.api.interview import router as interview_router
from riva.api.jobs import router as jobs_router
from riva.api.practice import router as practice_router
from riva.api.profile import router as profile_router
from riva.api.resumes import router as resume_router
from riva.api.training import router as training_router
from riva.api.users import router as users_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(dashboard_router)
router.include_router(health_router)
router.include_router(interview_router)
router.include_router(jobs_router)
router.include_router(practice_router)
router.include_router(profile_router)
router.include_router(resume_router)
router.include_router(training_router)
router.include_router(users_router)
