"""
V1 API router - aggregates all routes.
"""
from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.candidates import router as candidates_router
from app.api.v1.recruiters import router as recruiters_router
from app.api.v1.admin import router as admin_router

router = APIRouter()

router.include_router(auth_router)
router.include_router(candidates_router)
router.include_router(recruiters_router)
router.include_router(admin_router)
