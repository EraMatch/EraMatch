"""
Candidate Portal Routes.

Endpoints for candidate login, dashboard, and assessments.
These are used by the candidate-portal frontend.
"""
from fastapi import APIRouter

from app.api.deps import DbSession, CurrentCandidate
from app.services import CandidateAuthService
from app.schemas import (
    CandidateLoginRequest,
    CandidateAuthResponse,
    TokenResponse,
    RefreshRequest,
)

router = APIRouter(prefix="/candidate", tags=["Candidate Portal"])


# =============================================================================
# AUTHENTICATION
# =============================================================================

@router.post("/login", response_model=TokenResponse)
async def candidate_login(data: CandidateLoginRequest, session: DbSession):
    """
    Candidate login with email and password.
    
    Returns access and refresh tokens.
    """
    service = CandidateAuthService(session)
    return await service.login(data.email, data.password)


@router.post("/refresh", response_model=TokenResponse)
async def candidate_refresh(data: RefreshRequest, session: DbSession):
    """
    Refresh candidate access token.
    """
    service = CandidateAuthService(session)
    return await service.refresh_tokens(data.refresh_token)


@router.get("/me", response_model=CandidateAuthResponse)
async def get_candidate_me(candidate: CurrentCandidate):
    """
    Get current authenticated candidate profile.
    """
    return candidate


# =============================================================================
# DASHBOARD
# =============================================================================

@router.get("/home")
async def get_candidate_home(candidate: CurrentCandidate, session: DbSession):
    """
    Get candidate dashboard home data.
    
    Returns:
        - Candidate profile
        - Current application status
        - Group info
        - Current stage info
    """
    from app.services.candidates import CandidateDashboardService
    
    service = CandidateDashboardService(session)
    return await service.get_home(candidate.candidate_id)


@router.get("/assessments")
async def get_candidate_assessments(candidate: CurrentCandidate, session: DbSession):
    """
    Get available assessments/stages for the candidate.
    
    Returns list of stages with their status (locked, unlocked, in_progress, completed).
    """
    from app.services.candidates import CandidateDashboardService
    
    service = CandidateDashboardService(session)
    return await service.get_assessments(candidate.candidate_id)
