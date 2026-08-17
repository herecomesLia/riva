from fastapi import APIRouter

from riva.api.auth import router as auth_router
from riva.api.competencies import router as competencies_router
from riva.api.health import router as health_router
from riva.api.interview import router as interview_router
from riva.api.profile import router as profile_router
from riva.api.practice import router as practice_router
from riva.api.question_cards import router as question_cards_router
from riva.api.resumes import router as resume_router
from riva.api.roles import router as roles_router
from riva.api.training_records import router as training_records_router
from riva.api.users import router as users_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(competencies_router)
router.include_router(health_router)
router.include_router(interview_router)
router.include_router(profile_router)
router.include_router(practice_router)
router.include_router(question_cards_router)
router.include_router(resume_router)
router.include_router(roles_router)
router.include_router(training_records_router)
router.include_router(users_router)
