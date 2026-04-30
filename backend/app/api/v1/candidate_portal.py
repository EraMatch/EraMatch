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
    Candidate login with username and password.
    
    Returns access and refresh tokens.
    """
    service = CandidateAuthService(session)
    return await service.login(data.username, data.password)


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

from typing import Optional
from fastapi import Header

@router.get("/home")
async def get_candidate_home(
    candidate: CurrentCandidate, 
    session: DbSession,
    x_group_id: Optional[str] = Header(None)
):
    """
    Get candidate dashboard home data.
    
    Returns:
        - Candidate profile
        - Current application status
        - Group info
        - Current stage info
    """
    from app.services.candidates import CandidateDashboardService
    from uuid import UUID
    
    service = CandidateDashboardService(session)
    group_id_val = UUID(x_group_id) if x_group_id else None
    return await service.get_home(candidate.candidate_id, group_id=group_id_val)


@router.get("/assessments")
async def get_candidate_assessments(
    candidate: CurrentCandidate, 
    session: DbSession,
    x_group_id: Optional[str] = Header(None)
):
    """
    Get available assessments/stages for the candidate.
    
    Returns list of stages with their status (locked, unlocked, in_progress, completed).
    """
    from app.services.candidates import CandidateDashboardService
    from uuid import UUID
    
    service = CandidateDashboardService(session)
    group_id_val = UUID(x_group_id) if x_group_id else None
    return await service.get_assessments(candidate.candidate_id, group_id=group_id_val)


@router.post("/stages/{stage_type}/start")
async def start_candidate_stage(
    stage_type: str,
    candidate: CurrentCandidate,session: DbSession ) -> dict:
 

    # placeholder for now, but will be used to go to details of a stage 

    # Map stage types to frontend routes
    route_map = {
        "assessment": "/assessment/technical",
        "ai_interview": "/assessment/recorded",
        "live_interview": "/assessment/live",
    }
    
    redirect_url = route_map.get(stage_type, f"/assessment/{stage_type.replace('_', '-')}")
    
    return {
        "message": f"Starting {stage_type.replace('_', ' ')} stage",
        "stage_type": stage_type,
        "redirect_url": redirect_url,
        "status": "pending_implementation",
        "candidate_id": str(candidate.candidate_id),
    }
