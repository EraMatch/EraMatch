"""
Candidate endpoints.
"""
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.api.deps import DbSession, CurrentUser
from app.services import CandidateService
from app.schemas import (
    CandidateCreate,
    CandidateUpdate,
    CandidateResponse,
    ApplicationCreate,
    ApplicationResponse,
)

router = APIRouter(prefix="/candidates", tags=["Candidates"])


@router.post("", response_model=CandidateResponse, status_code=201)
async def create_candidate(
    data: CandidateCreate, session: DbSession, current_user: CurrentUser
):
    """Create a new candidate profile."""
    service = CandidateService(session, current_user.organization_id)
    return await service.create_profile(data)


@router.get("", response_model=list[CandidateResponse])
async def list_candidates(
    session: DbSession,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 50,
):
    """List all candidates."""
    service = CandidateService(session, current_user.organization_id)
    return await service.list_profiles(skip=skip, limit=limit)


@router.get("/{candidate_id}", response_model=CandidateResponse)
async def get_candidate(
    candidate_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get a candidate by ID."""
    service = CandidateService(session, current_user.organization_id)
    candidate = await service.get_profile(candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate


@router.patch("/{candidate_id}", response_model=CandidateResponse)
async def update_candidate(
    candidate_id: UUID,
    data: CandidateUpdate,
    session: DbSession,
    current_user: CurrentUser,
):
    """Update a candidate profile."""
    service = CandidateService(session, current_user.organization_id)
    return await service.update_profile(candidate_id, data)


# =============================================================================
# APPLICATION ENDPOINTS
# =============================================================================


@router.post(
    "/{candidate_id}/applications",
    response_model=ApplicationResponse,
    status_code=201,
)
async def create_application(
    candidate_id: UUID,
    data: ApplicationCreate,
    session: DbSession,
    current_user: CurrentUser,
):
    """Create an application for a candidate."""
    service = CandidateService(session, current_user.organization_id)
    return await service.create_application(candidate_id, data)


@router.get(
    "/{candidate_id}/applications",
    response_model=list[ApplicationResponse],
)
async def list_candidate_applications(
    candidate_id: UUID, session: DbSession, current_user: CurrentUser
):
    """List applications for a candidate."""
    service = CandidateService(session, current_user.organization_id)
    return await service.list_applications_by_candidate(candidate_id)
@router.get("/{candidate_id}/suspect-review", response_model=list[dict])
async def get_suspect_review(
    candidate_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get suspect review activities for a candidate."""
    service = CandidateService(session, current_user.organization_id)
    return await service.get_suspect_review(candidate_id)


@router.get("/{candidate_id}/knowledge-graph", response_model=dict)
async def get_knowledge_graph(
    candidate_id: UUID, session: DbSession, current_user: CurrentUser
):
    """Get knowledge graph data for a candidate."""
    service = CandidateService(session, current_user.organization_id)
    return await service.get_knowledge_graph(candidate_id)
